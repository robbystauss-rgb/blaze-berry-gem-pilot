import { useState } from "react";
import { FAMILIES, type FamilyId } from "@/lib/catalog";
import { HAT_MODEL_LABELS, HAT_MODEL_BLURBS } from "@/lib/hat-models";
import { mutateAdmin } from "@/lib/commerce/api";
import type { ProductRow } from "@/lib/commerce/types";
import { Field } from "./command-center";
export function BuilderCatalogEditor({
  products,
  refresh,
}: {
  products: ProductRow[];
  refresh: () => Promise<unknown>;
}) {
  const [family, setFamily] = useState<FamilyId>("112");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = products.find((p) => p.builder_family === family);
  return (
    <section className="cc-panel">
      <h2>Existing custom hat catalog</h2>
      <p>
        Update customer-facing titles and descriptions. Hat models, exact color photography, patch
        configuration, calibration and existing prices remain protected.
      </p>
      <label className="cc-field">
        Catalog model
        <select
          value={family}
          onChange={(e) => {
            setFamily(e.target.value as FamilyId);
            setMessage("");
          }}
        >
          {Object.keys(FAMILIES).map((f) => (
            <option value={f} key={f}>
              {f} · {FAMILIES[f as FamilyId].label}
            </option>
          ))}
        </select>
      </label>
      <form
        key={family + current?.version}
        className="cc-form mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await mutateAdmin({
              data: {
                action: "product.builder_content",
                payload: {
                  family,
                  title: String(f.get("title")),
                  description: String(f.get("description")),
                  version: current?.version ?? 0,
                },
              },
            });
            setMessage("Catalog content saved.");
            await refresh();
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Unable to save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          name="title"
          title="Catalog title"
          value={current?.title ?? HAT_MODEL_LABELS[family] ?? family}
          required
        />
        <Field
          name="description"
          title="Catalog description"
          type="textarea"
          value={current?.description ?? HAT_MODEL_BLURBS[family] ?? ""}
        />
        <button className="cc-button secondary" disabled={busy}>
          Save catalog content
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
