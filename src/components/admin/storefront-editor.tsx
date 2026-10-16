import { useEffect, useState } from "react";
import { DEFAULT_STOREFRONT, storefrontSchema } from "@/lib/commerce/owner-schemas";
import type { z } from "zod";
import { getMediaLibrary } from "@/lib/commerce/owner-api";
import type { MediaRow } from "@/lib/commerce/media.server";
import { PublishingControls } from "./publishing-controls";
import { useOwnerDocuments } from "./use-owner-documents";
export function StorefrontEditor() {
  const state = useOwnerDocuments<z.infer<typeof storefrontSchema>>("storefront"),
    row = state.rows.find((r) => r.key === "main");
  const [content, setContent] = useState(DEFAULT_STOREFRONT),
    [media, setMedia] = useState<MediaRow[]>([]),
    [mobile, setMobile] = useState(false);
  useEffect(() => {
    setContent(row?.draft ?? DEFAULT_STOREFRONT);
  }, [row?.version, row?.draft]);
  useEffect(() => {
    void getMediaLibrary()
      .then(setMedia)
      .catch(() => {});
  }, []);
  return (
    <section className="cc-panel">
      <h2>Homepage & storefront settings</h2>
      <p>
        Preview controlled text and imagery, then publish. Store policies and public contact details
        remain available in Website. Originals and checkout configuration stay protected.
      </p>
      <div className="cc-two-col">
        <div className="cc-form">
          {(
            [
              "heroTitle",
              "heroText",
              "ctaLabel",
              "announcement",
              "leadTime",
              "seoTitle",
              "seoDescription",
            ] as const
          ).map((k) => {
            const title = {
              heroTitle: "Hero title",
              heroText: "Hero text",
              ctaLabel: "Primary button label",
              announcement: "Announcement bar",
              leadTime: "Production / proof information",
              seoTitle: "Homepage SEO title",
              seoDescription: "Homepage meta description",
            }[k];
            return (
              <div key={k} className="cc-field">
                <label htmlFor={"site-" + k}>{title}</label>
                <textarea
                  id={"site-" + k}
                  aria-label={title}
                  rows={k === "heroText" ? 3 : 2}
                  value={content[k]}
                  onChange={(e) => setContent({ ...content, [k]: e.target.value })}
                />
              </div>
            );
          })}
          <label className="cc-field">
            Primary button destination
            <select
              aria-label="Primary button destination"
              value={content.ctaPath}
              onChange={(e) =>
                setContent({ ...content, ctaPath: e.target.value as typeof content.ctaPath })
              }
            >
              {["/order", "/hats", "/actual-work", "/shop"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="cc-field">
            Hero finished-work image
            <select
              aria-label="Hero finished-work image"
              value={content.heroMediaId ?? ""}
              onChange={(e) => setContent({ ...content, heroMediaId: e.target.value || null })}
            >
              <option value="">Existing finished-work rotation</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.alt || m.name}
                </option>
              ))}
            </select>
          </label>
          {(["focalX", "focalY"] as const).map((k) => (
            <label key={k} className="cc-field">
              Image {k === "focalX" ? "horizontal" : "vertical"} focal point (%)
              <input
                type="range"
                min="0"
                max="100"
                value={content[k]}
                onChange={(e) => setContent({ ...content, [k]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={content.showFeaturedWork}
              onChange={(e) => setContent({ ...content, showFeaturedWork: e.target.checked })}
            />{" "}
            Show featured finished work
          </label>
        </div>
        <div>
          <div className="cc-actions">
            <button className="cc-button secondary" onClick={() => setMobile(false)}>
              Desktop preview
            </button>
            <button className="cc-button secondary" onClick={() => setMobile(true)}>
              Phone preview
            </button>
          </div>
          <div className={`cc-site-preview ${mobile ? "phone" : ""}`}>
            <small>{content.announcement || "Made to order · Proof before production"}</small>
            <h1>{content.heroTitle}</h1>
            <p>{content.heroText}</p>
            <span className="cc-button">{content.ctaLabel}</span>
            {content.heroMediaId && (
              <img
                src={"/api/media/" + content.heroMediaId}
                alt={media.find((m) => m.id === content.heroMediaId)?.alt ?? ""}
                style={{ objectPosition: `${content.focalX}% ${content.focalY}%` }}
              />
            )}
            <p>{content.leadTime}</p>
          </div>
          <p className="cc-help">
            Save the draft, then{" "}
            <a href="/?ownerPreview=true" target="_blank" rel="noreferrer">
              open the full protected homepage preview
            </a>{" "}
            to review the complete page.
          </p>
        </div>
      </div>
      <PublishingControls state={state} documentKey="main" body={content} />
    </section>
  );
}
