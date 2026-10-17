import { useEffect, useState } from "react";
import { z } from "zod";
import { CONTENT_KEYS } from "@/lib/commerce/types";
import {
  CONTENT_LABELS,
  INFO_PAGES,
  pageSeoSchema,
  parsePublicField,
  type ContentKey,
} from "@/lib/commerce/content-fields";
import { useOwnerDocuments } from "./use-owner-documents";
import { PublishingControls } from "./publishing-controls";
import { InfoContent } from "@/components/content/info-content";

export function ContentPagesEditor() {
  const state = useOwnerDocuments<{ value: string }>("content");
  const [key, setKey] = useState<ContentKey>("about_story"),
    [value, setValue] = useState(""),
    [phone, setPhone] = useState(false),
    [seoPage, setSeoPage] = useState<(typeof INFO_PAGES)[number]>("about");
  const row = state.rows.find((row) => row.key === key);
  useEffect(() => {
    setValue(row?.draft.value ?? "");
  }, [key, row?.version, row?.draft.value]);
  if (state.loading) return <p role="status">Loading website drafts…</p>;
  if (state.error && !state.loaded)
    return (
      <section className="cc-panel">
        <p role="alert" className="cc-error">
          {state.error}
        </p>
        <button className="cc-button" onClick={() => void state.refresh()}>
          Retry
        </button>
      </section>
    );
  const faqs =
      parsePublicField(z.array(z.object({ question: z.string(), answer: z.string() })), value) ??
      [],
    links =
      parsePublicField(z.array(z.object({ label: z.string(), path: z.string() })), value) ?? [],
    seo = parsePublicField(pageSeoSchema, value) ?? {};
  const preview = Object.fromEntries(state.rows.map((row) => [row.key, row.draft.value]));
  preview[key] = value;
  const page =
    key === "faq_items"
      ? "faq"
      : key === "contact_email" || key === "contact_phone"
        ? "contact"
        : key === "about_story"
          ? "about"
          : key === "shipping_policy" || key === "refund_policy" || key === "privacy_policy"
            ? key
            : null;
  return (
    <section className="cc-panel">
      <h2>Website pages & public information</h2>
      <p className="cc-help">
        Save private drafts, review the actual page, then publish. Every publication preserves a
        revision. Homepage hero and its overrides are managed in Homepage; checkout and credentials
        remain protected.
      </p>
      <label className="cc-field">
        Content to edit
        <select
          aria-label="Content to edit"
          value={key}
          onChange={(e) => setKey(e.target.value as ContentKey)}
        >
          {CONTENT_KEYS.map((k) => (
            <option key={k} value={k}>
              {CONTENT_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="cc-two-col">
        <div className="cc-form">
          {key === "faq_items" ? (
            <>
              {faqs.map((item, index) => (
                <fieldset key={index}>
                  <legend>Question {index + 1}</legend>
                  <label className="cc-field">
                    Question
                    <input
                      aria-label={`Question ${index + 1}`}
                      value={item.question}
                      maxLength={180}
                      onChange={(e) =>
                        setValue(
                          JSON.stringify(
                            faqs.map((q, i) =>
                              i === index ? { ...q, question: e.target.value } : q,
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="cc-field">
                    Answer
                    <textarea
                      aria-label={`Answer ${index + 1}`}
                      value={item.answer}
                      maxLength={2000}
                      onChange={(e) =>
                        setValue(
                          JSON.stringify(
                            faqs.map((q, i) =>
                              i === index ? { ...q, answer: e.target.value } : q,
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    className="cc-button secondary"
                    onClick={() => setValue(JSON.stringify(faqs.filter((_, i) => i !== index)))}
                  >
                    Remove question {index + 1}
                  </button>
                </fieldset>
              ))}
              <button
                className="cc-button secondary"
                disabled={faqs.length >= 30}
                onClick={() =>
                  setValue(
                    JSON.stringify([
                      ...faqs,
                      { question: "New question", answer: "Add the answer before publishing." },
                    ]),
                  )
                }
              >
                Add question
              </button>
            </>
          ) : key === "footer_links" ? (
            <>
              <p className="cc-help">
                Additional links appear beside existing policy and account links. Only supported
                storefront destinations are allowed.
              </p>
              {links.map((link, index) => (
                <fieldset key={index}>
                  <legend>Link {index + 1}</legend>
                  <label className="cc-field">
                    Label
                    <input
                      aria-label={`Link label ${index + 1}`}
                      maxLength={40}
                      value={link.label}
                      onChange={(e) =>
                        setValue(
                          JSON.stringify(
                            links.map((l, i) =>
                              i === index ? { ...l, label: e.target.value } : l,
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="cc-field">
                    Destination
                    <select
                      aria-label={`Link destination ${index + 1}`}
                      value={link.path}
                      onChange={(e) =>
                        setValue(
                          JSON.stringify(
                            links.map((l, i) => (i === index ? { ...l, path: e.target.value } : l)),
                          ),
                        )
                      }
                    >
                      {[
                        "/hats",
                        "/order",
                        "/actual-work",
                        "/shop",
                        "/quote-request",
                        "/info?page=contact",
                        "/info?page=about",
                        "/info?page=faq",
                      ].map((path) => (
                        <option key={path}>{path}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="cc-button secondary"
                    onClick={() => setValue(JSON.stringify(links.filter((_, i) => i !== index)))}
                  >
                    Remove link {index + 1}
                  </button>
                </fieldset>
              ))}
              <button
                className="cc-button secondary"
                disabled={links.length >= 8}
                onClick={() =>
                  setValue(JSON.stringify([...links, { label: "About", path: "/info?page=about" }]))
                }
              >
                Add footer link
              </button>
            </>
          ) : key === "page_seo" ? (
            <>
              <label className="cc-field">
                Information page
                <select
                  aria-label="SEO page"
                  value={seoPage}
                  onChange={(e) => setSeoPage(e.target.value as typeof seoPage)}
                >
                  {INFO_PAGES.map((page) => (
                    <option key={page}>{page}</option>
                  ))}
                </select>
              </label>
              <label className="cc-field">
                Page title
                <input
                  aria-label="Page SEO title"
                  value={seo[seoPage]?.title ?? ""}
                  maxLength={70}
                  onChange={(e) =>
                    setValue(
                      JSON.stringify({
                        ...seo,
                        [seoPage]: {
                          ...(seo[seoPage] ?? { description: "" }),
                          title: e.target.value,
                        },
                      }),
                    )
                  }
                />
              </label>
              <label className="cc-field">
                Meta description
                <textarea
                  aria-label="Page meta description"
                  value={seo[seoPage]?.description ?? ""}
                  maxLength={170}
                  onChange={(e) =>
                    setValue(
                      JSON.stringify({
                        ...seo,
                        [seoPage]: {
                          ...(seo[seoPage] ?? { title: "" }),
                          description: e.target.value,
                        },
                      }),
                    )
                  }
                />
              </label>
            </>
          ) : (
            <label className="cc-field">
              {CONTENT_LABELS[key]}
              <textarea
                aria-label={CONTENT_LABELS[key]}
                rows={key.includes("policy") || key === "about_story" ? 12 : 3}
                maxLength={key === "seo_title" ? 70 : key === "seo_description" ? 170 : 20000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          )}
        </div>
        <div>
          <div className="cc-actions">
            <button className="cc-button secondary" onClick={() => setPhone(false)}>
              Desktop preview
            </button>
            <button className="cc-button secondary" onClick={() => setPhone(true)}>
              Phone preview
            </button>
          </div>
          <div className={`cc-site-preview ${phone ? "phone" : ""}`}>
            <h3>{page ? CONTENT_LABELS[key] : "Draft preview"}</h3>
            {page ? (
              <InfoContent page={page} content={preview} />
            ) : key === "footer_links" ? (
              links.map((link, i) => (
                <p key={i}>
                  {link.label} → {link.path}
                </p>
              ))
            ) : key === "page_seo" ? (
              <>
                <strong>{seo[seoPage]?.title || "Default page title"}</strong>
                <p>{seo[seoPage]?.description || "Default description"}</p>
              </>
            ) : (
              <p className="whitespace-pre-wrap">{value || "No text entered."}</p>
            )}
          </div>
          {page && (
            <p className="cc-help">
              Save the draft, then{" "}
              <a href={`/info?page=${page}&ownerPreview=true`} target="_blank" rel="noreferrer">
                open the protected page preview
              </a>
              . Drafts are visible only to the owner.
            </p>
          )}
        </div>
      </div>
      <PublishingControls state={state} documentKey={key} body={{ value }} />
    </section>
  );
}
