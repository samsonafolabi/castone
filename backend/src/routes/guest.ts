import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router = Router();

// hotel_id and registered_by removed — both now derived from req.user, never from the client
const guestSchema = z.object({
  room_number: z.string().optional(),
  full_name: z.string().min(1),
  nationality: z.string().optional(),
  sex: z.string().optional(),
  occupation: z.string().optional(),
  phone_number: z.string().optional(),
  contact_address: z.string().optional(),
  id_type: z.string().optional(),
  id_number: z.string().optional(),
  place_of_issue: z.string().optional(),
  date_of_arrival: z.string().optional(),
  date_of_departure: z.string().optional(),
  vehicle_reg_no: z.string().optional(),
  mission: z.string().optional(),
});

// ============================================
// POST /guests — register a new guest
// ============================================
router.post("/", requireAuth, async (req, res) => {
  const parsed = guestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const g = parsed.data;
  const hotelId = req.user!.hotelId;
  const registeredBy = req.user!.userId;

  try {
    const result = await pool.query(
      `INSERT INTO guests (
        hotel_id, room_number, full_name, nationality, sex, occupation,
        phone_number, contact_address, id_type, id_number, place_of_issue,
        date_of_arrival, date_of_departure, vehicle_reg_no, mission, registered_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        hotelId,
        g.room_number,
        g.full_name,
        g.nationality,
        g.sex,
        g.occupation,
        g.phone_number,
        g.contact_address,
        g.id_type,
        g.id_number,
        g.place_of_issue,
        g.date_of_arrival,
        g.date_of_departure,
        g.vehicle_reg_no,
        g.mission,
        registeredBy,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to register guest" });
  }
});

// ============================================
// GET /guests — list guests for the logged-in user's hotel
// ============================================
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM guests 
       WHERE hotel_id = $1 AND deleted_at IS NULL 
       ORDER BY date_of_arrival DESC`,
      [req.user!.hotelId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guests" });
  }
});

// ============================================
// GET /guests/:id — single guest (scoped to own hotel)
// ============================================
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM guests WHERE id = $1 AND hotel_id = $2 AND deleted_at IS NULL`,
      [req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Guest not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guest" });
  }
});

// ============================================
// PATCH /guests/:id — update guest details (scoped to own hotel)
// ============================================
router.patch("/:id", requireAuth, async (req, res) => {
  const parsed = guestSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const fields = Object.keys(parsed.data);
  if (fields.length === 0)
    return res.status(400).json({ error: "No fields to update" });

  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) => (parsed.data as any)[f]);

  try {
    const result = await pool.query(
      `UPDATE guests SET ${setClause} 
       WHERE id = $${fields.length + 1} AND hotel_id = $${fields.length + 2} AND deleted_at IS NULL 
       RETURNING *`,
      [...values, req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Guest not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update guest" });
  }
});

// ============================================
// DELETE /guests/:id — soft delete (admin only, scoped to own hotel)
// ============================================
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE guests SET deleted_at = now() 
       WHERE id = $1 AND hotel_id = $2 AND deleted_at IS NULL 
       RETURNING id`,
      [req.params.id, req.user!.hotelId],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Guest not found" });
    res.json({ message: "Guest removed", id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete guest" });
  }
});

export default router;
