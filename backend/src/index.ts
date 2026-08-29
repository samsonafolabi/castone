import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool } from "./db";
import authRouter from "./routes/auth";
import guestsRouter from "./routes/guest";
import hotelsRouter from "./routes/hotels";
import usersRouter from "./routes/users";
import productsRouter from "./routes/products";
import stockEntriesRouter from "./routes/stockEntries";
import monthlyStockCountsRouter from "./routes/monthlyStockCounts";
import monthlyClosesRouter from "./routes/monthlyCloses";
import revenueRoutes from "./routes/revenue";

const app = express();

app.set("trust proxy", 1);
const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, mobile apps)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRouter);
app.use("/guests", guestsRouter);
app.use("/hotels", hotelsRouter);
app.use("/users", usersRouter);
app.use("/products", productsRouter);
app.use("/stock-entries", stockEntriesRouter);
app.use("/monthly-stock-counts", monthlyStockCountsRouter);
app.use("/monthly-closes", monthlyClosesRouter);
app.use("/revenue", revenueRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
