import { createClient } from "@libsql/client";
const token = process.env.TURSO_DB_CONN;
const urls = [
  process.env.TURSO_DB_URL,
  "libsql://olantis-mtlh-aws-eu-west-1.turso.io",
  "https://olantis-mtlh.aws-eu-west-1.turso.io",
  "https://olantis-mtlh-aws-eu-west-1.turso.io?secure=true"
];
for (const url of urls) {
  console.log("Trying", url);
  try {
    const c = createClient({ url, authToken: token });
    const r = await c.execute("SELECT 1 as x");
    console.log("OK", url, r.rows);
  } catch (e) { console.log("FAIL", url, e.message, e.cause?.message ?? "") }
}
