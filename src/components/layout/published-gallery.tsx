import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { getPublicGallery } from "@/lib/commerce/owner-api";
import type { FamilyId } from "@/lib/catalog";
export function PublishedGallery({
  projects,
  featured = false,
}: {
  projects: Awaited<ReturnType<typeof getPublicGallery>>;
  featured?: boolean;
}) {
  const [category, setCategory] = useState("All"),
    [query, setQuery] = useState("");
  const offered = projects.filter((p) => !featured || p.published.featured);
  if (!offered.length) return null;
  const categories = ["All", ...new Set(offered.map((p) => p.published.category))];
  return (
    <section
      className="published-work"
      aria-label={featured ? "Featured finished work" : "Finished-work projects"}
    >
      <h2 className="font-display text-3xl font-semibold">
        {featured ? "Featured finished work" : "From our workshop"}
      </h2>
      {!featured && (
        <div className="published-work-filters">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Find a project
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title, category or tag"
            />
          </label>
        </div>
      )}
      <div className="published-work-grid">
        {offered
          .filter(
            ({ published: p }) =>
              (category === "All" || p.category === category) &&
              (p.title + " " + p.category + " " + p.tags.join(" "))
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .slice(0, featured ? 4 : 100)
          .map(({ key, published: p, media, eligible, unavailableReason }) => {
            const cover = media.find((m) => m.id === p.coverId);
            return (
              <article className="published-work-card" key={key}>
                <img
                  src={`/api/media/${p.coverId}?v=${cover?.version ?? 1}`}
                  alt={cover?.alt || p.title}
                  loading="lazy"
                />
                <div>
                  <p className="tech-label">{p.category}</p>
                  <h3>{p.title}</h3>
                  <p>{p.description}</p>
                  {eligible && p.configuration ? (
                    <Link
                      to="/order"
                      search={{
                        type: "hat",
                        family: p.family as FamilyId,
                        variant: p.configuration.variantId,
                        material: p.configuration.material,
                        shape: p.configuration.shape,
                        size: p.configuration.size,
                        source: "gallery",
                      }}
                    >
                      Make one like this →
                    </Link>
                  ) : (
                    <>
                      <p>{unavailableReason}</p>
                      <Link to="/quote-request">Ask about this example →</Link>
                    </>
                  )}
                  <p className="text-xs">
                    Product choices only. Add your own artwork; customer logos are not included.
                  </p>
                  {p.mediaIds.length > 1 && (
                    <details>
                      <summary>View {p.mediaIds.length} project photos</summary>
                      <div className="published-work-details">
                        {p.mediaIds.map((id) => (
                          <img
                            key={id}
                            src={`/api/media/${id}?v=${media.find((m) => m.id === id)?.version ?? 1}`}
                            alt={media.find((m) => m.id === id)?.alt || p.title}
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}
