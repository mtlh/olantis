import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const now = Math.floor(Date.now()/1000);
await sql`UPDATE holdings SET last_refreshed_at = ${now} WHERE last_refreshed_at IS NULL`;
console.log("backfilled");
const rows = await sql`SELECT symbol, last_refreshed_at FROM holdings`;
console.log(rows);
