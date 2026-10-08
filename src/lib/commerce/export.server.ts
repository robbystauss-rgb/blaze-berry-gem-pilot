import { getSql } from "@/lib/db";
import { assertPermission, audit } from "./core.server";
import { readAdmin, type ReadInput, type AdminData } from "./read.server";
import type { Permission, Role } from "./types";
const permissions: Record<string, Permission> = {
  orders: "orders",
  production: "production",
  payments: "finance",
  inventory: "inventory",
  products: "products",
  customers: "customers",
  activity: "audit",
  notifications: "orders",
};
function records(section: string, data: AdminData): Record<string, unknown>[] {
  if (section === "payments")
    return data.orders.map((order) => ({
      ...order,
      transactions: data.payments.filter((p) => p.order_id === order.id),
      invoice: data.invoices.find((i) => i.order_id === order.id) ?? null,
    }));
  if (section === "inventory")
    return data.inventory.map((stock) => ({
      ...stock,
      available: stock.on_hand === null ? null : stock.on_hand - stock.reserved - stock.committed,
    }));
  if (section === "products")
    return data.products.map((product) => ({
      ...product,
      variants: data.variants.filter((v) => v.product_id === product.id),
    }));
  const key =
    ({ production: "orders", payments: "orders", activity: "audit" } as Record<string, string>)[
      section
    ] ?? section;
  return data[key as keyof AdminData] as Record<string, unknown>[];
}
export function csvCell(value: unknown) {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function exportRecords(input: ReadInput, actor: { userId: string; role: Role }) {
  assertPermission(actor.role, "reports");
  if (!permissions[input.section]) throw new Error("This section does not support record export.");
  assertPermission(actor.role, permissions[input.section]);
  const sql = await getSql();
  const result = await sql.transaction(async (tx) => {
    await tx.query("set transaction isolation level repeatable read");
    const first = await readAdmin({ ...input, page: 0 }, actor, tx);
    if (first.total > 50000)
      throw new Error(
        "More than 50,000 matching records. Narrow the date range or filters before exporting.",
      );
    const rows = records(input.section, first);
    for (let page = 1; page * 50 < first.total; page++)
      rows.push(...records(input.section, await readAdmin({ ...input, page }, actor, tx)));
    const headers = rows.length ? Object.keys(rows[0]) : ["No matching records"];
    return {
      csv:
        "\uFEFF" +
        [
          headers.map(csvCell).join(","),
          ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
        ].join("\r\n"),
      count: rows.length,
    };
  });
  await sql.transaction((tx) =>
    audit(tx, actor.userId, "report.records_exported", "report", input.section, null, {
      count: result.count,
      from: input.from ?? null,
      to: input.to ?? null,
    }),
  );
  return result;
}
