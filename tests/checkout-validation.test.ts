import { describe, expect, it } from "vitest";
import { validateCheckoutDraft, deliverySchema } from "../src/lib/checkout-validation";
import { shippingEstimate } from "../src/lib/checkout-shipping";
import { FAMILIES, FAMILY_ORDER, LEATHERETTES, colorsForFamily, estimateTotal } from "../src/lib/catalog";
import type { OrderDraft } from "../src/lib/order-store";

export const draft: OrderDraft = {
  customerName: "Test Buyer", customerEmail: "buyer@example.com", orderType: "hat",
  family: "112", colorway: colorsForFamily("112")[0], tier: "standard",
  patchShape: "Circle", patchSize: "medium", placement: "front-center",
  leatherette: LEATHERETTES[0].id, quantity: 1, patchText: "Test",
  artworkDataUrl: "", notes: "", promo: "",
};
describe("existing product behavior at checkout", () => {
  it("matches every ready family and quantity/promo boundary with the existing price function", () => {
    for (const family of FAMILY_ORDER) {
      const colors = colorsForFamily(family);
      if (!colors.length) continue;
      for (const quantity of [1, 11, 12, 13, 24]) for (const promo of ["", "ZADDY", " zaddy "]) {
        const result = validateCheckoutDraft({ ...draft, family, colorway: colors[0], quantity, promo, tier: "standard", total: 1 });
        expect(result.estimate).toEqual(estimateTotal({ orderType: "hat", family, tier: FAMILIES[family].tier, quantity, promo }));
        expect(result.amountCents).toBe(result.estimate.total * 100);
      }
    }
  });
  it("keeps patches at $5 without bonus hats or the hat promo", () => {
    expect(validateCheckoutDraft({ ...draft, orderType: "patch", quantity: 12, promo: "ZADDY" }).estimate).toMatchObject({ unit: 5, total: 60, bonus: 0, fulfilled: 12 });
  });
  it.each([0, -1, 1.5, NaN, Infinity, 10001, "2"])("rejects invalid quantities: %s", (quantity) => {
    expect(() => validateCheckoutDraft({ ...draft, quantity })).toThrow();
  });
  it("rejects invalid products, colors, materials, email, empty designs and unsafe upload URLs", () => {
    for (const patch of [{ family: "constructor" }, { family: "112PM" }, { colorway: "not a color" }, { leatherette: "fake" },
      { patchShape: "Louisiana" }, { customerEmail: "bad" }, { patchText: "" }, { artworkDataUrl: "https://evil.example/file.svg" },
      { patchSize: "large", placement: "side" }]) {
      expect(() => validateCheckoutDraft({ ...draft, ...patch })).toThrow();
    }
  });
  it("requires a delivery address and valid ZIP/state", () => {
    const delivery = { name: "Buyer", address: { line1: "123 Main St", city: "Chicago", state: "il", postal_code: "60601", country: "US" } };
    expect(deliverySchema.parse(delivery).address.state).toBe("IL");
    expect(() => deliverySchema.parse({ ...delivery, address: { ...delivery.address, postal_code: "abc" } })).toThrow();
  });
});
describe("shipping estimates", () => {
  it("uses integer cents, packaging and additional parcels", () => {
    expect(shippingEstimate("hat", 1)).toBe(1000);
    expect(shippingEstimate("hat", 2)).toBe(1450);
    expect(shippingEstimate("hat", 12)).toBe(2300);
    expect(shippingEstimate("hat", 13)).toBe(3300);
    expect(shippingEstimate("patch", 1)).toBe(950);
    expect(shippingEstimate("patch", 25)).toBe(1900);
  });
  it("accounts for earned bonus hats in the physical shipment", () => {
    const result = validateCheckoutDraft({ ...draft, quantity: 12 });
    expect(result.estimate.fulfilled).toBe(13);
    expect(shippingEstimate("hat", result.estimate.fulfilled)).toBe(3300);
  });
});
