import { getSql } from "@/lib/db";
import type { LegalAcceptanceInput } from "@/lib/legal-policies";

export type LegalAcceptanceRecordInput = {
  paymentMethod: "stripe" | "paypal" | "venmo" | "manual-venmo";
  providerOrderId: string;
  hasArtwork: boolean;
  legal: LegalAcceptanceInput;
};

export async function recordLegalAcceptance(input: LegalAcceptanceRecordInput) {
  const sql = await getSql();
  const id = crypto.randomUUID();
  await sql.query(
    `insert into legal_acceptances (
      id,
      payment_method,
      provider_order_id,
      accepted_at,
      artwork_authorized,
      portfolio_consent,
      has_artwork,
      terms_version,
      artwork_policy_version,
      custom_order_policy_version,
      privacy_policy_version,
      proof_policy_version,
      proof_version,
      proof_approved_at,
      artwork_identifier,
      customer_account_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    on conflict (payment_method, provider_order_id) do nothing`,
    [
      id,
      input.paymentMethod,
      input.providerOrderId,
      input.legal.acceptedAt,
      input.legal.artworkAuthorized,
      input.legal.portfolioConsent,
      input.hasArtwork,
      input.legal.termsVersion,
      input.legal.artworkPolicyVersion,
      input.legal.customOrderPolicyVersion,
      input.legal.privacyPolicyVersion,
      input.legal.proofPolicyVersion,
      null,
      null,
      null,
      null,
    ],
  );
  return id;
}
