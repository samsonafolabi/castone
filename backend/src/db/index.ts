// backend/src/db/index.ts
import { Pool, types } from "pg";
import dotenv from "dotenv";
dotenv.config();

// DATE type OID is 1082 — return as raw string (e.g. "2026-08-10"), not a JS Date object
types.setTypeParser(1082, (val) => val);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
