// backend/src/routes/stockEntries.ts
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

const entrySchema = z.object({
  product_id: z.string().uuid(),
  sales_qty: z.number().min(0),
  purchases: z.number().min(0).default(0),
  entry_date: z.string().optional(),
});

// ============================================
// POST /stock-entries — daily entry (staff or admin)
// ============================================
router.post("/", requireAuth, async (req, res) => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { product_id, sales_qty, purchases } = parsed.data;
  const entry_date =
    parsed.data.entry_date ?? new Date().toISOString().slice(0, 10);
  const hotelId = req.user!.hotelId;
  const userId = req.user!.userId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Confirm product exists, belongs to this hotel, get current price
    const productResult = await client.query(
      `SELECT id, unit_price FROM products 
       WHERE id = $1 AND hotel_id = $2 AND deleted_at IS NULL`,
      [product_id, hotelId],
    );
    if (productResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }
    const unit_price = Number(productResult.rows[0].unit_price);

    // 2. Determine opening_stock — reuse today's if it exists, else carry from prior day
    const todayResult = await client.query(
      `SELECT opening_stock FROM stock_entries
       WHERE hotel_id = $1 AND product_id = $2 AND entry_date = $3`,
      [hotelId, product_id, entry_date],
    );

    let opening_stock: number;

    if (todayResult.rows.length > 0) {
      opening_stock = Number(todayResult.rows[0].opening_stock);
    } else {
      const priorResult = await client.query(
        `SELECT closing_stock FROM stock_entries
         WHERE hotel_id = $1 AND product_id = $2 AND entry_date < $3
         ORDER BY entry_date DESC LIMIT 1`,
        [hotelId, product_id, entry_date],
      );
      if (priorResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error:
            "No opening stock found for this product. It may not have been initialized with a starting quantity.",
        });
      }
      opening_stock = Number(priorResult.rows[0].closing_stock);
    }

    // 3. Compute closing stock — all operands now guaranteed to be numbers
    const closing_stock = opening_stock + purchases - sales_qty;
    if (closing_stock < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Sales quantity exceeds available stock. Opening: ${opening_stock}, Purchases: ${purchases}, Sales: ${sales_qty}`,
      });
    }

    // 4. Insert or update today's entry
    const result = await client.query(
      `INSERT INTO stock_entries (
        hotel_id, product_id, entry_date, opening_stock, purchases,
        sales_qty, closing_stock, unit_price, submitted_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (hotel_id, product_id, entry_date)
      DO UPDATE SET
        purchases = EXCLUDED.purchases,
        sales_qty = EXCLUDED.sales_qty,
        closing_stock = EXCLUDED.closing_stock,
        unit_price = EXCLUDED.unit_price,
        submitted_by = EXCLUDED.submitted_by,
        submitted_at = now()
      RETURNING *`,
      [
        hotelId,
        product_id,
        entry_date,
        opening_stock,
        purchases,
        sales_qty,
        closing_stock,
        unit_price,
        userId,
      ],
    );

    await client.query("COMMIT");
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to save stock entry" });
  } finally {
    client.release();
  }
});

// ============================================
// GET /stock-entries — today's entries
// Admin sees all; staff sees only their own submissions
// ============================================
router.get("/", requireAuth, async (req, res) => {
  const { role, userId, hotelId } = req.user!;
  const date =
    (req.query.date as string) ?? new Date().toISOString().slice(0, 10);

  try {
    const query =
      role === "admin"
        ? `SELECT se.*, p.name AS product_name FROM stock_entries se
           JOIN products p ON p.id = se.product_id
           WHERE se.hotel_id = $1 AND se.entry_date = $2
           ORDER BY p.name`
        : `SELECT se.*, p.name AS product_name FROM stock_entries se
           JOIN products p ON p.id = se.product_id
           WHERE se.hotel_id = $1 AND se.entry_date = $2 AND se.submitted_by = $3
           ORDER BY p.name`;

    const values = role === "admin" ? [hotelId, date] : [hotelId, date, userId];
    const result = await pool.query(query, values);

    const rows = result.rows.map((r) => {
      const sales_qty = Number(r.sales_qty);
      const unit_price = Number(r.unit_price);

      return {
        ...r,
        opening_stock: Number(r.opening_stock),
        purchases: Number(r.purchases),
        sales_qty,
        closing_stock: Number(r.closing_stock),
        unit_price,
        amount: sales_qty * unit_price, // NEW — revenue for this product, today
      };
    });

    // Day total — sum of every product's amount
    const day_total = rows.reduce((sum, r) => sum + r.amount, 0);

    res.json({
      entries: rows,
      day_total, // full total — admin only, per our earlier decision
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stock entries" });
  }
});

export default router;
