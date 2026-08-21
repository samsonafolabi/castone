// backend/src/routes/auth.ts
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });

  const { email, password } = parsed.data;

  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL AND is_active = true`,
      [email],
    );

    const user = result.rows[0];
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches)
      return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign(
      { userId: user.id, hotelId: user.hotel_id, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        hotel_id: user.hotel_id,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

export default router;
