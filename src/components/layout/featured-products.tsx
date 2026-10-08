import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getPublishedProducts } from "@/lib/commerce/public";
export function FeaturedProducts({ ids }: { ids: string }) {
  const [products, setProducts] = useState<
    Awaited<ReturnType<typeof getPublishedProducts>>["products"]
  >([]);
  useEffect(() => {
    void getPublishedProducts()
      .then((data) =>
        setProducts(
          data.products.filter((p) =>
            ids
              .split(",")
              .map((i) => i.trim())
              .includes(p.id),
          ),
        ),
      )
      .catch(() => {});
  }, [ids]);
  if (!products.length) return null;
  return (
    <section className="site-container py-12">
      <h2 className="font-display text-3xl">Featured merchandise</h2>
      <div className="cc-grid mt-6">
        {products.map((p) => (
          <Link key={p.id} to="/shop" className="cc-product-card">
            {p.images[0] && <img src={p.images[0]} alt={p.title} />}
            <div>
              <h2>{p.title}</h2>
              <p>{p.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
