import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

const countSchema = z.object({
  count_date: z.string().optional(),
  counts: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        physical_count: z.number().min(0),
      }),
    )
    .min(1),
});

// ============================================
// POST /monthly-stock-counts — bulk submit (admin only, one sitting, all products)
// ============================================
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = countSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const count_date =
    parsed.data.count_date ?? new Date().toISOString().slice(0, 10);
  const hotelId = req.user!.hotelId;
  const userId = req.user!.userId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Guard: don't allow re-counting a date that's already been closed
    const lastCloseResult = await client.query(
      `SELECT count_date FROM monthly_closes WHERE hotel_id = $1 ORDER BY count_date DESC LIMIT 1`,
      [hotelId],
    );
    if (
      lastCloseResult.rows.length > 0 &&
      count_date === lastCloseResult.rows[0].count_date
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `${lastCloseResult.rows[0].count_date} has already been closed and reconciled. Choose a later date.`,
      });
    }

    const results = [];

    for (const { product_id, physical_count } of parsed.data.counts) {
      // Check if a month_reset row landed exactly on count_date (i.e. today is the
      // day right after a prior close). If so, that reset's opening_stock IS the
      // authoritative starting number for today — use it directly rather than
      // looking at the day before, which would be stale pre-correction data.
      const resetTodayResult = await client.query(
        `SELECT opening_stock FROM stock_entries
         WHERE hotel_id = $1 AND product_id = $2 AND entry_date = $3 AND entry_type = 'month_reset'`,
        [hotelId, product_id, count_date],
      );

      let system_closing_stock: number;

      if (resetTodayResult.rows.length > 0) {
        system_closing_stock = Number(resetTodayResult.rows[0].opening_stock);
      } else {
        // No reset today — fall back to the last fully-settled day before count_date
        const priorResult = await client.query(
          `SELECT closing_stock FROM stock_entries
           WHERE hotel_id = $1 AND product_id = $2 AND entry_date < $3
           ORDER BY entry_date DESC LIMIT 1`,
          [hotelId, product_id, count_date],
        );
        system_closing_stock =
          priorResult.rows.length > 0
            ? Number(priorResult.rows[0].closing_stock)
            : 0;
      }

      const discrepancy = physical_count - system_closing_stock;
      const status = discrepancy === 0 ? "ok" : "flagged";

      const insertResult = await client.query(
        `INSERT INTO monthly_stock_counts (
          hotel_id, product_id, count_date, system_closing_stock, physical_count, discrepancy, status, counted_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (hotel_id, product_id, count_date)
        DO UPDATE SET
          system_closing_stock = EXCLUDED.system_closing_stock,
          physical_count = EXCLUDED.physical_count,
          discrepancy = EXCLUDED.discrepancy,
          status = EXCLUDED.status,
          counted_by = EXCLUDED.counted_by,
          created_at = now()
        RETURNING *`,
        [
          hotelId,
          product_id,
          count_date,
          system_closing_stock,
          physical_count,
          discrepancy,
          status,
          userId,
        ],
      );
      results.push(insertResult.rows[0]);
    }

    await client.query("COMMIT");
    res.status(201).json({ count_date, results });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to save stock count" });
  } finally {
    client.release();
  }
});

// GET /monthly-stock-counts?count_date=... — review screen data (admin only)
// If count_date is omitted, returns the most recent count available.
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  let count_date = req.query.count_date as string | undefined;

  try {
    if (!count_date) {
      const latestResult = await pool.query(
        `SELECT MAX(count_date) AS latest FROM monthly_stock_counts WHERE hotel_id = $1`,
        [req.user!.hotelId],
      );
      count_date = latestResult.rows[0]?.latest;
      if (!count_date) return res.json([]);
    }

    const result = await pool.query(
      `SELECT msc.*, p.name AS product_name FROM monthly_stock_counts msc
       JOIN products p ON p.id = msc.product_id
       WHERE msc.hotel_id = $1 AND msc.count_date = $2
       ORDER BY p.name`,
      [req.user!.hotelId, count_date],
    );
    const rows = result.rows.map((r) => ({
      ...r,
      system_closing_stock: Number(r.system_closing_stock),
      physical_count: Number(r.physical_count),
      discrepancy: Number(r.discrepancy),
    }));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stock counts" });
  }
});

// ============================================
// PATCH /monthly-stock-counts/:id — add admin note, mark reviewed
// ============================================
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { admin_note } = req.body;
  try {
    const result = await pool.query(
      `UPDATE monthly_stock_counts
       SET admin_note = $1, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 AND hotel_id = $4
       RETURNING *`,
      [admin_note, req.user!.userId, req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Record not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update record" });
  }
});

export default router;
