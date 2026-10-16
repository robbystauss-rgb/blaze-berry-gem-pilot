import { useEffect, useState } from "react";
import {
  FAMILIES,
  LEATHERETTES,
  PATCH_SHAPES,
  colorsForFamily,
  type FamilyId,
} from "@/lib/catalog";
import {
  DEFAULT_PRICING,
  type PriceBook,
  type PromoDefinition,
} from "@/lib/commerce/owner-schemas";
import {
  calculatePrice,
  promotionEligible,
  type Promotion,
} from "@/lib/commerce/price-calculation";
import { getPromotions, updatePromotion } from "@/lib/commerce/owner-api";
import { money } from "@/lib/commerce/types";
import { PublishingControls } from "./publishing-controls";
import { useOwnerDocuments } from "./use-owner-documents";
import { usePriceBook } from "@/lib/commerce/use-pricebook";
function Dollars({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: (v: number) => void;
}) {
  return (
    <label className="cc-field">
      {label} ($)
      <input
        type="number"
        min="0"
        max="10000"
        step=".01"
        value={(value / 100).toString()}
        onChange={(e) => change(Math.round(Number(e.target.value) * 100))}
      />
    </label>
  );
}
export function PricingEditor() {
  const state = useOwnerDocuments<PriceBook>("pricing"),
    row = state.rows.find((r) => r.key === "main");
  const [book, setBook] = useState<PriceBook>(structuredClone(DEFAULT_PRICING)),
    [family, setFamily] = useState<FamilyId>("112"),
    [color, setColor] = useState(colorsForFamily("112")[0]),
    [quantity, setQuantity] = useState(1);
  useEffect(() => {
    setBook(structuredClone(row?.draft ?? DEFAULT_PRICING));
  }, [row?.version, row?.draft]);
  const result = (() => {
    try {
      return calculatePrice(
        {
          orderType: "hat",
          family,
          colorway: color,
          leatherette: "buckskin",
          patchShape: "Rounded Rectangle",
          patchSize: "medium",
          quantity,
        },
        book,
      );
    } catch {
      return null;
    }
  })();
  return (
    <section className="cc-panel">
      <h2>Custom-builder price book</h2>
      <p>
        Prices are in USD. One best eligible offer applies: quantity pricing or one promotion.
        Existing buy-12 bonus quantities stay intact. Shipping and tax behavior is preserved.
      </p>
      {state.loading ? (
        <p role="status">Loading price book…</p>
      ) : (
        <>
          <h3>Exact hat model base prices</h3>
          <div className="cc-two-col">
            {Object.keys(FAMILIES).map((f) => (
              <Dollars
                key={f}
                label={`Richardson ${f}`}
                value={book.models[f]}
                change={(v) => setBook({ ...book, models: { ...book.models, [f]: v } })}
              />
            ))}
          </div>
          <Dollars
            label="Loose patch base"
            value={book.patchBase}
            change={(v) => setBook({ ...book, patchBase: v })}
          />
          <details className="cc-panel">
            <summary>Exact color price overrides</summary>
            <label className="cc-field">
              Model
              <select
                value={family}
                onChange={(e) => {
                  setFamily(e.target.value as FamilyId);
                  setColor(colorsForFamily(e.target.value as FamilyId)[0]);
                }}
              >
                {Object.keys(FAMILIES).map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="cc-field">
              Color
              <select value={color} onChange={(e) => setColor(e.target.value)}>
                {colorsForFamily(family).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <Dollars
              label="This exact color base"
              value={book.colors[family + ":" + color] ?? book.models[family]}
              change={(v) =>
                setBook({ ...book, colors: { ...book.colors, [family + ":" + color]: v } })
              }
            />
            <button
              className="cc-button secondary"
              onClick={() => {
                const colors = { ...book.colors };
                delete colors[family + ":" + color];
                setBook({ ...book, colors });
              }}
            >
              Use model base price
            </button>
          </details>
          <details className="cc-panel">
            <summary>Material, shape and size adjustments</summary>
            <p>Additive charges per purchased item, included in the customer quote.</p>
            <div className="cc-two-col">
              {LEATHERETTES.map((m) => (
                <Dollars
                  key={m.id}
                  label={m.name}
                  value={book.materials[m.id] ?? 0}
                  change={(v) => setBook({ ...book, materials: { ...book.materials, [m.id]: v } })}
                />
              ))}
              {PATCH_SHAPES.map((s) => (
                <Dollars
                  key={s}
                  label={s}
                  value={book.shapes[s] ?? 0}
                  change={(v) => setBook({ ...book, shapes: { ...book.shapes, [s]: v } })}
                />
              ))}
              {(["small", "medium", "large"] as const).map((s) => (
                <Dollars
                  key={s}
                  label={`${s} size`}
                  value={book.sizes[s]}
                  change={(v) => setBook({ ...book, sizes: { ...book.sizes, [s]: v } })}
                />
              ))}
            </div>
          </details>
          <h3>Quantity pricing</h3>
          {book.tiers.map((t, i) => (
            <div className="cc-actions" key={i}>
              <label className="cc-field">
                Minimum quantity
                <input
                  type="number"
                  min="2"
                  max="250"
                  value={t.minimum}
                  onChange={(e) =>
                    setBook({
                      ...book,
                      tiers: book.tiers.map((v, j) =>
                        j === i ? { ...v, minimum: Number(e.target.value) } : v,
                      ),
                    })
                  }
                />
              </label>
              <label className="cc-field">
                Percent discount
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={t.percent}
                  onChange={(e) =>
                    setBook({
                      ...book,
                      tiers: book.tiers.map((v, j) =>
                        j === i ? { ...v, percent: Number(e.target.value) } : v,
                      ),
                    })
                  }
                />
              </label>
              <button
                className="cc-button secondary"
                onClick={() => setBook({ ...book, tiers: book.tiers.filter((_, j) => j !== i) })}
              >
                Remove tier
              </button>
            </div>
          ))}
          <button
            className="cc-button secondary"
            onClick={() =>
              setBook({ ...book, tiers: [...book.tiers, { minimum: 24, percent: 10 }] })
            }
          >
            Add quantity tier
          </button>
          <div className="cc-project-preview">
            <h3>Draft price preview</h3>
            <p>
              Richardson {family} · {color} · medium buckskin rounded rectangle
            </p>
            <label className="cc-field">
              Purchased quantity
              <input
                type="number"
                min="1"
                max="250"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            {result ? (
              <p>
                {money(result.unitCents)} per item · subtotal {money(result.subtotalCents)} ·
                discount {money(result.discountCents)} · <b>Total {money(result.totalCents)}</b> ·{" "}
                {result.fulfilled} fulfilled
              </p>
            ) : (
              <p role="alert">Enter valid prices and quantity.</p>
            )}
          </div>
          <PublishingControls state={state} documentKey="main" body={book} />
        </>
      )}
    </section>
  );
}
const emptyDefinition = (): PromoDefinition => ({
  campaign: "",
  type: "percent",
  amount: 10,
  startsAt: null,
  endsAt: null,
  minimumSpend: 0,
  minimumQuantity: 1,
  families: [],
  orderType: "any",
  maximumUses: null,
  perCustomer: null,
  customerEmail: null,
  firstOrder: false,
  automatic: false,
  perItem: false,
});
export function PromotionEditor() {
  const publishedBook = usePriceBook();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getPromotions>>>([]),
    [p, setP] = useState<Promotion>(() => ({
      id: crypto.randomUUID(),
      code: "",
      definition: emptyDefinition(),
      state: "draft",
      version: 0,
    })),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [qty, setQty] = useState(1);
  async function load() {
    try {
      setRows(await getPromotions());
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function change(partial: Partial<PromoDefinition>) {
    setP({ ...p, definition: { ...p.definition, ...partial } });
  }
  async function save() {
    if (
      p.state === "active" &&
      !window.confirm("Activate this reviewed promotion in customer checkout?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await updatePromotion({ data: p });
      await load();
      setP({ ...p, version: p.version + 1 });
      setMessage("Promotion saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const s = {
    orderType: p.definition.orderType === "patch" ? ("patch" as const) : ("hat" as const),
    family: p.definition.families[0] ?? "112",
    colorway: colorsForFamily((p.definition.families[0] ?? "112") as FamilyId)[0] ?? "",
    leatherette: "buckskin",
    patchShape: "Rounded Rectangle",
    patchSize: "medium" as const,
    quantity: qty,
  };
  const preview = (() => {
    if (!publishedBook) return null;
    try {
      const live = { ...p, state: "active" };
      return promotionEligible(live, s, calculatePrice(s, publishedBook).subtotalCents, Date.now())
        ? calculatePrice(s, publishedBook, live)
        : null;
    } catch {
      return null;
    }
  })();
  const dateValue = (v: string | null) =>
    v
      ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
  return (
    <div className="cc-tool-stack">
      <section className="cc-panel">
        <h2>Promotion campaigns</h2>
        <p>
          Offers apply to custom-builder items. One best offer applies; codes do not stack.
          Identity-limited codes require the customer to sign in using their checkout email.
          Reserved uses remain held until payment or a verified cancellation/expiration.
        </p>
        <div className="cc-actions">
          <button
            className="cc-button secondary"
            onClick={() => {
              setP({
                id: crypto.randomUUID(),
                code: "",
                state: "draft",
                version: 0,
                definition: emptyDefinition(),
              });
              setMessage("");
            }}
          >
            New promotion
          </button>
          <button
            className="cc-button secondary"
            onClick={() =>
              setP({
                ...p,
                id: crypto.randomUUID(),
                version: 0,
                state: "draft",
                code: p.code.slice(0, 32) + "_COPY",
              })
            }
          >
            Duplicate as draft
          </button>
        </div>
        {rows.length ? (
          <div className="cc-records">
            {rows.map((r) => (
              <button
                className="cc-promo-row"
                key={r.id}
                onClick={() => {
                  setP(r);
                  setMessage("");
                }}
              >
                <b>
                  {r.code} · {r.definition.campaign}
                </b>
                <span>
                  {r.state} · {r.redemptions} paid uses · {r.reservations} reserved ·{" "}
                  {money(r.discount_value)} discount
                </span>
                <small>
                  {r.definition.endsAt
                    ? "Ends " + new Date(r.definition.endsAt).toLocaleString()
                    : "No expiration"}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p>No campaigns yet.</p>
        )}
      </section>
      <section className="cc-panel">
        <h2>{p.version ? "Edit promotion" : "Draft promotion"}</h2>
        {error && (
          <p className="cc-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="cc-success" role="status">
            {message}
          </p>
        )}
        <div className="cc-two-col">
          <div className="cc-form">
            <label className="cc-field">
              Code
              <input
                maxLength={40}
                value={p.code}
                onChange={(e) => setP({ ...p, code: e.target.value.toUpperCase() })}
              />
            </label>
            <label className="cc-field">
              Campaign name
              <input
                maxLength={120}
                value={p.definition.campaign}
                onChange={(e) => change({ campaign: e.target.value })}
              />
            </label>
            <label className="cc-field">
              Status
              <select
                aria-label="Status"
                value={p.state}
                onChange={(e) => setP({ ...p, state: e.target.value })}
              >
                {["draft", "active", "inactive", "archived"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="cc-field">
              Discount type
              <select
                aria-label="Discount type"
                value={p.definition.type}
                onChange={(e) =>
                  change({ type: e.target.value as "percent" | "fixed", amount: 10 })
                }
              >
                <option value="percent">Percentage</option>
                <option value="fixed">Fixed dollars</option>
              </select>
            </label>
            {p.definition.type === "fixed" ? (
              <Dollars
                label="Discount"
                value={p.definition.amount}
                change={(v) => change({ amount: v })}
              />
            ) : (
              <label className="cc-field">
                Percentage
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={p.definition.amount}
                  onChange={(e) => change({ amount: Number(e.target.value) })}
                />
              </label>
            )}
            {p.definition.type === "fixed" && (
              <label>
                <input
                  type="checkbox"
                  checked={p.definition.perItem}
                  onChange={(e) => change({ perItem: e.target.checked })}
                />{" "}
                Apply fixed amount per purchased item
              </label>
            )}
            <Dollars
              label="Minimum subtotal"
              value={p.definition.minimumSpend}
              change={(v) => change({ minimumSpend: v })}
            />
            <label className="cc-field">
              Minimum purchased quantity
              <input
                type="number"
                min="1"
                max="250"
                value={p.definition.minimumQuantity}
                onChange={(e) => change({ minimumQuantity: Number(e.target.value) })}
              />
            </label>
            <label className="cc-field">
              Product path
              <select
                aria-label="Product path"
                value={p.definition.orderType}
                onChange={(e) => change({ orderType: e.target.value as "hat" | "patch" | "any" })}
              >
                <option value="any">Hats and loose patches</option>
                <option value="hat">Hats only</option>
                <option value="patch">Loose patches only</option>
              </select>
            </label>
            <fieldset>
              <legend>Eligible exact models (none selected means all)</legend>
              <div className="cc-actions">
                {Object.keys(FAMILIES).map((f) => (
                  <label key={f}>
                    <input
                      type="checkbox"
                      checked={p.definition.families.includes(f)}
                      onChange={(e) =>
                        change({
                          families: e.target.checked
                            ? [...p.definition.families, f]
                            : p.definition.families.filter((v) => v !== f),
                        })
                      }
                    />
                    {f}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="cc-form">
            <p className="cc-help">
              Dates use {Intl.DateTimeFormat().resolvedOptions().timeZone}; stored as UTC instants.
              End time is exclusive.
            </p>
            {(["startsAt", "endsAt"] as const).map((k) => (
              <label className="cc-field" key={k}>
                {k === "startsAt" ? "Starts" : "Expires"}
                <input
                  type="datetime-local"
                  value={dateValue(p.definition[k])}
                  onChange={(e) =>
                    change({ [k]: e.target.value ? new Date(e.target.value).toISOString() : null })
                  }
                />
              </label>
            ))}
            {(["maximumUses", "perCustomer"] as const).map((k) => (
              <label className="cc-field" key={k}>
                {k === "maximumUses" ? "Overall use limit" : "Per signed-in customer limit"}
                <input
                  type="number"
                  min="1"
                  value={p.definition[k] ?? ""}
                  placeholder="Unlimited"
                  onChange={(e) => change({ [k]: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
            ))}
            <label className="cc-field">
              Specific signed-in customer email
              <input
                type="email"
                value={p.definition.customerEmail ?? ""}
                onChange={(e) => change({ customerEmail: e.target.value || null })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={p.definition.firstOrder}
                onChange={(e) => change({ firstOrder: e.target.checked })}
              />{" "}
              First paid order only
            </label>
            <label>
              <input
                type="checkbox"
                checked={p.definition.automatic}
                onChange={(e) => change({ automatic: e.target.checked })}
              />{" "}
              Apply automatically when eligible
            </label>
            <div className="cc-project-preview">
              <h3>Eligibility preview</h3>
              <label className="cc-field">
                Test purchased quantity
                <input
                  type="number"
                  min="1"
                  max="250"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </label>
              <p>
                {preview
                  ? `${s.family}: ${money(preview.subtotalCents)} − ${money(preview.discountCents)} = ${money(preview.totalCents)}`
                  : !publishedBook
                    ? "Published prices are unavailable. Reload to retry."
                    : "Not eligible for this date, quantity or subtotal."}
              </p>
              <p className="cc-help">
                Uses published prices for a medium buckskin rounded rectangle
                {s.orderType === "hat" ? ` on ${s.colorway}` : " loose patch"}. Identity, stock,
                competing offers and live use limits are checked by the checkout server.
              </p>
            </div>
          </div>
        </div>
        <button className="cc-button" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save promotion"}
        </button>
      </section>
    </div>
  );
}
