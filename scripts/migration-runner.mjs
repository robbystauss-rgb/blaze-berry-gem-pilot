import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Caller owns the advisory lock. A release may own a larger atomic transaction. */
export async function applyMigrationFiles(
  client,
  { migrationsDir, pending, transactionPerFile = true, log = console.log },
) {
  for (const { name } of pending) {
    const sql = await readFile(join(migrationsDir, name), "utf8");
    try {
      if (transactionPerFile) await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO public._migrations (name) VALUES ($1)", [name]);
      if (transactionPerFile) await client.query("COMMIT");
    } catch (error) {
      if (transactionPerFile) {
        await client.query("ROLLBACK").catch(() => {});
      }
      throw error;
    }
    log(`[migrate] applied ${name}`);
  }
  return pending.length;
}
