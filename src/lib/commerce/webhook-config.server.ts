import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { getSql } from "@/lib/db";
import { audit, assertPermission } from "./core.server";
import { stripeClient } from "./providers.server";
import type { Role } from "./types";
const scope = "https://recmamamade.com/api/webhooks/stripe";
const events: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "invoice.created",
  "invoice.finalized",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.paid",
  "invoice.voided",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
];
function encryptionKey() {
  const root = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  if (!root || !/^[a-f0-9]{64}$/i.test(root))
    throw new Error("Signing-secret encryption is not configured.");
  return createHash("sha256")
    .update(Buffer.from(root, "hex"))
    .update("rec-stripe-webhook-v1")
    .digest();
}
function seal(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(scope));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function unseal(value: string) {
  const raw = Buffer.from(value, "base64"),
    decipher = createDecipheriv("aes-256-gcm", encryptionKey(), raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(scope));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
export async function webhookSecrets() {
  const sql = await getSql();
  const [registered] = await sql<{
    secret_encrypted: string;
  }>`select secret_encrypted from commerce_webhook_config where scope=${scope} and state='active'`;
  return [
    ...(registered?.secret_encrypted ? [unseal(registered.secret_encrypted)] : []),
    ...(process.env.STRIPE_WEBHOOK_SECRET ? [process.env.STRIPE_WEBHOOK_SECRET] : []),
  ];
}
export async function registerStripeWebhook(
  actor: { userId: string; role: Role },
  client?: Stripe,
) {
  assertPermission(actor.role, "finance");
  encryptionKey();
  const sql = await getSql(),
    stripe = client ?? stripeClient();
  const claim = await sql.transaction(async (tx) => {
    await tx`insert into commerce_webhook_config(scope,id,state,actor_id) values(${scope},${randomUUID()},'error',${actor.userId}) on conflict do nothing`;
    const [row] = await tx<{
      id: string;
      provider_id: string | null;
      secret_encrypted: string | null;
      state: string;
      created_at: string;
      updated_at: string;
    }>`select * from commerce_webhook_config where scope=${scope} for update`;
    if (row.secret_encrypted) return { ...row, reused: true };
    if (row.state === "configuring" && Date.now() - new Date(row.updated_at).getTime() < 120000)
      throw new Error("Webhook configuration is already in progress.");
    if (Date.now() - new Date(row.created_at).getTime() > 23 * 3600000)
      throw new Error("Uncertain webhook setup requires provider review before retrying.");
    await tx`update commerce_webhook_config set state='configuring',updated_at=now() where scope=${scope}`;
    return { ...row, reused: false };
  });
  if (claim.reused) return { id: claim.provider_id!, state: claim.state };
  try {
    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    if (existing.has_more) throw new Error("Webhook endpoint pagination requires review.");
    if (existing.data.some((e) => e.url === scope && e.metadata.rec_registration !== claim.id))
      throw new Error(
        "An existing REC endpoint requires signing-secret reconciliation before setup.",
      );
    const endpoint = await stripe.webhookEndpoints.create(
      {
        url: scope,
        enabled_events: events,
        description: "REC Mama Made signed order/payment events",
        metadata: { rec_registration: claim.id },
      },
      { idempotencyKey: `rec-webhook-register:${claim.id}` },
    );
    if (!endpoint.secret || endpoint.url !== scope)
      throw new Error("Provider did not return the REC signing secret.");
    // Keep new delivery paused until the tested receiver has been promoted.
    await stripe.webhookEndpoints.update(
      endpoint.id,
      { disabled: true },
      { idempotencyKey: `rec-webhook-pause:${claim.id}` },
    );
    const encrypted = seal(endpoint.secret);
    await sql.transaction(async (tx) => {
      await tx`update commerce_webhook_config set provider_id=${endpoint.id},secret_encrypted=${encrypted},state='ready',updated_at=now() where scope=${scope}`;
      await audit(tx, actor.userId, "payment.webhook_registered", "provider", endpoint.id, null, {
        url: scope,
        state: "ready",
      });
    });
    return { id: endpoint.id, state: "ready" };
  } catch (error) {
    await sql`update commerce_webhook_config set state='error',updated_at=now() where scope=${scope} and secret_encrypted is null`;
    throw error;
  }
}
export async function activateStripeWebhook(
  actor: { userId: string; role: Role },
  client?: Stripe,
) {
  assertPermission(actor.role, "finance");
  const sql = await getSql(),
    stripe = client ?? stripeClient();
  const [row] = await sql<{
    provider_id: string;
    secret_encrypted: string;
    state: string;
  }>`select * from commerce_webhook_config where scope=${scope}`;
  if (!row?.provider_id || !row.secret_encrypted)
    throw new Error("Register the REC receiver before enabling delivery.");
  unseal(row.secret_encrypted);
  const endpoint = await stripe.webhookEndpoints.retrieve(row.provider_id);
  if (
    endpoint.url !== scope ||
    !events.every(
      (event) => endpoint.enabled_events.includes(event) || endpoint.enabled_events.includes("*"),
    )
  )
    throw new Error(
      "Provider receiver URL or event subscriptions changed. Review before enabling.",
    );
  await sql`update commerce_webhook_config set state='active',updated_at=now() where scope=${scope}`;
  try {
    const enabled = await stripe.webhookEndpoints.update(
      endpoint.id,
      { disabled: false },
      { idempotencyKey: `rec-webhook-enable:${endpoint.id}` },
    );
    if (enabled.status !== "enabled")
      throw new Error("Provider has not confirmed delivery is enabled.");
    if (row.state !== "active")
      await sql.transaction((tx) =>
        audit(
          tx,
          actor.userId,
          "payment.webhook_activated",
          "provider",
          endpoint.id,
          { state: row.state },
          { state: "active" },
        ),
      );
    return { id: endpoint.id, state: "active" };
  } catch (error) {
    await sql`update commerce_webhook_config set state='ready',updated_at=now() where scope=${scope}`;
    throw error;
  }
}
