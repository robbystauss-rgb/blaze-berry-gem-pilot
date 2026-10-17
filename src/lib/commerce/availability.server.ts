import type { Sql } from "@/lib/db";
import type { PriceSelection } from "./price-calculation";
import type { VariantRow } from "./types";
import { assertHatModelAvailable } from "@/lib/catalog-lifecycle";
export async function checkBuildAvailability(sql: Sql, s: PriceSelection, orderId?: string) {
  assertHatModelAvailable(s.orderType, s.family);
  const key = s.orderType + ":" + s.family + ":" + s.colorway;
  const rows = await sql<{
    on_hand: number | null;
    reserved: number;
    committed: number;
    units_per_item: number;
    held: number;
  }>`select i.on_hand,i.reserved,i.committed,r.units_per_item,coalesce((select quantity from commerce_allocations a where a.order_id=${orderId ?? ""} and a.inventory_id=i.id and a.state in ('reserved','committed')),0) as held from commerce_inventory_rules r join commerce_inventory i on i.id=r.inventory_id where r.product_key=${key}`;
  const quantity = s.quantity + (s.orderType === "hat" ? Math.floor(s.quantity / 12) : 0);
  if (rows.some((r) => r.on_hand === null))
    throw Error(
      "Available stock for this selection needs confirmation. Contact the shop before ordering.",
    );
  if (
    rows.some((r) => r.on_hand! - r.reserved - r.committed + r.held < quantity * r.units_per_item)
  )
    throw Error(
      "This quantity is not currently available. Choose fewer items or contact the shop.",
    );
}
export async function publishedVariants(sql: Sql, productIds: string[]) {
  return sql<VariantRow>`select v.*,(select case when count(*)=0 then null when count(i.on_hand)<count(*) then 0 else min(greatest(0,(i.on_hand-i.reserved-i.committed)/r.units_per_item)) end::int from commerce_inventory_rules r join commerce_inventory i on i.id=r.inventory_id where r.product_key='variant:'||v.id) as available from commerce_variants v where v.active and v.product_id=any(${productIds}::text[]) and not (v.options @> '{"family":"112PM"}'::jsonb or v.options @> '{"modelId":"112PM"}'::jsonb or v.options @> '{"model":"112PM"}'::jsonb) order by v.title`;
}
