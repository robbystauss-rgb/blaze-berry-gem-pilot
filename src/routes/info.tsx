import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublishedContent } from "@/lib/commerce/public";
import { getContentPreview } from "@/lib/commerce/content-preview";
import { INFO_PAGES, pageSeoSchema, parsePublicField } from "@/lib/commerce/content-fields";
import { InfoContent } from "@/components/content/info-content";
import { label } from "@/lib/commerce/types";
export const Route = createFileRoute("/info")({
  validateSearch: z.object({
    page: z.enum(INFO_PAGES).default("contact"),
    ownerPreview: z.boolean().optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({
    content: deps.ownerPreview ? await getContentPreview() : await getPublishedContent(),
    page: deps.page,
    preview: !!deps.ownerPreview,
  }),
  head: ({ loaderData }) => {
    const seo = parsePublicField(pageSeoSchema, loaderData?.content.page_seo)?.[
      loaderData?.page ?? "contact"
    ];
    return {
      meta: [
        { title: seo?.title || `${label(loaderData?.page ?? "contact")} · REC Mama Made` },
        ...(seo?.description ? [{ name: "description", content: seo.description }] : []),
        ...(loaderData?.preview ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
    };
  },
  component: Info,
});
function Info() {
  const { page, content, preview } = Route.useLoaderData();
  return (
    <section className="site-container page-top-space page-bottom-space">
      {preview && (
        <p role="status" className="mb-4 rounded-xl border border-border p-4">
          Private draft preview — visible only to the owner. Changes reach customers after
          publication.
        </p>
      )}
      <h1 className="font-display text-4xl">
        {page === "about"
          ? "Our story"
          : page === "faq"
            ? "Frequently asked questions"
            : label(page)}
      </h1>
      <InfoContent page={page} content={content} />
    </section>
  );
}
