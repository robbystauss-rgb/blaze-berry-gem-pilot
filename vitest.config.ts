import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [{
    name: "catalog-test-overlay",
    enforce: "pre",
    resolveId(id) { if (id === "@/data/master-catalog.json") return "\0test-catalog"; },
    load(id) {
      if (id !== "\0test-catalog") return;
      const raw = JSON.parse(fs.readFileSync("src/data/master-catalog.json", "utf8"));
      const patches = JSON.parse(fs.readFileSync("src/data/catalog-patches.json", "utf8")).models;
      return `export default ${JSON.stringify({ ...raw, models: raw.models.map((m: { id: string }) => ({ ...m, ...patches[m.id] })) })}`;
    },
  }],
  test: { include: ["tests/checkout*.test.ts"], environment: "node" },
});
