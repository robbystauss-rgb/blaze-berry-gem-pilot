import { useState } from "react";
import catalog from "@/data/master-catalog.json";
import {
  LEATHERETTES,
  PATCH_SHAPES,
  PLACEMENTS,
  colorsForFamily,
  type FamilyId,
} from "@/lib/catalog";
import { isRetiredHatModel } from "@/lib/catalog-lifecycle";
import { physicalPatch, dimensionLabel } from "@/lib/patch-physical";
import {
  type CustomerAsset,
  type CustomerDesign,
  type CustomerProfile,
  type SavedBuild,
} from "@/lib/commerce/customer-schemas";
import { getPhoneOrderPrice, savePhoneOrder, saveVaultDesign } from "@/lib/commerce/customer-api";
import { dollarsToCents } from "@/lib/commerce/manual-payment";
import { ownerError } from "@/lib/commerce/errors";
import { label, money } from "@/lib/commerce/types";
import { VaultPreview } from "./vault-preview";

function newSavedBuild(): SavedBuild {
  return {
    orderType: "hat",
    modelId: "112",
    variantId: "112:black",
    leatherette: "buckskin",
    patchShape: "Rounded Rectangle",
    patchSize: "medium",
    physicalInches: physicalPatch("Rounded Rectangle", "medium"),
    placement: "front-center",
    patchPosition: { version: 2, anchor: { x: 0.5, y: 0.5 } },
    patchText: "",
    quantity: 1,
    notes: "",
    previewSnapshot: null,
  };
}
const models = catalog.models.filter((m) => m.bucket === "ready" && !isRetiredHatModel(m.id));
export function PhoneOrderStudio({
  customer,
  assets,
  designs,
  initialDesign,
  saveOnly = false,
  onClose,
  onSaved,
  onOrder,
}: {
  customer: CustomerProfile;
  assets: CustomerAsset[];
  designs: CustomerDesign[];
  initialDesign?: CustomerDesign;
  saveOnly?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onOrder: (id: string) => void;
}) {
  const [step, setStep] = useState(initialDesign ? 1 : 0),
    [configuration, setConfiguration] = useState<SavedBuild>(
      () => initialDesign?.configuration ?? newSavedBuild(),
    );
  const [source, setSource] = useState(initialDesign),
    [assetId, setAssetId] = useState(initialDesign?.artwork_asset_id ?? "");
  const [designId] = useState(() => initialDesign?.id ?? crypto.randomUUID()),
    [designVersion, setDesignVersion] = useState(initialDesign?.version ?? 0);
  const [name, setName] = useState(initialDesign?.name ?? ""),
    [saveUpdated, setSaveUpdated] = useState(true),
    [revisionNote, setRevisionNote] = useState("Saved for this customer's next order");
  const [price, setPrice] = useState<Awaited<ReturnType<typeof getPhoneOrderPrice>> | null>(null),
    [shipping, setShipping] = useState("0.00"),
    [tax, setTax] = useState("0.00"),
    [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestId] = useState(() => {
    const key = `rec-phone-request:${customer.id}`;
    try {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch {
      return crypto.randomUUID();
    }
  });
  const change = (next: Partial<SavedBuild>) => {
    setConfiguration((old) => ({ ...old, ...next, previewSnapshot: null }));
    setPrice(null);
    setReviewed(false);
  };
  const selectedModel = models.find((m) => m.id === configuration.modelId),
    selectedAsset = assets.find((a) => a.id === assetId);
  const choose = (d?: CustomerDesign) => {
    setSource(d);
    setConfiguration(d?.configuration ?? newSavedBuild());
    setAssetId(d?.artwork_asset_id ?? "");
    setName(d?.name ?? "");
    setDesignVersion(d?.version ?? 0);
    setStep(1);
    setPrice(null);
    setError("");
  };
  async function review() {
    setBusy(true);
    setError("");
    try {
      const quote = await getPhoneOrderPrice({ data: { customerId: customer.id, configuration } });
      setPrice(quote);
      setStep(2);
    } catch (e) {
      setError(ownerError(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!name.trim() && (saveOnly || saveUpdated))
        throw Error("Give this reusable design a name.");
      if (!saveOnly && (!price || !reviewed))
        throw Error(
          "Review current pricing, delivery, shipping and tax before creating this draft.",
        );
      let version = designVersion;
      const currentDesignId = source?.id ?? designId;
      if (saveOnly || saveUpdated) {
        const saved = await saveVaultDesign({
          data: {
            id: currentDesignId,
            customerId: customer.id,
            version,
            name,
            collection: source?.collection ?? "",
            configuration,
            artworkAssetId: assetId || null,
            note: revisionNote,
            sourceItemId: null,
            approvedProofId: null,
          },
        });
        version = saved.revision;
        setDesignVersion(version);
      }
      if (saveOnly) {
        await onSaved();
        onClose();
        return;
      }
      const result = await savePhoneOrder({
        data: {
          requestId,
          customerId: customer.id,
          designId: saveUpdated || source ? currentDesignId : null,
          revision: saveUpdated || source ? version : null,
          configuration,
          artworkAssetId: assetId || null,
          expectedTotal: price!.totalCents,
          expectedPriceRevision: price!.priceRevision,
          expectedPreviewSignature: price!.previewSignature,
          shipping: dollarsToCents(shipping),
          tax: dollarsToCents(tax),
          chargesReviewed: true,
        },
      });
      try {
        sessionStorage.removeItem(`rec-phone-request:${customer.id}`);
      } catch {
        /* Optional tab recovery. */
      }
      await onSaved();
      onOrder(result.id);
    } catch (e) {
      setError(ownerError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cc-panel cc-phone-studio" aria-label="Phone order studio">
      <div className="cc-panel-heading">
        <div>
          <p className="cc-eyebrow">
            {saveOnly ? "CUSTOMER DESIGN VAULT" : "OWNER-ASSISTED ORDER"} · C-{customer.number}
          </p>
          <h2>{saveOnly ? "Save a reusable design" : "New Phone Order"}</h2>
          <p>
            {customer.name} · {customer.phone || customer.email || "Contact preference to confirm"}
          </p>
        </div>
        <button className="cc-button secondary" onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>
      <ol className="cc-stepper" aria-label="Phone order steps">
        {["Choose a design", "Customize", "Review & save"].map((title, index) => (
          <li key={title} aria-current={step === index ? "step" : undefined}>
            <span>{index + 1}</span>
            {title}
          </li>
        ))}
      </ol>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {step === 0 ? (
        <div className="cc-vault-grid">
          <button className="cc-choice-card" onClick={() => choose()}>
            <h3>Start from scratch</h3>
            <p>Choose exact products and attach this customer's source artwork.</p>
          </button>
          {designs
            .filter((d) => d.state !== "archived")
            .map((d) => (
              <button key={d.id} className="cc-choice-card" onClick={() => choose(d)}>
                <h3>{d.name}</h3>
                <p>
                  Richardson {d.configuration.modelId} · {d.configuration.physicalInches.width}″ ×{" "}
                  {d.configuration.physicalInches.height}″ · revision {d.version}
                </p>
                <small>{d.compatibility.join(" ") || "Repeat or modify this saved work"}</small>
              </button>
            ))}
        </div>
      ) : (
        <>
          <div className="cc-phone-grid">
            <div className="cc-phone-preview">
              <VaultPreview configuration={configuration} asset={selectedAsset} />
              <p className="cc-help">
                Private mock-up. Original artwork is preserved separately. Every new phone order
                requires a current approved proof.
              </p>
            </div>
            <div className="cc-form">
              {step === 1 ? (
                <fieldset disabled={busy} className="cc-customer-fields">
                  <label className="cc-field cc-wide">
                    Design / project name
                    <input
                      aria-label="Design / project name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={160}
                      placeholder="Navy 112 · turquoise logo"
                    />
                  </label>
                  <label className="cc-field">
                    Product
                    <select
                      aria-label="Product type"
                      value={configuration.orderType}
                      onChange={(e) =>
                        change({ orderType: e.target.value as SavedBuild["orderType"] })
                      }
                    >
                      <option value="hat">Hat + patch</option>
                      <option value="patch">Patch only</option>
                    </select>
                  </label>
                  <label className="cc-field">
                    Exact hat model
                    <select
                      aria-label="Exact hat model"
                      value={configuration.modelId}
                      onChange={(e) => change({ modelId: e.target.value, variantId: "" })}
                    >
                      {!selectedModel && (
                        <option value={configuration.modelId}>
                          Unavailable model: {configuration.modelId}
                        </option>
                      )}
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          Richardson {m.id} · {m.officialName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cc-field cc-wide">
                    Exact colorway
                    <select
                      aria-label="Exact colorway"
                      value={configuration.variantId}
                      onChange={(e) => change({ variantId: e.target.value })}
                    >
                      <option value="">Choose this model's colorway</option>
                      {selectedModel?.colorways
                        .filter((c) =>
                          colorsForFamily(configuration.modelId as FamilyId).includes(
                            c.officialName,
                          ),
                        )
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.officialName}
                          </option>
                        ))}
                      {configuration.variantId &&
                        !selectedModel?.colorways.some((v) => v.id === configuration.variantId) && (
                          <option value={configuration.variantId}>
                            Unavailable saved colorway
                          </option>
                        )}
                    </select>
                  </label>
                  <label className="cc-field">
                    Patch material
                    <select
                      aria-label="Patch material"
                      value={configuration.leatherette}
                      onChange={(e) => change({ leatherette: e.target.value })}
                    >
                      {LEATHERETTES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cc-field">
                    Patch shape
                    <select
                      aria-label="Patch shape"
                      value={configuration.patchShape}
                      onChange={(e) =>
                        change({
                          patchShape: e.target.value,
                          physicalInches: physicalPatch(e.target.value, configuration.patchSize),
                        })
                      }
                    >
                      {PATCH_SHAPES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label className="cc-field">
                    Physical patch size
                    <select
                      aria-label="Physical patch size"
                      value={configuration.patchSize}
                      onChange={(e) =>
                        change({
                          patchSize: e.target.value as SavedBuild["patchSize"],
                          physicalInches: physicalPatch(
                            configuration.patchShape,
                            e.target.value as SavedBuild["patchSize"],
                          ),
                        })
                      }
                    >
                      {(["small", "medium", "large"] as const).map((size) => (
                        <option key={size} value={size}>
                          {label(size)} · {dimensionLabel(configuration.patchShape, size)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cc-field">
                    Quantity
                    <input
                      aria-label="Quantity"
                      type="number"
                      min={1}
                      max={250}
                      step={1}
                      value={configuration.quantity}
                      onChange={(e) => change({ quantity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="cc-field cc-wide">
                    Original / production artwork
                    <select
                      aria-label="Source artwork"
                      value={assetId}
                      onChange={(e) => setAssetId(e.target.value)}
                    >
                      <option value="">Text-only design</option>
                      {assets
                        .filter((a) => ["original", "production"].includes(a.kind))
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} · {a.kind}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="cc-field cc-wide">
                    Design text
                    <input
                      aria-label="Design text"
                      value={configuration.patchText}
                      onChange={(e) => change({ patchText: e.target.value })}
                      maxLength={2000}
                    />
                  </label>
                  <label className="cc-field">
                    Placement
                    <select
                      aria-label="Patch placement"
                      value={configuration.placement}
                      onChange={(e) => change({ placement: e.target.value })}
                    >
                      {PLACEMENTS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="cc-field">
                    <span>Position on crown</span>
                    {(["x", "y"] as const).map((axis) => (
                      <label key={axis}>
                        {axis === "x" ? "Across" : "Height"}
                        <input
                          type="range"
                          min={0.15}
                          max={0.85}
                          step={0.01}
                          aria-label={
                            axis === "x" ? "Crown horizontal position" : "Crown vertical position"
                          }
                          value={configuration.patchPosition?.anchor[axis] ?? 0.5}
                          onChange={(e) =>
                            change({
                              patchPosition: {
                                version: 2,
                                anchor: {
                                  x: configuration.patchPosition?.anchor.x ?? 0.5,
                                  y: configuration.patchPosition?.anchor.y ?? 0.5,
                                  [axis]: Number(e.target.value),
                                },
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="cc-field cc-wide">
                    Design / order instructions
                    <textarea
                      aria-label="Design / order instructions"
                      value={configuration.notes}
                      onChange={(e) => change({ notes: e.target.value })}
                      maxLength={4000}
                      rows={3}
                    />
                  </label>
                </fieldset>
              ) : (
                <>
                  <h3>Current-price review</h3>
                  <p>
                    Richardson {configuration.modelId} ·{" "}
                    {selectedModel?.colorways.find((v) => v.id === configuration.variantId)
                      ?.officialName ?? "Unavailable saved color"}
                    <br />
                    {`${configuration.physicalInches.width}″ × ${configuration.physicalInches.height}″`}{" "}
                    · {configuration.patchShape} ·{" "}
                    {LEATHERETTES.find((m) => m.id === configuration.leatherette)?.name}
                  </p>
                  {price && (
                    <dl className="cc-totals">
                      <div>
                        <dt>
                          {configuration.quantity} × {money(price.unitCents)}
                        </dt>
                        <dd>{money(price.subtotalCents)}</dd>
                      </div>
                      {price.discountCents > 0 && (
                        <div>
                          <dt>{price.discountLabel}</dt>
                          <dd>−{money(price.discountCents)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Merchandise</dt>
                        <dd>{money(price.totalCents)}</dd>
                      </div>
                      {price.bonus > 0 && (
                        <div>
                          <dt>Published bonus hats</dt>
                          <dd>
                            {price.bonus} · {price.fulfilled} to fulfill
                          </dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {!saveOnly && (
                    <>
                      <label className="cc-field">
                        Reviewed shipping ($)
                        <input
                          aria-label="Reviewed shipping ($)"
                          inputMode="decimal"
                          value={shipping}
                          onChange={(e) => {
                            setShipping(e.target.value);
                            setReviewed(false);
                          }}
                        />
                      </label>
                      <label className="cc-field">
                        Reviewed tax ($)
                        <input
                          aria-label="Reviewed tax ($)"
                          inputMode="decimal"
                          value={tax}
                          onChange={(e) => {
                            setTax(e.target.value);
                            setReviewed(false);
                          }}
                        />
                      </label>
                      <p className="cc-help">
                        Delivery preference: {label(customer.delivery_preference)}. Confirm current
                        charges under the existing shop rules; no automatic tax estimate is implied.
                      </p>
                      <label className="cc-check">
                        <input
                          type="checkbox"
                          checked={reviewed}
                          onChange={(e) => setReviewed(e.target.checked)}
                        />
                        I reviewed the exact selections, quantity, current price, delivery and
                        charges.
                      </label>
                      <label className="cc-check">
                        <input
                          type="checkbox"
                          checked={saveUpdated}
                          onChange={(e) => setSaveUpdated(e.target.checked)}
                        />
                        Save this updated design for future orders (keeps all earlier revisions).
                      </label>
                    </>
                  )}
                  {(saveOnly || saveUpdated) && (
                    <label className="cc-field">
                      Revision note
                      <input
                        aria-label="Revision note"
                        value={revisionNote}
                        minLength={5}
                        maxLength={500}
                        onChange={(e) => setRevisionNote(e.target.value)}
                      />
                    </label>
                  )}
                  {!customer.email && (
                    <p className="cc-notice">
                      Phone-only profile: this is an internal, unissued order draft. Add a genuine
                      email later when the existing invoice or proof service requires one.
                    </p>
                  )}
                  <p className="cc-help">
                    No previous payment, promotion code, proof approval or private link is reused.
                    Creating this draft sends no customer message.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="cc-phone-actions">
            <button
              className="cc-button secondary"
              disabled={busy}
              onClick={() => setStep(step === 2 ? 1 : 0)}
            >
              Back
            </button>
            {step === 1 ? (
              <button className="cc-button" disabled={busy} onClick={() => void review()}>
                {busy ? "Checking current availability…" : "Review current price"}
              </button>
            ) : (
              <button
                className="cc-button"
                disabled={busy || (!saveOnly && !reviewed)}
                onClick={() => void submit()}
              >
                {busy
                  ? "Saving…"
                  : saveOnly
                    ? "Save design to customer"
                    : "Create unissued phone-order draft"}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
