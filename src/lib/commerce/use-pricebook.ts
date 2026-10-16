import { useEffect, useState } from "react";
import { getPublicDocument } from "./owner-api";
import { DEFAULT_PRICING, pricingSchema, type PriceBook } from "./owner-schemas";
import { LEATHERETTES, PATCH_SHAPES, colorsForFamily, type FamilyId } from "@/lib/catalog";
export function usePriceBook() {
  const [book, setBook] = useState<PriceBook | null>(null);
  useEffect(() => {
    let active = true;
    void getPublicDocument({ data: { scope: "pricing", key: "main" } })
      .then((v) => {
        const p = pricingSchema.safeParse(v ?? DEFAULT_PRICING);
        if (active && p.success) setBook(p.data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return book;
}
function minimumExtras(book: PriceBook) {
  return (
    Math.min(...LEATHERETTES.map((m) => book.materials[m.id] ?? 0)) +
    Math.min(...PATCH_SHAPES.map((s) => book.shapes[s] ?? 0)) +
    Math.min(...Object.values(book.sizes))
  );
}
export function minimumPatchPrice(book: PriceBook) {
  return book.patchBase + minimumExtras(book);
}
export function minimumPrice(book: PriceBook, family: string) {
  const colors = colorsForFamily(family as FamilyId);
  return (
    Math.min(
      ...(colors.length
        ? colors.map((c) => book.colors[family + ":" + c] ?? book.models[family])
        : [book.models[family]]),
    ) + minimumExtras(book)
  );
}
