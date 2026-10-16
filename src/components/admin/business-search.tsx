import { useEffect, useState } from "react";
import { searchBusiness } from "@/lib/commerce/owner-api";
export function BusinessSearch() {
  const [query, setQuery] = useState(""),
    [data, setData] = useState<Awaited<ReturnType<typeof searchBusiness>> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (query.trim().length < 2) {
      setData(null);
      setError("");
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => {
      void searchBusiness({ data: query })
        .then((v) => {
          if (active) {
            setData(v);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("Search is unavailable. Try the section filters.");
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div className="cc-global-search" role="search">
      <input
        aria-label="Search all business records"
        value={query}
        maxLength={80}
        placeholder="Find orders, products, people"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
        }}
      />
      {query.trim().length >= 2 && (
        <div className="cc-global-results">
          {error ? (
            <p role="alert">{error}</p>
          ) : busy ? (
            <p role="status">Searching…</p>
          ) : data ? (
            <>
              <ul>
                {data.orders.map((o) => (
                  <li key={o.id}>
                    <a href={"/admin?section=orders&orderId=" + o.id}>
                      Order #{o.number} · {o.customer_name}
                    </a>
                  </li>
                ))}
                {data.products.map((p) => (
                  <li key={p.id}>
                    <a href={"/admin?section=products&query=" + encodeURIComponent(p.title)}>
                      Product · {p.title}
                    </a>
                  </li>
                ))}
                {data.customers.map((c) => (
                  <li key={c.customer_email}>
                    <a
                      href={
                        "/admin?section=customers&query=" + encodeURIComponent(c.customer_email)
                      }
                    >
                      Customer · {c.customer_name}
                    </a>
                  </li>
                ))}
              </ul>
              {!data.orders.length && !data.products.length && !data.customers.length && (
                <p>No matching business records.</p>
              )}
            </>
          ) : null}
          <button className="cc-button secondary" onClick={() => setQuery("")}>
            Close search
          </button>
        </div>
      )}
    </div>
  );
}
