import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

const userSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "staff"]),
});

// ============================================
// POST /users — create a user (admin only)
// ============================================
router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const parsed = userSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { full_name, email, password, role } = parsed.data;
  const hotelId = req.user!.hotelId;

  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (hotel_id, full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, hotel_id, full_name, email, role, is_active, created_at`,
      [hotelId, full_name, email, password_hash, role],
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error(err);
    if (err.code === "23505")
      return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: "Failed to create user" });
  }
});

// ============================================
// GET /users — list users for the logged-in admin's hotel
// ============================================
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, hotel_id, full_name, email, role, is_active, created_at 
       FROM users WHERE hotel_id = $1 AND deleted_at IS NULL`,
      [req.user!.hotelId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ============================================
// PATCH /users/me — update own profile (any authenticated user)
// MUST come before /:id so Express doesn't treat "me" as an ID
// ============================================
const selfUpdateSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = selfUpdateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const fields = Object.keys(parsed.data);
  if (fields.length === 0)
    return res.status(400).json({ error: "No fields to update" });

  const updates: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (parsed.data.full_name !== undefined) {
    updates.push(`full_name = $${idx++}`);
    values.push(parsed.data.full_name);
  }
  if (parsed.data.email !== undefined) {
    updates.push(`email = $${idx++}`);
    values.push(parsed.data.email);
  }
  if (parsed.data.password !== undefined) {
    const hash = await bcrypt.hash(parsed.data.password, 10);
    updates.push(`password_hash = $${idx++}`);
    values.push(hash);
  }

  values.push(req.user!.userId);

  try {
    const result = await pool.query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx} RETURNING id, hotel_id, full_name, email, role, is_active, created_at`,
      values,
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err: any) {
    console.error(err);
    if (err.code === "23505")
      return res.status(409).json({ error: "Email already in use" });
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ============================================
// PATCH /users/:id — toggle is_active (admin only)
// MUST come after /me
// ============================================
router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { is_active } = req.body;
  if (typeof is_active !== "boolean") {
    return res.status(400).json({ error: "is_active boolean required" });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET is_active = $1
       WHERE id = $2 AND hotel_id = $3 AND deleted_at IS NULL
       RETURNING id, hotel_id, full_name, email, role, is_active, created_at`,
      [is_active, req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "User not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
