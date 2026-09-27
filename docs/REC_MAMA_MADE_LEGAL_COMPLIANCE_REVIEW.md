# REC MAMA MADE — LEGAL / COMPLIANCE REVIEW

Review date: 2026-09-27

This is an internal implementation and issue-spotting report, not a substitute for advice from licensed counsel. Website-facing provisions intentionally avoid publishing unverified legal-entity details, refund deadlines, cancellation fees, arbitration provisions, class waivers, warranty exclusions, governing-law clauses, or liability caps.

## Legal protections implemented

- Versioned Terms & Conditions, Privacy Policy, Custom Order Policy, Artwork & Intellectual Property Policy, Proof Approval Policy, Shipping Policy, Returns / Refunds / Remakes Policy, Copyright / DMCA Policy, and Trademark & Third-Party Brand Notice.
- Required affirmative Terms / Custom Order acceptance before payment initiation.
- Required customer artwork authorization when the submitted build includes uploaded artwork.
- Separate, optional, unchecked portfolio/marketing consent that is not required to purchase.
- Server-side validation of required legal acknowledgements.
- Policy-version and UTC acceptance metadata attached to Stripe Checkout sessions.
- Compact policy/acceptance metadata attached to PayPal orders when that integration is enabled.
- Additive legal-acceptance database record keyed to payment method/provider order ID, with no destructive migration and no modification of historical order data.
- Minimal footer legal links and dynamic copyright year.
- Customer artwork ownership remains with its owner; only a limited production license is granted.
- Clear distinction between customer-approved content and a REC Mama Made production error.
- Third-party trademark notice and copyright complaint framework without claiming DMCA safe-harbor eligibility.

## Policy versions

| Policy | Version | Effective | Last updated |
|---|---:|---|---|
| Terms & Conditions | 1.0 | 2026-09-27 | 2026-09-27 |
| Privacy Policy | 1.0 | 2026-09-27 | 2026-09-27 |
| Custom Order Policy | 1.0 | 2026-09-27 | 2026-09-27 |
| Artwork & Intellectual Property Policy | 1.0 | 2026-09-27 | 2026-09-27 |
| Proof Approval Policy | 1.0 | 2026-09-27 | 2026-09-27 |
| Shipping Policy | 1.0 | 2026-09-27 | 2026-09-27 |
| Returns / Refunds / Remakes Policy | 1.0 | 2026-09-27 | 2026-09-27 |
| Copyright / DMCA Policy | 1.0 | 2026-09-27 | 2026-09-27 |
| Trademark & Third-Party Brand Notice | 1.0 | 2026-09-27 | 2026-09-27 |

## Acceptance evidence

The implementation records, where available:

- payment method and payment-provider order/session ID;
- required Terms acceptance;
- artwork authorization when artwork is part of the build;
- optional portfolio permission;
- Terms version;
- Artwork Policy version;
- Custom Order Policy version;
- Privacy Policy version;
- Proof Policy version;
- server-generated UTC acceptance timestamp;
- whether artwork was present.

The table also reserves nullable fields for proof version, proof approval timestamp, artwork identifier, and customer account ID so later proof/account systems can add evidence without destructive schema changes.

### Evidence limitation requiring future operational decision

The current builder keeps uploaded artwork in browser state and does not expose an uploaded-artwork object ID or source-file hash to the payment component. Capturing a reliable source-artwork hash would require changing the upload pipeline. That was intentionally not done under the minimal-diff restriction. `artwork_identifier` therefore remains null in version 1.0 records.

## Proof workflow finding

The current customer-facing site repeatedly says a digital proof will occur before production, and checkout success says the order is ready for the digital-proof step. The reviewed code does not contain an implemented customer proof-approval action, proof-file persistence, or proof-version store. Because the task prohibited inventing or redesigning product workflow, no new proof system was added.

**OWNER DECISION REQUIRED:** define the operational proof system and who sends/stores each proof.

When implemented, records should include:

- order ID;
- proof identifier/version;
- proof file or immutable reference;
- date sent;
- approval/request-changes status;
- approval timestamp;
- final approved proof marker.

Customer-facing proof language added by this project states that production may rely on the final approved proof but does not excuse a REC Mama Made production error that materially departs from that proof.

## Third-party trademark / logo / photography audit

