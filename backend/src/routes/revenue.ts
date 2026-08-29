// backend/src/routes/revenue.ts
import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// ============================================
// GET /revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
// Admin: full hotel revenue. Staff: only their own entries.
// ============================================
router.get("/", requireAuth, async (req, res) => {
  const { role, userId, hotelId } = req.user!;

  const from = req.query.from as string;
  const to = req.query.to as string;

  if (!from || !to) {
    return res.status(400).json({ error: "from and to dates are required" });
  }

  try {
    // Daily rollup
    const dailyQuery =
      role === "admin"
        ? `SELECT entry_date, SUM(sales_qty * unit_price) AS revenue
           FROM stock_entries
           WHERE hotel_id = $1 AND entry_date >= $2 AND entry_date <= $3
           GROUP BY entry_date
           ORDER BY entry_date ASC`
        : `SELECT entry_date, SUM(sales_qty * unit_price) AS revenue
           FROM stock_entries
           WHERE hotel_id = $1 AND entry_date >= $2 AND entry_date <= $3 AND submitted_by = $4
           GROUP BY entry_date
           ORDER BY entry_date ASC`;

    const dailyValues =
      role === "admin" ? [hotelId, from, to] : [hotelId, from, to, userId];
    const dailyResult = await pool.query(dailyQuery, dailyValues);

    // Per-product line items
    const detailQuery =
      role === "admin"
        ? `SELECT se.entry_date, p.name AS product_name,
                  se.sales_qty, se.unit_price, (se.sales_qty * se.unit_price) AS amount
           FROM stock_entries se
           JOIN products p ON p.id = se.product_id
           WHERE se.hotel_id = $1 AND se.entry_date >= $2 AND se.entry_date <= $3
           ORDER BY se.entry_date ASC, p.name ASC`
        : `SELECT se.entry_date, p.name AS product_name,
                  se.sales_qty, se.unit_price, (se.sales_qty * se.unit_price) AS amount
           FROM stock_entries se
           JOIN products p ON p.id = se.product_id
           WHERE se.hotel_id = $1 AND se.entry_date >= $2 AND se.entry_date <= $3
                 AND se.submitted_by = $4
           ORDER BY se.entry_date ASC, p.name ASC`;

    const detailValues =
      role === "admin" ? [hotelId, from, to] : [hotelId, from, to, userId];
    const detailResult = await pool.query(detailQuery, detailValues);

    // Grand total
    const totalQuery =
      role === "admin"
        ? `SELECT COALESCE(SUM(sales_qty * unit_price), 0) AS total
           FROM stock_entries
           WHERE hotel_id = $1 AND entry_date >= $2 AND entry_date <= $3`
        : `SELECT COALESCE(SUM(sales_qty * unit_price), 0) AS total
           FROM stock_entries
           WHERE hotel_id = $1 AND entry_date >= $2 AND entry_date <= $3 AND submitted_by = $4`;

    const totalValues =
      role === "admin" ? [hotelId, from, to] : [hotelId, from, to, userId];
    const totalResult = await pool.query(totalQuery, totalValues);

    res.json({
      from,
      to,
      total_revenue: Number(totalResult.rows[0].total),
      daily: dailyResult.rows.map((r) => ({
        date: r.entry_date,
        revenue: Number(r.revenue),
      })),
      details: detailResult.rows.map((r) => ({
        date: r.entry_date,
        product_name: r.product_name,
        sales_qty: Number(r.sales_qty),
        unit_price: Number(r.unit_price),
        amount: Number(r.amount),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch revenue" });
  }
});

export default router;
