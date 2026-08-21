import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// hotel_id removed from schema — derived from req.user, never trusted from the client
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

export default router;
