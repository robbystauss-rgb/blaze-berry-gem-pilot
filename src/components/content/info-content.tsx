import { faqSchema, parsePublicField, type INFO_PAGES } from "@/lib/commerce/content-fields";
export function InfoContent({
  page,
  content,
}: {
  page: (typeof INFO_PAGES)[number];
  content: Record<string, string>;
}) {
  if (page === "contact")
    return (
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
    );
  if (page === "faq") {
    const items = parsePublicField(faqSchema, content.faq_items) ?? [];
    return (
      <div className="mt-6 max-w-3xl space-y-4">
        {items.length ? (
          items.map((item, index) => (
            <details key={index} className="rounded-xl border border-border p-4">
              <summary className="cursor-pointer font-semibold">{item.question}</summary>
              <p className="mt-3 whitespace-pre-wrap leading-7">{item.answer}</p>
            </details>
          ))
        ) : (
          <p>Questions about a custom project? Contact the store for help with your order.</p>
        )}
      </div>
    );
  }
  return (
    <p className="mt-6 max-w-3xl whitespace-pre-wrap leading-7">
      {content[page === "about" ? "about_story" : page] ||
        "This information has not yet been published through store management. Contact the store for current details."}
    </p>
  );
}
