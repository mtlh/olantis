import { connect } from "@tursodatabase/serverless";
const url = process.env.TURSO_DB_URL || "libsql://olantis-mtlh.aws-eu-west-1.turso.io";
const token = process.env.TURSO_DB_CONN;
const c = connect({ url, authToken: token });
await c.exec(`CREATE TABLE IF NOT EXISTS portfolios (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, created_at INTEGER)`);
await c.exec(`CREATE TABLE IF NOT EXISTS holdings (id TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL, symbol TEXT NOT NULL, name TEXT NOT NULL, shares REAL NOT NULL, avg_price REAL NOT NULL, current_price REAL NOT NULL, currency TEXT, purchase_date TEXT, exchange TEXT)`);
await c.exec(`CREATE TABLE IF NOT EXISTS snapshots (user_id TEXT NOT NULL, date TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY(user_id, date))`);
const r = await c.exec(`SELECT name FROM sqlite_master WHERE type='table'`);
console.log(r);
