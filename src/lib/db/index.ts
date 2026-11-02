import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * One client per process, not per call.
 *
 * `neon()` builds an HTTP-based client and drizzle wraps it; creating a new one
 * for every `getDb()` discarded the underlying connection pool, so each query
 * (or each of several queries in one request) paid a fresh TLS handshake to
 * the database. Reusing the same client lets the runtime keep connections
 * warm, which is most of the difference between a ~30ms and a ~300ms query on
 * a serverless Postgres.
 */
function create(url: string) {
  return drizzle(neon(url), { schema });
}

let cachedUrl: string | null = null;
let cachedDb: ReturnType<typeof create> | null = null;
let cachedSql: ReturnType<typeof neon> | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!cachedDb || cachedUrl !== url) {
    cachedUrl = url;
    cachedDb = create(url);
    cachedSql = neon(url);
  }
  return cachedDb;
}

export function rawSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!cachedSql || cachedUrl !== url) {
    cachedUrl = url;
    cachedSql = neon(url);
    cachedDb = create(url);
  }
  return cachedSql;
}
