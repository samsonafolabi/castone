// backend/src/routes/products.ts
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

const createProductSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  unit_price: z.number().positive(),
  initial_quantity: z.number().min(0), // now required, no .optional()
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.string().optional(),
});

const priceUpdateSchema = z.object({
  unit_price: z.number().positive(),
});

// ============================================
// POST /products — create product (admin only)
// Optionally seeds the first stock_entries row (Day 1 opening stock)
// ============================================
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { name, category, unit_price, initial_quantity } = parsed.data;
  const hotelId = req.user!.hotelId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productResult = await client.query(
      `INSERT INTO products (hotel_id, name, category, unit_price)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [hotelId, name, category, unit_price],
    );
    const product = productResult.rows[0];

    // always seed Day 1 stock entry now — no longer conditional
    await client.query(
      `INSERT INTO stock_entries (
        hotel_id, product_id, entry_date, opening_stock, purchases,
        sales_qty, closing_stock, unit_price, submitted_by
      ) VALUES ($1, $2, CURRENT_DATE, $3, 0, 0, $3, $4, $5)`,
      [hotelId, product.id, initial_quantity, unit_price, req.user!.userId],
    );

    await client.query("COMMIT");
    res.status(201).json(product);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create product" });
  } finally {
    client.release();
  }
});

// ============================================
// GET /products — list catalog (staff + admin)
// ============================================
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, 
        COALESCE(
          (SELECT closing_stock FROM stock_entries se 
           WHERE se.product_id = p.id 
           ORDER BY se.entry_date DESC LIMIT 1), 
          0
        ) AS current_stock
       FROM products p 
       WHERE p.hotel_id = $1 AND p.deleted_at IS NULL 
       ORDER BY p.name`,
      [req.user!.hotelId],
    );
    const rows = result.rows.map((r) => ({
      ...r,
      unit_price: Number(r.unit_price),
      current_stock: Number(r.current_stock),
    }));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});
// ============================================
// PATCH /products/:id — edit name/category (admin only)
// ============================================
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const fields = Object.keys(parsed.data);
  if (fields.length === 0)
    return res.status(400).json({ error: "No fields to update" });

  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) => (parsed.data as any)[f]);

  try {
    const result = await pool.query(
      `UPDATE products SET ${setClause}
       WHERE id = $${fields.length + 1} AND hotel_id = $${fields.length + 2} AND deleted_at IS NULL
       RETURNING *`,
      [...values, req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// ============================================
// PATCH /products/:id/price — price change only (admin only, separate route)
// ============================================
router.patch("/:id/price", requireAuth, requireAdmin, async (req, res) => {
  const parsed = priceUpdateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await pool.query(
      `UPDATE products SET unit_price = $1
       WHERE id = $2 AND hotel_id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [parsed.data.unit_price, req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update price" });
  }
});

// ============================================
// DELETE /products/:id — soft delete (admin only)
// ============================================
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE products SET deleted_at = now()
       WHERE id = $1 AND hotel_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Product not found" });
    res.json({ message: "Product removed", id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete product" });
  }
});

export default router;
