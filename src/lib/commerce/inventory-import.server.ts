import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { adjustInventory, assertPermission, audit, notify } from "./core.server";
import type { InventoryRow, Role } from "./types";
import { INVENTORY_CSV_HEADERS, inventoryCsvCell, readInventoryCsv } from "./inventory-csv";

const inputSchema = z.object({
  csv: z.string().max(200_000),
  reason: z
    .string()
    .trim()
    .min(5, "Add a count or supplier reference, at least 5 characters.")
    .max(200),
});
type Input = z.infer<typeof inputSchema>;
type Actor = { userId: string; role: Role };
export type InventoryImportRow = {
  line: number;
  sku: string;
  action: "create" | "update" | "unchanged" | "error";
  title: string;
  category: string;
  onHand: number | null;
  threshold: number;
  incoming: number;
  reason: string;
  before: InventoryRow | null;
  errors: string[];
};
export type InventoryImportPreview = {
  fingerprint: string;
  rows: InventoryImportRow[];
  summary: { create: number; update: number; unchanged: number; errors: number };
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function whole(value: string | undefined, field: string, errors: string[], fallback?: number) {
  if (!value && fallback !== undefined) return fallback;
  if (!/^\d{1,7}$/.test(value ?? "") || Number(value) > 1_000_000) {
    errors.push(`${field} must be a whole count from 0 to 1,000,000.`);
    return 0;
  }
  return Number(value);
}
async function plan(input: Input, sql: Sql, lock = false): Promise<InventoryImportPreview> {
  const records = readInventoryCsv(input.csv),
    skus = records.map((r) => r.cells.sku ?? ""),
    stock = await sql.query<InventoryRow>(
      "select * from commerce_inventory where sku=any($1::text[]) order by id" +
        (lock ? " for update" : ""),
      [skus],
    ),
    bySku = new Map(stock.map((i) => [i.sku, i])),
    seen = new Set<string>();
  const rows = records.map(({ line, cells: c }): InventoryImportRow => {
    const errors: string[] = [],
      sku = c.sku ?? "",
      before = bySku.get(sku) ?? null;
    if (!sku || sku.length > 100) errors.push("SKU is required, up to 100 characters.");
    if (seen.has(sku)) errors.push("This SKU appears more than once in the file.");
    seen.add(sku);
    const title = c.title || before?.title || "",
      category = c.category || before?.category || "";
    if (!title || title.length > 200)
      errors.push("A title is required for a new item, up to 200 characters.");
    if (!category || category.length > 100)
      errors.push("A category is required for a new item, up to 100 characters.");
    const onHand = whole(c.on_hand, "On hand", errors),
      threshold = whole(c.threshold, "Threshold", errors, before?.threshold ?? 0),
      incoming = whole(c.incoming, "Incoming", errors, before?.incoming ?? 0);
    if (c.reason?.length > 250) errors.push("A row reason can be up to 250 characters.");
    if (before && onHand < before.reserved + before.committed)
      errors.push(
        `Count cannot be below ${before.reserved + before.committed} units held for orders.`,
      );
    const changed =
      !before ||
      before.on_hand !== onHand ||
      before.title !== title ||
      before.category !== category ||
      before.threshold !== threshold ||
      before.incoming !== incoming;
    return {
      line,
      sku,
      title,
      category,
      onHand,
      threshold,
      incoming,
      reason: input.reason + (c.reason ? " — " + c.reason : ""),
      before,
      errors,
      action: errors.length ? "error" : !before ? "create" : changed ? "update" : "unchanged",
    };
  });
  const summary = { create: 0, update: 0, unchanged: 0, errors: 0 };
  for (const row of rows) {
    if (row.action === "error") summary.errors++;
    else summary[row.action]++;
  }
  return { fingerprint: hash({ input, rows }), rows, summary };
}
export async function previewInventoryImport(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "inventory");
  return plan(inputSchema.parse(raw), await getSql());
}
export async function commitInventoryImport(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "inventory");
  const p = inputSchema
      .extend({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.string().uuid() })
      .parse(raw),
    sql = await getSql(),
    requestHash = hash(p);
  return sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('inventory-csv-import'))`;
    const [prior] = await tx<{
      actor_id: string;
      request_hash: string;
      result: InventoryImportPreview["summary"];
    }>`select * from commerce_inventory_imports where request_id=${p.requestId}`;
    if (prior) {
      if (prior.actor_id !== actor.userId || prior.request_hash !== requestHash)
        throw Error("This import request was used for different content.");
      return prior.result;
    }
    const checked = await plan({ csv: p.csv, reason: p.reason }, tx, true);
    if (checked.summary.errors)
      throw Error("Nothing imported. Correct every row error and preview again.");
    if (checked.fingerprint !== p.fingerprint)
      throw Error("Stock changed after preview. Preview the file again before importing.");
    for (const row of checked.rows) {
      if (row.action === "unchanged") continue;
      const id = row.before?.id ?? randomUUID();
      let version = row.before?.version ?? 1;
      if (!row.before) {
        await tx`insert into commerce_inventory(id,sku,title,category,threshold,incoming) values(${id},${row.sku},${row.title},${row.category},${row.threshold},${row.incoming})`;
        await audit(tx, actor.userId, "inventory.created", "inventory", id, null, {
          sku: row.sku,
          title: row.title,
          category: row.category,
          importRequest: p.requestId,
        });
      } else if (
        row.before.title !== row.title ||
        row.before.category !== row.category ||
        row.before.threshold !== row.threshold ||
        row.before.incoming !== row.incoming
      ) {
        await tx`update commerce_inventory set title=${row.title},category=${row.category},threshold=${row.threshold},incoming=${row.incoming},version=version+1 where id=${id}`;
        version++;
        await audit(tx, actor.userId, "inventory.settings_updated", "inventory", id, row.before, {
          title: row.title,
          category: row.category,
          threshold: row.threshold,
          incoming: row.incoming,
          reason: row.reason,
          importRequest: p.requestId,
        });
      }
      if (!row.before || row.before.on_hand !== row.onHand) {
        await adjustInventory(
          tx,
          {
            id,
            version,
            delta: row.onHand! - (row.before?.on_hand ?? 0),
            reason: row.reason,
            requestId: p.requestId + ":" + row.line,
          },
          actor.userId,
        );
      } else if (row.onHand! - row.before.reserved - row.before.committed <= row.threshold) {
        await notify(tx, `import-low:${p.requestId}:${id}`, "Low inventory after count import");
      }
    }
    await tx`insert into commerce_inventory_imports(request_id,actor_id,request_hash,result) values(${p.requestId},${actor.userId},${requestHash},${JSON.stringify(checked.summary)})`;
    await audit(tx, actor.userId, "inventory.csv_imported", "inventory_import", p.requestId, null, {
      ...checked.summary,
      reason: p.reason,
      skus: checked.rows.map((r) => r.sku),
    });
    return checked.summary;
  });
}
export async function exportInventoryCounts(actor: Actor) {
  assertPermission(actor.role, "inventory");
  const sql = await getSql(),
    rows = await sql<InventoryRow>`select * from commerce_inventory order by sku limit 10001`;
  if (rows.length > 10000)
    throw Error("This export exceeds 10,000 stock items. Use the filtered report export.");
  await sql.transaction((tx) =>
    audit(tx, actor.userId, "inventory.counts_exported", "report", "inventory", null, {
      count: rows.length,
    }),
  );
  return {
    count: rows.length,
    csv:
      "\uFEFF" +
      [
        INVENTORY_CSV_HEADERS.join(","),
        ...rows.map((r) =>
          [r.sku, r.title, r.category, r.on_hand, r.threshold, r.incoming, ""]
            .map(inventoryCsvCell)
            .join(","),
        ),
      ].join("\r\n"),
  };
}
