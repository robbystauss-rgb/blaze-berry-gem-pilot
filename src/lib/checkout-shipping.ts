/**
 * Conservative US shipping-and-packaging estimate, not a carrier quote.
 * USPS Ground Advantage commercial Zone 8/9, Notice 123, July 12 2026:
 * https://pe.usps.com/text/dmm300/Notice123.htm
 * Assumptions: 6 oz per finished hat; 0.5 oz per loose patch; small box
 * 6 oz / $1.50, larger box 16 oz / $2; patch mailer 2 oz / $1.
 * Up to 12 fulfilled hats or 24 patches per parcel. Bonus hats count.
 * Merchant absorbs any difference from the eventual label cost.
 */
const poundRates = [0, 1067, 1287, 1575, 1801, 1919, 2068, 2183, 2290];
export function shippingEstimate(orderType: "hat" | "patch", fulfilled: number) {
  if (!Number.isSafeInteger(fulfilled) || fulfilled < 1 || fulfilled > 11000) throw new Error("Invalid shipping quantity.");
  let total = 0;
  let remaining = fulfilled;
  while (remaining > 0) {
    const count = Math.min(remaining, orderType === "hat" ? 12 : 24);
    const large = orderType === "hat" && count > 2;
    const ounces = orderType === "hat" ? count * 6 + (large ? 16 : 6) : count * 0.5 + 2;
    const postage = ounces < 16 ? 840 : poundRates[Math.ceil(ounces / 16)];
    if (!postage) throw new Error("Shipping estimate unavailable.");
    const packaging = orderType === "patch" ? 100 : large ? 200 : 150;
    total += Math.ceil((postage + packaging) / 50) * 50;
    remaining -= count;
  }
  return total;
}
