import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const accs = await sql`SELECT id, name FROM accounts WHERE user_id='demo'`;
console.log("accounts before", accs);
const ports = await sql`SELECT id, name, account_id FROM portfolios WHERE user_id='demo'`;
console.log("portfolios before", ports);
