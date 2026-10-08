// Nitro bundles the PGLite JS dependency but does not trace its dynamic WASM/data
// files. Keep them beside the emitted library for safe local release previews.
import { copyFile, readdir, access } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
const output = resolve(".vercel/output/functions");
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.name === "electric-sql__pglite.mjs") result.push(path);
  }
  return result;
}
try {
  await access(output);
} catch {
  console.log("[preview-runtime] No Vercel functions output; nothing to package.");
  process.exit(0);
}
for (const library of await walk(output))
  for (const name of ["pglite.data", "pglite.wasm", "initdb.wasm"])
    await copyFile(
      resolve("node_modules/@electric-sql/pglite/dist", name),
      join(dirname(library), name),
    );
console.log("[preview-runtime] Packaged embedded database runtime. No database records modified.");
