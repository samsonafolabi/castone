// backend/src/index.ts
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { pool } from "./db";
import guestsRouter from "./routes/guest";
import hotelsRouter from "./routes/hotels";
import usersRouter from "./routes/users";
import authRouter from "./routes/auth";
import productsRouter from "./routes/products";
import stockEntriesRouter from "./routes/stockEntries";
import monthlyStockCountsRouter from "./routes/monthlyStockCounts";
import monthlyClosesRouter from "./routes/monthlyCloses";
const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRouter);
app.use("/products", productsRouter);
app.use("/stock-entries", stockEntriesRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/guests", guestsRouter);
app.use("/hotels", hotelsRouter);
app.use("/users", usersRouter);
app.use("/monthly-stock-counts", monthlyStockCountsRouter);
app.use("/monthly-closes", monthlyClosesRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
