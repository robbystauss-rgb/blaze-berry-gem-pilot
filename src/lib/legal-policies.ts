export const LEGAL_EFFECTIVE_DATE = "2026-09-27";
export const LEGAL_LAST_UPDATED = "2026-09-27";

export const LEGAL_VERSIONS = {
  terms: "1.0",
  privacy: "1.0",
  customOrder: "1.0",
  artwork: "1.0",
  proof: "1.0",
  shipping: "1.0",
  returns: "1.0",
  dmca: "1.0",
  trademark: "1.0",
} as const;

export type LegalAcceptanceInput = {
  termsAccepted: boolean;
  artworkAuthorized: boolean;
  portfolioConsent: boolean;
  acceptedAt: string;
  termsVersion: string;
  artworkPolicyVersion: string;
  customOrderPolicyVersion: string;
  privacyPolicyVersion: string;
  proofPolicyVersion: string;
};

export const CURRENT_LEGAL_ACCEPTANCE = {
  termsVersion: LEGAL_VERSIONS.terms,
  artworkPolicyVersion: LEGAL_VERSIONS.artwork,
  customOrderPolicyVersion: LEGAL_VERSIONS.customOrder,
  privacyPolicyVersion: LEGAL_VERSIONS.privacy,
  proofPolicyVersion: LEGAL_VERSIONS.proof,
} as const;

export type PolicySection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalPolicy = {
  slug: string;
  name: string;
  version: string;
  effectiveDate: string;
  lastUpdated: string;
  intro: string;
  sections: PolicySection[];
};

const shared = {
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  lastUpdated: LEGAL_LAST_UPDATED,
};