| Brand / material | Location | Type of use | Likely owner | Customer-supplied or site-supplied | Potential issue | Recommended action |
|---|---|---|---|---|---|---|
| Richardson | Hat catalog, builder, homepage/footer copy, model names and product photos | Manufacturer name/models and product photography | Richardson Sports / applicable rights holder | Site-supplied | Trademark identification is ordinarily descriptive, but photography licensing/provenance should be documented | Keep legitimate product identification; retain supplier/photo permission records |
| Umpqua Gramps / 256 naming | Catalog and builder | Product/model naming | Applicable manufacturer/rightsholder | Site-supplied | Same descriptive-use and photo-provenance issue | Keep product identification; document source/license |
| Stripe | Checkout integration and payment disclosure | Payment service name/hosted checkout | Stripe | Site integration | Avoid implying sponsorship beyond service relationship; provider UI/marks should follow provider terms | Keep accurate payment-provider reference |
| PayPal | Checkout code/policy disclosure when enabled | Payment provider | PayPal | Site integration | Provider marks/buttons should be loaded through approved SDK | Keep official SDK/button use only |
| Venmo | Checkout code/manual payment fallback | Payment provider | PayPal/Venmo | Site integration | Same; direct profile link does not create automated order linkage | Keep accurate payment-method wording; document manual-payment reconciliation process |
| Customer logos/marks in Actual Work | Actual Work gallery and any customer-finished-product photography | Customer/third-party logos and marks | Customers or third-party rights holders | Provenance varies / not evidenced in code | Existing portfolio rights are not evidenced by an order-level consent record | Audit existing gallery items and obtain/retain permission where needed; future orders use separate optional consent |
| Google-hosted product/work imagery | Product and gallery image delivery | Image hosting/source delivery | Rights in photos depend on original source | Site-supplied | Hosting source does not establish content ownership/license | Preserve provenance for every production/gallery asset |
| Google Fonts | Root document | Remote font service | Google/typeface licensors | Site integration | Privacy/service-provider disclosure, not a product endorsement issue | Disclose external resource use; preserve font licensing compliance |

No legitimate manufacturer/model reference was removed during this audit.

## Product-claim audit

Observed claims that should have substantiation retained internally:

| Claim | Current status / issue | Recommended evidence |
|---|---|---|
| “Verified Richardson product photos” | Product/source assertion | Supplier authorization, purchase/source records, or internal provenance map for each image |
| “Real REC material samples” / “31 named material swatches” | Asset provenance is documented in project data, but customer-facing factual claim should remain supportable | Retain the approved source sheet and crop/provenance records |
| “Digital proof before production” / “Proof before production” | Operational claim currently exceeds the implemented customer proof-record system | Establish a durable proof send/approve/version process before relying on automated proof-status claims |
| “Heat-adhesive leatherette patches” | Product-performance/material claim | Supplier material specifications and internal production records |
| “Laser holes are available” | Service-capability claim | Confirm current production capability and fulfillment instructions |
| “Real product photography” | Authenticity/provenance claim | Maintain source/rights records for catalog and finished-work photos |

No observed site claim for “Made in USA,” “waterproof,” “UV resistant,” “lifetime,” or “officially licensed” was identified in the reviewed customer-facing source.

## Shipping review

The new Shipping Policy deliberately separates production time from carrier transit time and does not add a delivery guarantee. It also avoids the overbroad statement that REC Mama Made has no responsibility once a package leaves its possession.

FTC guidance for internet merchandise orders requires a reasonable basis for a promised shipping time and, when a seller cannot ship within the promised time (or generally within 30 days when no shipping time is stated), delay-consent/cancellation/refund handling under the Mail, Internet, or Telephone Order Merchandise Rule. Operational shipping communications should be configured consistently with that rule and counsel's advice.

**OWNER DECISION REQUIRED:** document actual production estimates and internal delayed-order notice/refund process. No new shipping deadline was invented by this project.

## Returns, remakes, and cancellations

The customer-facing policy distinguishes:

- change of mind;
- customer-provided incorrect information;
- customer-approved proof/content issue;
- manufacturing defect;
- shipping damage/loss;
- incorrect product;
- REC Mama Made production error.

It does not state “no refunds under any circumstances” and does not invent deadlines, remake fees, cancellation fees, deposits, or reporting windows.

**OWNER DECISION REQUIRED:** approve any future cancellation deadline, remake charge, deposit policy, defect/damage reporting window, and any nonrefundable-stage rule before publication or enforcement.

## Privacy / technology review

Verified application behavior/services relevant to this version:

- Browser local storage key `rec-mama-order` retains builder/order state on the customer's device, including entered name/email and, when small enough, an artwork data representation.
- Stripe-hosted Checkout processes live card/wallet checkout; REC Mama Made receives/uses payment/session metadata rather than rendering card inputs in the REC builder.
- PayPal/Venmo server integration code is present; customer availability depends on production credentials/eligibility. A direct Venmo profile fallback also exists.
- Vercel hosts the production site and server functions.
- Google Fonts is loaded from Google-hosted font domains.
- Product/work images are served through Google-hosted image URLs.
- No separate advertising pixel or marketing-consent system was identified in the application code reviewed for this version.
- Vercel project metadata has shown a Web Analytics identifier. The owner should verify the exact production analytics configuration and resulting cookies/request data before making any stronger analytics statement.

No claim of GDPR, HIPAA, PCI certification, “bank-grade” security, guaranteed encryption, or fixed data-retention periods was added.

## Marketing communications

The policies distinguish transactional order/proof/payment/shipping communications from promotional marketing. Order placement is not treated as promotional email/SMS consent. If marketing email/SMS is added later, it needs its own consent/unsubscribe compliance review.

## Business identity

**OWNER INFORMATION REQUIRED:** confirm and publish, after counsel review as appropriate:

