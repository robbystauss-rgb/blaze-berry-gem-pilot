// Shared provider-account records are eligible only with independent REC URL and product evidence.
/** @param {import('stripe').Stripe.Checkout.Session} session */
export function recSession(session) {
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    !session.amount_total
  )
    return false;
  try {
    const url = new URL(session.success_url ?? "");
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ([
        "recmamamade.com",
        "www.recmamamade.com",
        "rec-mama-made-staging-robbystauss-6160.vercel.app",
      ].includes(url.hostname) ||
        /^rec-mama-made-staging-[a-z0-9]+-robbystauss-6160\.vercel\.app$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}
/** @param {import('stripe').Stripe.ApiList<import('stripe').Stripe.LineItem>} lines */
export function recItems(lines) {
  return (
    !lines.has_more &&
    lines.data.length > 0 &&
    lines.data.every((line) => /^REC Mama Made(?:\s|$)/.test(line.description ?? ""))
  );
}
