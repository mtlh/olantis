import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL)`;
console.log("accounts table ok");
try {
  await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE`;
  console.log("portfolios.account_id ok");
} catch (e) {
  console.log("alter failed", e.message);
  // try without constraint first
  await sql`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS account_id TEXT`;
  console.log("add column without fk ok");
}
const tables = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='portfolios'`;
console.log(tables);
const accts = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`;
console.log(accts);
