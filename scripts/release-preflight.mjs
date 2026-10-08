// Explicit release preflight. No migrations or business mutations are performed here.
import pg from "pg";
const required = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "ADMIN_MFA_ENCRYPTION_KEY",
];
for (const key of required)
  if (!process.env[key]?.trim()) throw new Error(`Release configuration missing ${key}.`);
if (
  process.env.BETTER_AUTH_SECRET.length < 32 ||
  !/^[\da-f]{64}$/i.test(process.env.ADMIN_MFA_ENCRYPTION_KEY)
)
  throw new Error("Release authentication keys have invalid lengths.");
if (process.env.REC_MIGRATION_TARGET !== "production-approved")
  throw new Error("Explicit production migration target is required for this release preflight.");
if (new URL(process.env.BETTER_AUTH_URL).origin !== "https://recmamamade.com")
  throw new Error("Release authentication origin does not match REC Mama Made.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query("begin read only");
    const result = await client.query(
      "select table_name from information_schema.tables where table_schema='public' order by table_name",
    );
    console.log(
      "[release-preflight] Persistent PostgreSQL connected. Existing table names:",
      result.rows.map((r) => r.table_name).join(", ") || "(none)",
    );
    await client.query("rollback");
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
console.log(
  "[release-preflight] Required runtime configuration validated; no secrets or customer records printed.",
);
