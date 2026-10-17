/** Fail closed on a database from another app or untracked/partial schema. */
export async function inspectMigrationCompatibility(client, known) {
  const { rows: tables } = await client.query(
    "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname",
  );
  const historyPresent = tables.some((t) => t.name === "_migrations");
  const applied = historyPresent
    ? (await client.query("SELECT name FROM public._migrations ORDER BY name")).rows.map(
        (r) => r.name,
      )
    : [];
  const ordered = [...known].sort();
  if (applied.some((name) => !ordered.includes(name)))
    throw Error(
      "Migration refused: this database contains migration history from a different application. Preserve it and connect an isolated matching database.",
    );
  if (!applied.length && tables.some((t) => t.name !== "_migrations"))
    throw Error(
      "Migration refused: public tables exist without matching migration history. No repair or reset was attempted.",
    );
  const last = Math.max(-1, ...applied.map((name) => ordered.indexOf(name)));
  if (ordered.slice(0, last + 1).some((name) => !applied.includes(name)))
    throw Error(
      "Migration refused: migration history has gaps. Review the schema without rewriting history.",
    );
  return {
    applied,
    tables: tables.map((t) => t.name),
    pending: ordered.filter((name) => !applied.includes(name)),
  };
}
