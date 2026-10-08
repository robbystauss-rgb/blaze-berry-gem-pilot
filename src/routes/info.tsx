import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublishedContent } from "@/lib/commerce/public";
import { label } from "@/lib/commerce/types";
export const Route = createFileRoute("/info")({
  validateSearch: z.object({
    page: z
      .enum(["contact", "shipping_policy", "refund_policy", "privacy_policy"])
      .default("contact"),
  }),
  loader: () => getPublishedContent(),
  component: Info,
});
function Info() {
  const { page } = Route.useSearch();
  const content = Route.useLoaderData();
  return (
    <section className="site-container page-top-space page-bottom-space">
      <h1 className="font-display text-4xl">{label(page)}</h1>
      {page === "contact" ? (
        <div className="mt-6 space-y-4">
          {content.contact_email && (
            <p>
              <a href={"mailto:" + content.contact_email}>{content.contact_email}</a>
            </p>
          )}
          {content.contact_phone && <p>{content.contact_phone}</p>}
          {!content.contact_email && !content.contact_phone && (
            <p>Contact details have not been published through store management.</p>
          )}
        </div>
      ) : (
        <p className="mt-6 max-w-3xl whitespace-pre-wrap leading-7">
          {content[page] ||
            "This policy has not yet been published through store management. Contact the store for current terms."}
        </p>
      )}
    </section>
  );
}