export const LEGAL_POLICIES: Record<string, LegalPolicy> = {
  terms: {
    slug: "terms",
    name: "Terms & Conditions",
    version: LEGAL_VERSIONS.terms,
    ...shared,
    intro: "These Terms govern orders placed with REC Mama Made through this website. They are intended to work together with the policies linked below and the specific selections shown in your order and proof.",
    sections: [
      {
        heading: "Custom orders",
        paragraphs: [
          "REC Mama Made produces customized hats and leatherette patches from customer selections, text, and/or customer-supplied artwork. Product configuration, pricing, quantity, and other order details shown during checkout remain the controlling order details unless REC Mama Made and the customer agree to a documented change.",
          "A digital proof may be required before production. Production should not begin until the required proof approval has been received.",
        ],
      },
      {
        heading: "Customer-supplied content",
        paragraphs: [
          "By uploading or submitting artwork, logos, trademarks, photographs, graphics, text, designs, or other materials, you represent and warrant that you created or own the material, hold a valid license, or otherwise have sufficient authorization from the rights holder to reproduce and use it for the products requested from REC Mama Made.",
          "REC Mama Made does not represent that it independently verifies ownership of every customer submission. REC Mama Made may reject questionable material, pause production, request evidence of authorization, cancel an order involved in a credible rights dispute, or refuse unlawful or infringing material.",
        ],
      },
      {
        heading: "Ownership and limited production license",
        paragraphs: [
          "Customer-supplied artwork, logos, trademarks, photographs, and other intellectual property remain the property of their respective owners. Submission does not transfer ownership to REC Mama Made.",
          "You grant REC Mama Made a limited, non-exclusive license to use submitted content only as reasonably necessary to prepare proofs, communicate with you, manufacture the requested product, fulfill the order, and retain necessary business and order records. This production license does not by itself grant marketing or portfolio rights.",
        ],
      },
      {
        heading: "Proofs and customer approval",
        paragraphs: [
          "When a proof is provided, please verify spelling, names, numbers, artwork, layout, placement, and requested customization. Production may rely on the final approved proof.",
          "Approval of a proof does not excuse a REC Mama Made production error. If a finished product is materially different from the final approved proof because of REC Mama Made's production mistake, the proof-approval provision is not intended to eliminate responsibility for that mismatch.",
        ],
      },
      {
        heading: "Normal custom-product variation",
        paragraphs: [
          "Minor variation may occur because of leather or leatherette grain and texture, engraving contrast, monitor or screen color differences, blank-product manufacturing tolerances, and reasonable placement tolerances. These normal variations do not permit substitution of a materially different product from what was ordered or approved.",
        ],
      },
      {
        heading: "Payments, shipping, returns, and remakes",
        paragraphs: [
          "Payment details are handled through the payment method selected at checkout. Additional terms in the Shipping Policy and Returns / Refunds / Remakes Policy apply to fulfillment issues and customized merchandise.",
          "Nothing in these Terms is intended to waive rights or remedies that cannot lawfully be waived.",
        ],
      },
      {
        heading: "REC Mama Made content and third-party rights",
        paragraphs: [
          "Original REC Mama Made website copy, branding, original graphics, original photography, promotional graphics, and original artwork are protected to the extent owned by REC Mama Made. Customer content and third-party trademarks remain owned by their respective owners.",
        ],
      },
      {
        heading: "Policy changes",
        paragraphs: [
          "The version and effective date above identify the policy that applies. Future revisions do not replace the policy version recorded with an earlier order.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [
          "For questions about an order or these Terms, use the REC Mama Made contact method provided in your order correspondence. A separate public legal-entity name, principal business address, and dedicated legal-notice contact have not yet been verified for publication.",
        ],
      },
    ],
  },
  privacy: {
    slug: "privacy",
    name: "Privacy Policy",
    version: LEGAL_VERSIONS.privacy,
    ...shared,
    intro: "This policy describes the information the current REC Mama Made website uses to operate the custom builder, process payments, and fulfill orders. It is based on the website behavior reviewed for this version.",
    sections: [
      {
        heading: "Information you provide",
        bullets: [
          "Name and email address entered during order review.",
          "Product selections, quantity, design text, notes, promo codes, and other order details.",
          "Artwork or files you choose in the custom builder.",
          "Optional portfolio/marketing permission if you affirmatively select it.",
          "Payment-related order information generated when you choose a payment method.",
        ],
      },
      {
        heading: "Builder storage on your device",
        paragraphs: [
          "The custom builder uses browser local storage to retain build state on the device, including order selections and customer name/email entered in the builder. The current upload flow may also store a smaller artwork data representation locally on the device; larger artwork may not remain in browser storage. Clearing browser/site storage can remove this local build state.",
        ],
      },
      {
        heading: "Payments",
        paragraphs: [
          "For card payments, the current checkout redirects to Stripe-hosted checkout. Stripe processes the payment credentials entered there, while REC Mama Made receives or uses transaction status and order metadata needed to process the order. PayPal or Venmo may process information when those payment methods are available and selected. A manual Venmo fallback may open Venmo directly.",
          "This policy does not state that REC Mama Made never receives any payment-related information; the site may receive transaction identifiers, status, totals, customer email, and other order metadata from payment providers.",
        ],
      },
      {
        heading: "Hosting and technical information",
        paragraphs: [
          "The website is hosted through Vercel. Hosting, security, and payment infrastructure may process ordinary request information such as IP address, browser or device information, requested URLs, timestamps, and diagnostic or security logs as part of providing those services.",
          "The site also loads Google-hosted fonts and Google-hosted image assets used for product and work photography. Those requests are made to the applicable Google-hosted services.",
        ],
      },
      {
        heading: "Cookies and similar technologies",
        paragraphs: [
          "The reviewed application uses browser local storage for the builder. Payment providers and other third-party services may use cookies or similar technologies when their services are loaded or used. REC Mama Made does not add marketing consent merely because a customer places an order.",
        ],
      },
      {
        heading: "How information is used",
        bullets: [
          "Provide the builder and preserve build state on the customer's device.",
          "Prepare proofs, manufacture and fulfill custom orders, and communicate about those orders.",
          "Process and verify payments and maintain necessary business records.",
          "Address fraud, security, legal claims, intellectual-property complaints, and customer-service issues.",
          "Display completed work in marketing only when separate permission has been obtained or another lawful basis has been confirmed.",
        ],
      },
      {
        heading: "Transactional and marketing communications",
        paragraphs: [
          "Order confirmations, proof messages, payment notices, and shipping or fulfillment updates are transactional communications. Placing an order is not treated as consent to unrelated promotional email or SMS marketing.",
        ],
      },
      {
        heading: "Retention and security",
        paragraphs: [
          "REC Mama Made retains information as reasonably necessary for order fulfillment, business records, dispute handling, legal obligations, and the purposes described above. No fixed retention period is stated in this version because one has not been verified.",
          "No claim is made here that the website is GDPR compliant, HIPAA compliant, or uses any particular security certification or encryption standard beyond what has been verified in the actual service configuration.",
        ],
      },
      {
        heading: "Contact and policy updates",
        paragraphs: [
          "For privacy questions, use the REC Mama Made contact method provided in your order correspondence. The version and dates above identify this Privacy Policy for historical acceptance records.",
        ],
      },
    ],
  },
  "custom-order": {
    slug: "custom-order",
    name: "Custom Order Policy",
    version: LEGAL_VERSIONS.customOrder,
    ...shared,
    intro: "Custom products are made from customer-selected specifications and may involve artwork review and proof approval before production.",
    sections: [
      {
        heading: "Order stages",
        bullets: ["Order received", "Design started", "Proof sent", "Proof approved", "Production started", "Completed", "Shipped"],
      },
      {
        heading: "Changes and cancellations",
        paragraphs: [
          "Whether an order can be changed or canceled depends on its production stage. REC Mama Made will review a request made through the order correspondence and advise what is still possible before production is completed.",
          "This policy does not state a cancellation deadline, cancellation fee, remake fee, or nonrefundable deposit because those business rules have not been verified. Any such rule should be approved by the owner before it is published or charged.",
        ],
      },
      {
        heading: "Proof approval",
        paragraphs: [
          "When a proof is required, the customer is responsible for reviewing spelling, names, numbers, artwork, layout, and requested customization. Production may rely on the final approved proof, subject to REC Mama Made's responsibility for producing the product materially in accordance with that proof.",
        ],
      },
      {
        heading: "Custom variation",
        paragraphs: [
          "Minor differences in grain, leatherette texture, engraving contrast, screen color, blank-product manufacturing, and reasonable placement tolerance can occur. A materially different product is not treated as a normal variation.",
        ],
      },
    ],
  },
  artwork: {
    slug: "artwork",
    name: "Artwork & Intellectual Property Policy",
    version: LEGAL_VERSIONS.artwork,
    ...shared,
    intro: "This policy applies to logos, trademarks, photographs, text, graphics, company names, school or team marks, slogans, badges, insignias, illustrations, and other content submitted for a custom order.",
    sections: [
      {
        heading: "Your authorization",
        paragraphs: [
          "By uploading or submitting artwork, logos, trademarks, photographs, graphics, text, designs, or other materials, you represent and warrant that you own the applicable rights or have obtained sufficient authorization to reproduce and use those materials for the products requested from REC Mama Made.",
          "Your representation may be based on having created the material, owning the material, holding a valid license, or having authorization from the rights holder.",
        ],
      },
      {
        heading: "No transfer of ownership",
        paragraphs: [
          "Customer-supplied artwork, logos, trademarks, photographs, and other intellectual property remain the property of their respective owners. Submission does not transfer ownership to REC Mama Made.",
        ],
      },
      {
        heading: "Limited production license",
        paragraphs: [
          "You authorize REC Mama Made to use submitted content only as reasonably necessary to generate proofs, communicate with you, manufacture the requested product, fulfill the order, and retain necessary business or order records.",
          "Marketing and portfolio use is separate. Production authorization does not automatically grant REC Mama Made permission to showcase the work publicly.",
        ],
      },
      {
        heading: "Review and refusal rights",
        paragraphs: [
          "REC Mama Made does not independently verify ownership of every customer submission. REC Mama Made may reject questionable artwork, pause production, request evidence of authorization, cancel an order involving a credible rights dispute, or refuse material believed to be unlawful or infringing.",
        ],
      },
    ],
  },
  proof: {
    slug: "proof",
    name: "Proof Approval Policy",
    version: LEGAL_VERSIONS.proof,
    ...shared,
    intro: "A proof is intended to confirm the customer-specific design before production when a proof is part of the order workflow.",
    sections: [
      {
        heading: "What to review",
        paragraphs: [
          "Please verify spelling, names, numbers, artwork, layout, placement, and requested customization. Production will be based on the final approved proof when approval is required.",
        ],
      },
      {
        heading: "Versioning and approval",
        paragraphs: [
          "Proof versions should be identifiable so that the final approved proof can be distinguished from earlier drafts. An approval record should identify the applicable order, proof version, and approval timestamp.",
        ],
      },
      {
        heading: "Customer-approved content versus production error",
        paragraphs: [
          "If the finished product matches the final approved proof but the customer later notices an error that was present in that proof, the issue is treated differently from a REC Mama Made production error. If REC Mama Made produces a product materially different from the final approved proof, proof approval is not intended to eliminate responsibility for that production mismatch.",
        ],
      },
    ],
  },
  shipping: {
    slug: "shipping",
    name: "Shipping Policy",
    version: LEGAL_VERSIONS.shipping,
    ...shared,
    intro: "Production time and carrier transit time are separate. A custom order may require design and proof steps before it is ready to ship.",
    sections: [
      {
        heading: "Production versus transit",
        paragraphs: [
          "Any production estimate describes the time needed to prepare the custom item before carrier pickup. Carrier transit begins after shipment and can be affected by the carrier, destination, weather, address accuracy, and other conditions outside the production process.",
          "REC Mama Made does not guarantee a delivery date unless a specific guarantee is expressly stated for that order. If a promised shipment time cannot be met, REC Mama Made will communicate delay, cancellation, and refund options as required by applicable law.",
        ],
      },
      {
        heading: "Address, loss, damage, and fulfillment issues",
        paragraphs: [
          "Carrier delay, a tracking dispute, an address supplied incorrectly by the customer, shipping damage, a lost package, and a REC Mama Made fulfillment mistake are different issues and will be reviewed according to their cause. This policy does not state that REC Mama Made has no responsibility once a parcel is handed to a carrier.",
        ],
      },
      {
        heading: "Shipping promises",
        paragraphs: [
          "Only a shipping or delivery representation expressly provided for the particular order should be relied upon. General timing language should not be read as a guaranteed carrier delivery date unless it expressly says so.",
        ],
      },
    ],
  },
  returns: {
    slug: "returns",
    name: "Returns / Refunds / Remakes Policy",
    version: LEGAL_VERSIONS.returns,
    ...shared,
    intro: "Because custom merchandise is produced to customer specifications, the appropriate remedy depends on what happened. This policy does not impose an unverified blanket 'no refunds' rule.",
    sections: [
      {
        heading: "Customer change of mind",
        paragraphs: [
          "A change-of-mind request is evaluated based on how far the custom order has progressed. Availability of cancellation, refund, or remake may be limited after design or production work has begun. No fixed deadline or fee is stated here because none has been verified for publication.",
        ],
      },
      {
        heading: "Customer-selected information or approved design issue",
        paragraphs: [
          "If a finished product materially matches the customer's selections and final approved proof, an error contained in customer-provided information or in the approved proof is treated differently from a production error. REC Mama Made will review the circumstances before determining whether a remake, correction, or other accommodation is available.",
        ],
      },
      {
        heading: "Manufacturing defect, incorrect product, or REC Mama Made production error",
        paragraphs: [
          "If an item is defective, the wrong product is supplied, or the finished customization is materially different from the final approved proof because of a REC Mama Made production error, contact REC Mama Made using the order correspondence and provide enough information to evaluate the issue. REC Mama Made will review the matter for an appropriate remedy consistent with the order, applicable law, and the confirmed business policy.",
        ],
      },
      {
        heading: "Shipping damage or loss",
        paragraphs: [
          "Shipping damage, loss, and tracking disputes should be reported through the order correspondence with available packaging, tracking, and photo information so the cause and appropriate next step can be evaluated. No unverified claim deadline is stated in this version.",
        ],
      },
    ],
  },
  dmca: {
    slug: "dmca",
    name: "Copyright / DMCA Policy",
    version: LEGAL_VERSIONS.dmca,
    ...shared,
    intro: "REC Mama Made accepts customer-submitted content and takes credible copyright complaints seriously. This page provides a complaint framework but does not represent that publishing the page alone creates or guarantees eligibility for any DMCA safe harbor.",
    sections: [
      {
        heading: "Copyright complaint information",
        paragraphs: [
          "A copyright complaint should identify the copyrighted work claimed to be infringed; identify the material at issue and information reasonably sufficient to locate it; provide the complainant's contact information; include a good-faith statement that the complained-of use is not authorized by the copyright owner, its agent, or the law; include a statement that the information is accurate and, under penalty of perjury, that the sender is authorized to act for the copyright owner; and include a physical or electronic signature.",
          "REC Mama Made may remove, disable, pause, or refuse disputed material while a credible complaint is evaluated and may notify the customer who supplied the material where appropriate.",
        ],
      },
      {
        heading: "Counter-notice framework",
        paragraphs: [
          "Where a counter-notice procedure is legally applicable, a counter-notice generally must identify the removed material and its prior location, include the submitter's contact information and required jurisdiction/service statements, state under penalty of perjury that removal resulted from mistake or misidentification, and include a physical or electronic signature. REC Mama Made will follow an applicable counter-notice process after legal review.",
        ],
      },
      {
        heading: "Repeat infringement",
        paragraphs: [
          "REC Mama Made may refuse future submissions or orders from customers who repeatedly submit material credibly identified as infringing, consistent with applicable law and the facts available to REC Mama Made.",
        ],
      },
      {
        heading: "Designated agent status",
        paragraphs: [
          "A dedicated public DMCA designated-agent contact has not yet been verified for publication. Until that is completed, copyright concerns should be raised through the REC Mama Made contact method in existing order correspondence. Attorney review is required before REC Mama Made represents that it has completed Section 512 eligibility or designated-agent requirements.",
        ],
      },
    ],
  },
  trademark: {
    slug: "trademark",
    name: "Trademark & Third-Party Brand Notice",
    version: LEGAL_VERSIONS.trademark,
    ...shared,
    intro: "REC Mama Made may identify blank-product manufacturers, payment providers, carriers, or customer-requested brands where identification is relevant to products or services.",
    sections: [
      {
        heading: "Third-party marks",
        paragraphs: [
          "Third-party trademarks, logos, brand names, product names, and registered marks displayed on this site remain the property of their respective owners. Their appearance is for identification or descriptive purposes and does not imply sponsorship, endorsement, affiliation, or partnership with REC Mama Made unless expressly stated.",
        ],
      },
      {
        heading: "Customer-requested marks",
        paragraphs: [
          "A customer's request to reproduce a company, school, team, organization, or other third-party mark is subject to the Artwork & Intellectual Property Policy. The customer must have the right or sufficient authorization to request that reproduction.",
        ],
      },
    ],
  },
};

export function getLegalPolicy(slug: string) {
  return LEGAL_POLICIES[slug] ?? null;
}
