import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

const closeSchema = z.object({ count_date: z.string() });

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = closeSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { count_date } = parsed.data;
  const hotelId = req.user!.hotelId;
  const userId = req.user!.userId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Guard: count must exist before closing
    const countsResult = await client.query(
      `SELECT * FROM monthly_stock_counts WHERE hotel_id = $1 AND count_date = $2`,
      [hotelId, count_date],
    );
    if (countsResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error:
          "No stock count found for this date. Submit a count before closing.",
      });
    }

    // Guard: don't double-close
    const existingClose = await client.query(
      `SELECT id FROM monthly_closes WHERE hotel_id = $1 AND count_date = $2`,
      [hotelId, count_date],
    );
    if (existingClose.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "This period has already been closed." });
    }

    // period_start = day after the last close, or earliest data if this is the first close
    const lastCloseResult = await client.query(
      `SELECT count_date FROM monthly_closes WHERE hotel_id = $1 ORDER BY count_date DESC LIMIT 1`,
      [hotelId],
    );
    let period_start: string;
    if (lastCloseResult.rows.length > 0) {
      const d = new Date(lastCloseResult.rows[0].count_date + "T00:00:00");
      d.setDate(d.getDate() + 1);
      period_start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } else {
      const earliestResult = await client.query(
        `SELECT MIN(entry_date) AS earliest FROM stock_entries WHERE hotel_id = $1`,
        [hotelId],
      );
      period_start = earliestResult.rows[0].earliest ?? count_date;
    }

    // Revenue for the period being closed (period_start through count_date, inclusive)
    const revenueResult = await client.query(
      `SELECT COALESCE(SUM(sales_qty * unit_price), 0) AS total
       FROM stock_entries WHERE hotel_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
      [hotelId, period_start, count_date],
    );
    const total_revenue = Number(revenueResult.rows[0].total);

    // Reset entry lands the day AFTER count_date — count_date itself stays untouched (normal day)
    const resetDateObj = new Date(count_date + "T00:00:00");
    resetDateObj.setDate(resetDateObj.getDate() + 1);
    const resetDate = `${resetDateObj.getFullYear()}-${String(resetDateObj.getMonth() + 1).padStart(2, "0")}-${String(resetDateObj.getDate()).padStart(2, "0")}`;

    for (const count of countsResult.rows) {
      const productResult = await client.query(
        `SELECT unit_price FROM products WHERE id = $1`,
        [count.product_id],
      );
      const unit_price = Number(productResult.rows[0]?.unit_price ?? 0);
      const physical_count = Number(count.physical_count);

      // If staff already logged real activity for resetDate, preserve their purchases/sales —
      // only correct the opening_stock and recompute closing_stock from it
      await client.query(
        `INSERT INTO stock_entries (
          hotel_id, product_id, entry_date, opening_stock, purchases,
          sales_qty, closing_stock, unit_price, submitted_by, entry_type
        ) VALUES ($1,$2,$3,$4,0,0,$4,$5,$6,'month_reset')
        ON CONFLICT (hotel_id, product_id, entry_date)
        DO UPDATE SET
          opening_stock = EXCLUDED.opening_stock,
          closing_stock = EXCLUDED.opening_stock + stock_entries.purchases - stock_entries.sales_qty,
          entry_type = 'month_reset'`,
        [
          hotelId,
          count.product_id,
          resetDate,
          physical_count,
          unit_price,
          userId,
        ],
      );
    }

    const closeResult = await client.query(
      `INSERT INTO monthly_closes (hotel_id, count_date, period_start, period_end, total_revenue, closed_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [hotelId, count_date, period_start, count_date, total_revenue, userId],
    );

    await client.query("COMMIT");
    res.status(201).json(closeResult.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to close period" });
  } finally {
    client.release();
  }
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM monthly_closes WHERE hotel_id = $1 ORDER BY count_date DESC`,
      [req.user!.hotelId],
    );
    const rows = result.rows.map((r) => ({
      ...r,
      total_revenue: Number(r.total_revenue),
    }));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch close history" });
  }
});
export default router;
