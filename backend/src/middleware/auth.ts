// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface AuthPayload {
  userId: string;
  hotelId: string;
  role: "admin" | "staff";
}

// Extend Express's Request type so TypeScript knows about req.user
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// ============================================
// requireAuth — checks token is valid, attaches user info
// ============================================
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string,
    ) as AuthPayload;
    req.user = decoded; // attach to request so later routes can use it
    next(); // token is valid, let the request continue
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ============================================
// requireAdmin — must be used AFTER requireAuth
// ============================================
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
