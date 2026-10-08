import { useState, useEffect } from "react";
import { getBearerToken } from "@/lib/auth/client";
import { ArrowUp, ArrowDown, X, Eye } from "lucide-react";
import { uploadProductImage } from "@/lib/commerce/api";
import { type ProductRow, type VariantRow, money } from "@/lib/commerce/types";
import { Field, Badge } from "./command-center";
type EditableVariant = {
  id?: string;
  title: string;
  sku: string;
  price: number;
  active: boolean;
  options: Record<string, string>;
};
export function ProductEditor({
  product,
  variants,
  busy,
  save,
}: {
  product: ProductRow | null;
  variants: VariantRow[];
  busy: boolean;
  save: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [rows, setRows] = useState<EditableVariant[]>(
    variants.length
      ? variants
      : [{ title: "Default", sku: "", price: 0, active: true, options: {} }],
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [title, setTitle] = useState(product?.title ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const move = (index: number, delta: number) => {
    const next = [...images];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setImages(next);
  };
  return (
    <form
      className="cc-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void save({
          id: product?.id,
          version: product?.version,
          title,
          description,
          category: String(f.get("category")),
          state: String(f.get("state")),
          images,
          seoTitle: String(f.get("seoTitle")),
          seoDescription: String(f.get("seoDescription")),
          variants: rows,
        });
      }}
    >
      <div className="cc-form-grid">
        <Field name="title" title="Product title" required>
          <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field
          name="category"
          title="Category"
          value={product?.category ?? "Merchandise"}
          required
        />
        <Field name="state" title="Publication status">
          <select name="state" defaultValue={product?.state ?? "draft"}>
            {["draft", "active", "inactive", "archived"].map((s) => (
              <option value={s} key={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field name="description" title="Description">
        <textarea
          name="description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <h3>Product images</h3>
      <div className="cc-image-editor">
        {images.map((url, i) => (
          <div key={url + i}>
            <img src={url} alt={`Product image ${i + 1}`} />
            <div className="cc-actions">
              <button
                type="button"
                className="cc-icon"
                disabled={i === 0}
                aria-label={`Move image ${i + 1} up`}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="cc-icon"
                disabled={i === images.length - 1}
                aria-label={`Move image ${i + 1} down`}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                className="cc-icon"
                aria-label={`Remove image ${i + 1}`}
                onClick={() => setImages(images.filter((_, j) => j !== i))}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <Field name="upload" title={uploading ? "Uploading…" : "Upload PNG, JPG or WebP (max 4 MB)"}>
        <input
          name="upload"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading || images.length >= 12}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 4_000_000) {
              setError("Image must be smaller than 4 MB.");
              return;
            }
            setUploading(true);
            setError("");
            try {
              const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
              const result = await uploadProductImage({ data });
              setImages((previous) => [...previous, result.url]);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Image upload failed.");
            } finally {
              setUploading(false);
            }
          }}
        />
      </Field>
      <h3>Variants & pricing</h3>
      <p className="cc-help">
        Removing a variant makes it inactive. Existing order snapshots remain intact. Prices are in
        USD.
      </p>
      {rows.map((row, i) => (
        <div className="cc-variant-editor" key={row.id ?? i}>
          <label className="cc-field">
            Variant (size / color)
            <input
              value={row.title}
              required
              onChange={(e) =>
                setRows(rows.map((v, j) => (j === i ? { ...v, title: e.target.value } : v)))
              }
            />
          </label>
          <label className="cc-field">
            SKU
            <input
              value={row.sku}
              required
              onChange={(e) =>
                setRows(rows.map((v, j) => (j === i ? { ...v, sku: e.target.value } : v)))
              }
            />
          </label>
          <label className="cc-field">
            Price ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={row.price / 100}
              required
              onChange={(e) =>
                setRows(
                  rows.map((v, j) =>
                    j === i ? { ...v, price: Math.round(Number(e.target.value) * 100) } : v,
                  ),
                )
              }
            />
          </label>
          <label className="cc-check">
            <input
              type="checkbox"
              checked={row.active}
              onChange={(e) =>
                setRows(rows.map((v, j) => (j === i ? { ...v, active: e.target.checked } : v)))
              }
            />
            Active
          </label>
          {["size", "color", "material"].map((key) => (
            <label className="cc-field" key={key}>
              {key[0].toUpperCase() + key.slice(1)} option
              <input
                maxLength={100}
                value={row.options[key] ?? ""}
                onChange={(e) =>
                  setRows(
                    rows.map((v, j) =>
                      j === i ? { ...v, options: { ...v.options, [key]: e.target.value } } : v,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="cc-button secondary"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            Remove variant
          </button>
          <small>Inventory key: {row.id ? "variant:" + row.id : "Available after saving"}</small>
        </div>
      ))}
      <button
        type="button"
        className="cc-button secondary"
        onClick={() =>
          setRows([...rows, { title: "", sku: "", price: 0, active: true, options: {} }])
        }
      >
        Add variant
      </button>
      <div className="cc-form-grid">
        <Field name="seoTitle" title="SEO title" value={product?.seo_title ?? ""} />
        <Field
          name="seoDescription"
          title="SEO description"
          value={product?.seo_description ?? ""}
        />
      </div>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      <div className="cc-actions">
        <button type="button" className="cc-button secondary" onClick={() => setPreview(!preview)}>
          <Eye size={16} />
          Preview before publishing
        </button>
        <button className="cc-button" disabled={busy || uploading}>
          {busy ? "Saving…" : "Save product"}
        </button>
      </div>
      {preview && (
        <article className="cc-preview">
          <Badge value="preview" />
          {images[0] && <ProtectedProductImage src={images[0]} alt={title} />}
          <h2>{title || "Untitled product"}</h2>
          <p>{description}</p>
          {rows
            .filter((v) => v.active)
            .map((v, i) => (
              <p key={i}>
                {v.title} · {money(v.price)}
              </p>
            ))}
        </article>
      )}
    </form>
  );
}
function ProtectedProductImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState(src);
  useEffect(() => {
    const token = getBearerToken();
    setUrl(src);
    if (!token || !src.startsWith("/api/catalog-image/")) return;
    let disposed = false,
      objectUrl = "";
    const controller = new AbortController();
    void fetch(src, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) return;
        const blob = await r.blob();
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);
  return <img src={url} alt={alt} />;
}
