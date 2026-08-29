// backend/src/routes/auth.ts
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { pool } from "../db";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const isProd = process.env.NODE_ENV === "production";

// 5 attempts per IP per 15 minutes — reasonable for a small hotel staff
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  skipSuccessfulRequests: true,
});

router.post("/login", loginLimiter, async (req, res) => {
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

   res.cookie("token", token, {
  httpOnly: true,
  secure: isProd,           
  sameSite: isProd ? "none" : "lax", 
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

    res.json({
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

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

export default router;
