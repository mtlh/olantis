import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
await sql`ALTER TABLE holdings ADD COLUMN IF NOT EXISTS last_refreshed_at INTEGER`;
console.log("added");
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='holdings'`;
console.log(cols);
