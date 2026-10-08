import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getPublishedProducts } from "@/lib/commerce/public";
import { PublicProduct } from "@/components/layout/public-product";
export const Route = createFileRoute("/shop")({
  component: Shop,
  head: () => ({ meta: [{ title: "Shop · REC Mama Made" }] }),
});
function Shop() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPublishedProducts>> | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void getPublishedProducts()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="site-container page-top-space page-bottom-space">
      <p className="tech-label">REC Mama Made</p>
      <h1 className="mt-3 font-display text-4xl">Shop merchandise</h1>
      {error ? (
        <p className="cc-error mt-6" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="mt-6" role="status">
          Loading products…
        </p>
      ) : !data.products.length ? (
        <p className="mt-6">
          More merchandise is coming soon. Explore our custom hats and patches through the existing
          builder.
        </p>
      ) : (
        <div className="cc-grid mt-8">
          {data.products.map((p) => (
            <PublicProduct
              key={p.id}
              product={p}
              variants={data.variants.filter((v) => v.product_id === p.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
