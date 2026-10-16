import { DEFAULT_PRICING, type PriceBook, type PromoDefinition } from "./owner-schemas";
export type PriceSelection = {
  orderType: "hat" | "patch";
  family: string;
  colorway: string;
  leatherette: string;
  patchShape: string;
  patchSize: "small" | "medium" | "large";
  quantity: number;
};
export type Promotion = {
  id: string;
  code: string;
  definition: PromoDefinition;
  state: string;
  version: number;
};
export type PriceResult = {
  unitCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  bonus: number;
  fulfilled: number;
  discountLabel: string;
  promotionId: string | null;
  promotionVersion: number | null;
};
export function promotionEligible(p: Promotion, s: PriceSelection, subtotal: number, now: number) {
  const d = p.definition;
  return (
    p.state === "active" &&
    (!d.startsAt || Date.parse(d.startsAt) <= now) &&
    (!d.endsAt || Date.parse(d.endsAt) > now) &&
    subtotal >= d.minimumSpend &&
    s.quantity >= d.minimumQuantity &&
    (d.orderType === "any" || d.orderType === s.orderType) &&
    (!d.families.length || d.families.includes(s.family))
  );
}
export function calculatePrice(
  s: PriceSelection,
  book: PriceBook = DEFAULT_PRICING,
  promotion: Promotion | null = null,
): PriceResult {
  if (!Number.isInteger(s.quantity) || s.quantity < 1 || s.quantity > 250)
    throw Error("Choose a quantity from 1 to 250.");
  const base =
    s.orderType === "patch"
      ? book.patchBase
      : (book.colors[s.family + ":" + s.colorway] ?? book.models[s.family]);
  if (!Number.isSafeInteger(base) || base <= 0)
    throw Error("This product does not have an available price.");
  const unit =
    base +
    (book.materials[s.leatherette] ?? 0) +
    (book.shapes[s.patchShape] ?? 0) +
    book.sizes[s.patchSize];
  const subtotal = unit * s.quantity;
  if (!Number.isSafeInteger(subtotal) || subtotal > 100000000)
    throw Error("Order amount exceeds supported checkout limits.");
  const tier = book.tiers
    .filter((t) => s.quantity >= t.minimum)
    .sort((a, b) => b.percent - a.percent)[0];
  let discount = tier ? Math.round((subtotal * tier.percent) / 100) : 0,
    label = tier ? `${tier.percent}% quantity pricing` : "";
  let promotionId: string | null = null,
    promotionVersion: number | null = null;
  if (promotion) {
    const d = promotion.definition;
    const offer =
      d.type === "percent"
        ? Math.round((subtotal * d.amount) / 100)
        : d.amount * (d.perItem ? s.quantity : 1);
    if (offer > discount) {
      discount = offer;
      label = promotion.code;
      promotionId = promotion.id;
      promotionVersion = promotion.version;
    }
  }
  if (discount >= subtotal) throw Error("This discount cannot be applied to this order total.");
  const bonus = s.orderType === "hat" ? Math.floor(s.quantity / 12) : 0;
  return {
    unitCents: unit,
    subtotalCents: subtotal,
    discountCents: discount,
    totalCents: subtotal - discount,
    bonus,
    fulfilled: s.quantity + bonus,
    discountLabel: label,
    promotionId,
    promotionVersion,
  };
}
