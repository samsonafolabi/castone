// backend/src/routes/hotels.ts
import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";

const router = Router();

const hotelSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
});

// POST /hotels — create a hotel
router.post("/", async (req, res) => {
  const parsed = hotelSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { name, address } = parsed.data;

  try {
    const result = await pool.query(
      `INSERT INTO hotels (name, address) VALUES ($1, $2) RETURNING *`,
      [name, address],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create hotel" });
  }
});

// GET /hotels — list hotels
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM hotels WHERE deleted_at IS NULL ORDER BY created_at DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch hotels" });
  }
});

export default router;