- legal operator/entity name;
- whether REC Mama Made is a DBA/trade name and of which entity/person;
- principal place of business;
- public customer-service/legal-notice email;
- public mailing address if counsel advises publication.

No LLC, corporation, DBA, or address was invented from account names, payment handles, or user location.

## DMCA / copyright considerations

The customer-facing Copyright / DMCA Policy provides a complaint and counter-notice framework and a repeat-infringer policy but expressly does not claim that REC Mama Made qualifies for a Section 512 safe harbor merely because the page exists.

**ATTORNEY REVIEW REQUIRED — DMCA ELIGIBILITY AND DESIGNATED AGENT REGISTRATION.** If counsel concludes an applicable hosting/linking/caching safe harbor is relevant, requirements can include adopting and reasonably implementing a repeat-infringer policy, accommodating standard technical measures, publishing designated-agent contact information, registering/renewing the agent with the U.S. Copyright Office, and operating the statutory notice/counter-notice process.

**OWNER INFORMATION REQUIRED:** designated copyright/DMCA contact details.

## Provisions prepared for attorney review — NOT published

### Customer-supplied-content indemnification — ATTORNEY REVIEW REQUIRED BEFORE PUBLICATION

Draft concept: “To the extent permitted by law, the customer agrees to defend, indemnify, and hold REC Mama Made harmless from third-party claims, damages, judgments, and reasonable costs arising from customer-supplied artwork, logos, photographs, trademarks, names, likenesses, or other content that the customer was not authorized to request REC Mama Made to reproduce, except to the extent a claim results from REC Mama Made's independent conduct or modification outside the customer's authorized request.”

### Limitation of liability — ATTORNEY REVIEW REQUIRED

Draft concept: any limitation should be tailored to Louisiana and applicable consumer law, exclude liability that cannot lawfully be limited, avoid covering intentional misconduct or REC Mama Made's own unwaivable obligations, and be conspicuous enough for enforceability. No dollar cap or consequential-damages waiver was published.

### Warranty limitation — ATTORNEY REVIEW REQUIRED

No “AS IS” clause was published. Counsel should reconcile any warranty language with product descriptions, proofs, manufacturer warranties, and state/federal law before use.

### Louisiana governing law / venue — ATTORNEY REVIEW REQUIRED

If the verified legal operator and principal place of business support Louisiana as the appropriate law/forum, counsel may prepare a Louisiana governing-law and venue provision. None was published because the legal entity and business address have not been verified.

### Arbitration / jury waiver / class-action waiver

Not added. Add only after an affirmative owner decision and attorney review.

## Unresolved business decisions

1. Correct legal operator and public legal-notice contact.
2. Proof-system ownership, proof files, versioning, and approval workflow.
3. Existing Actual Work/gallery photo and logo permissions.
4. Cancellation/refund/remake fees, deadlines, and reporting windows.
5. Actual production-time representations and delayed-order operating procedure.
6. Whether and how long legal acceptance/order/proof records should be retained.
7. Whether manual Venmo payments remain a supported fallback and how they are reconciled to an order.
8. Exact Vercel analytics/cookie configuration.
9. DMCA applicability/designated agent.
10. Whether customer-content indemnification, warranty limits, liability limits, governing law, venue, or dispute provisions should be adopted after counsel review.

## Technical changes performed

Changes are intentionally limited to legal/compliance scope:

- `src/lib/legal-policies.ts` — centralized versioned public policy content and policy-version constants.
- `src/components/legal/policy-page.tsx` — uses existing site classes to render policies without new visual system.
- `src/routes/legal/$policy.tsx` — one dynamic legal route serving the dedicated policy URLs.
- `src/routeTree.gen.ts` — registers the one legal route; normal TanStack generation may rewrite ordering only.
- `src/components/layout/site-shell.tsx` — adds only the secondary legal footer row and dynamic copyright year.
- `src/components/build/checkout-panel.tsx` — adds required Terms/custom-order acceptance, artwork authorization when artwork exists, optional portfolio consent, and gates payment buttons until required acknowledgements are made.
- `src/lib/payments.ts` — validates legal acceptance server-side, stamps current versions/UTC time, adds provider metadata, and writes supplemental acceptance records.
- `src/lib/legal-records.server.ts` — server-only append-only acceptance writer.
- `migrations/0002_legal_acceptances.sql` — additive acceptance-evidence table; no historical order migration/destructive schema operation.
- `docs/REC_MAMA_MADE_LEGAL_COMPLIANCE_REVIEW.md` — this internal review.
- `docs/REC_MAMA_MADE_ATTORNEY_REVIEW_CHECKLIST.md` — counsel review checklist.

## Changes intentionally NOT made

- No redesign, color/font/spacing system change, product-card change, image replacement, pricing/SKU/inventory change, catalog change, shipping calculation change, payment processor replacement, dependency upgrade, SEO rewrite, unrelated refactor, authentication/account addition, or navigation reorganization.
- No proof system was invented.
- No legal entity/address was invented.
- No arbitration/class waiver/jury waiver, broad indemnity, liability cap, warranty disclaimer, or governing-law/venue clause was published.
