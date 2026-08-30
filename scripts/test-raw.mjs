const token = process.env.TURSO_DB_CONN;
const url = "https://olantis-mtlh.aws-eu-west-1.turso.io/v2/pipeline";
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql: "SELECT 1 as x" } }] })
});
console.log(res.status, res.statusText);
console.log(await res.text());
