import { useRef, useState } from "react";
import { buyCatalogProduct } from "@/lib/commerce/public";
import { money, type ProductRow, type VariantRow } from "@/lib/commerce/types";
export function PublicProduct({
  product: p,
  variants,
}: {
  product: ProductRow;
  variants: VariantRow[];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ key: string; id: string } | null>(null);
  return (
    <article className="cc-product-card">
      {p.images[0] && <img src={p.images[0]} alt={p.title} />}
      <div>
        <h2>
          <a href={`/product/${p.id}`} className="block min-h-11">
            {p.title}
          </a>
        </h2>
        <p className="whitespace-pre-wrap">{p.description}</p>
        {p.images.slice(1).map((src) => (
          <img key={src} src={src} alt={p.title} />
        ))}
        <form
          className="cc-form mt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const f = new FormData(e.currentTarget);
            const payload = {
              variantId: String(f.get("variant")),
              quantity: Number(f.get("quantity")),
              name: String(f.get("name")),
              email: String(f.get("email")),
            };
            const key = JSON.stringify(payload);
            if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
            try {
              const result = await buyCatalogProduct({
                data: { ...payload, requestId: attempt.current.id },
              });
              window.location.assign(result.url);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Checkout could not start.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="cc-field">
            Variant
            <select name="variant" required>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title} · {money(v.price)}
                </option>
              ))}
            </select>
          </label>
          <label className="cc-field">
            Quantity
            <input name="quantity" type="number" min="1" max="250" defaultValue={1} required />
          </label>
          <label className="cc-field">
            Name
            <input name="name" required autoComplete="name" />
          </label>
          <label className="cc-field">
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          {error && (
            <p role="alert" className="cc-error">
              {error}
            </p>
          )}
          <button className="cc-button" disabled={busy}>
            Secure checkout
          </button>
        </form>
      </div>
    </article>
  );
}
