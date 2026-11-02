import { useCallback, useEffect, useState, useRef } from "react";
import { ArrowLeft, Plus, Phone, Upload, Download, Pencil, Archive, History } from "lucide-react";
import {
  actOnCustomer,
  getCustomerProfile,
  getVaultDesignHistory,
  searchCustomerProfiles,
  uploadCustomerAsset,
  exportCustomerProfile,
} from "@/lib/commerce/customer-api";
import { getBearerToken } from "@/lib/auth/client";
import { ownerError } from "@/lib/commerce/errors";
import { type CustomerAsset, type CustomerDesign } from "@/lib/commerce/customer-schemas";
import { MAX_NEW_UPLOAD_BYTES } from "@/lib/upload-limits";
import { label, money } from "@/lib/commerce/types";
import { Badge } from "./command-center";
import { CustomerProfileEditor } from "./customer-profile-editor";
import { PhoneOrderStudio } from "./phone-order-studio";
import { VaultPreview } from "./vault-preview";

async function downloadSource(id: string) {
  const token = getBearerToken(),
    response = await fetch(`/api/customer-artwork/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  if (!response.ok)
    throw Error(
      "Private artwork could not be downloaded. Sign in with customer permissions and retry.",
    );
  const url = URL.createObjectURL(await response.blob()),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    decodeURIComponent(
      response.headers.get("content-disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ?? "",
    ) ||
    response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ||
    "source-artwork";
  anchor.click();
  URL.revokeObjectURL(url);
}
export function CustomersWorkspace({
  initialId,
  externalSearch = "",
  owner,
  openOrder,
}: {
  initialId?: string;
  externalSearch?: string;
  owner: boolean;
  openOrder: (id: string) => void;
}) {
  const [search, setSearch] = useState(externalSearch),
    [rows, setRows] = useState<Awaited<ReturnType<typeof searchCustomerProfiles>>>([]);
  const [selected, setSelected] = useState<string | null>(initialId ?? null),
    [data, setData] = useState<Awaited<ReturnType<typeof getCustomerProfile>> | null>(null);
  const [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(false),
    [tab, setTab] = useState("designs");
  const [studio, setStudio] = useState<{ design?: CustomerDesign; saveOnly: boolean } | null>(null);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [revisionHistory, setRevisionHistory] = useState<{
    name: string;
    rows: Awaited<ReturnType<typeof getVaultDesignHistory>>;
  } | null>(null);
  const [mergeTarget, setMergeTarget] = useState(""),
    [merge, setMerge] = useState(false);
  useEffect(() => {
    setSearch(externalSearch);
  }, [externalSearch]);
  useEffect(() => {
    if (initialId) setSelected(initialId);
  }, [initialId]);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      if (selected) {
        const value = await getCustomerProfile({ data: selected });
        if (request === generation.current) setData(value);
      } else {
        const value = await searchCustomerProfiles({ data: search });
        if (request === generation.current) setRows(value);
      }
      if (request !== generation.current) return;
      setError("");
    } catch (e) {
      if (request === generation.current) setError(ownerError(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [selected, search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  const choose = (id: string) => {
    setSelected(id);
    setData(null);
    setTab("designs");
    setStudio(null);
    setRevisionHistory(null);
    setError("");
    setSuccess("");
  };
  const feedback = async (work: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
      setSuccess(message);
      await load();
    } catch (e) {
      setError(ownerError(e));
    } finally {
      setBusy(false);
    }
  };
  if (creating || (editing && data))
    return (
      <section className="cc-panel">
        <CustomerProfileEditor
          profile={editing ? data!.profile : undefined}
          cancel={() => {
            setCreating(false);
            setEditing(false);
          }}
          onSaved={async (id) => {
            setCreating(false);
            setEditing(false);
            choose(id);
            if (selected === id) await load();
          }}
        />
      </section>
    );
  if (!selected)
    return (
      <div className="cc-tool-stack">
        <div className="cc-panel cc-directory-intro">
          <div>
            <p className="cc-eyebrow">YOUR CUSTOMER RELATIONSHIPS</p>
            <h2>Remember the customer. Keep the work.</h2>
            <p>Find their artwork, repeat a favorite build, or start a phone order.</p>
          </div>
          <button className="cc-button" onClick={() => setCreating(true)}>
            <Plus size={18} /> Add Customer
          </button>
        </div>
        <label className="cc-field cc-customer-search">
          Find a customer
          <input
            type="search"
            aria-label="Find a customer"
            placeholder="Name, phone, email, customer # or order #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {error && (
          <p className="cc-error" role="alert">
            {error}
          </p>
        )}
        {loading && <p role="status">Searching your customer records…</p>}
        <div className="cc-customer-directory">
          {rows.map((c) => (
            <button className="cc-customer-row" key={c.id} onClick={() => choose(c.id)}>
              <span className="cc-avatar" aria-hidden="true">
                {c.name
                  .split(/\s+/)
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{c.name}</strong>
                <small>
                  C-{c.number} · {c.phone || c.email || "Contact not recorded"}
                </small>
                {c.business_name && <small>{c.business_name}</small>}
              </span>
              <span>
                <b>{c.order_count} orders</b>
                <small>
                  {c.archived
                    ? "Archived"
                    : c.origin === "historical_order"
                      ? "History · identity review available"
                      : "Owner-created profile"}
                </small>
              </span>
            </button>
          ))}
        </div>
        {!loading && !rows.length && (
          <div className="cc-empty">
            <h3>{search ? "No matching customer" : "Your customer directory starts here"}</h3>
            <p>
              Create a profile from a call, text or in-person conversation. Email and a website
              account are optional.
            </p>
            <button className="cc-button" onClick={() => setCreating(true)}>
              Add Customer
            </button>
          </div>
        )}
      </div>
    );
  if (!data)
    return (
      <section className="cc-panel">
        <button className="cc-button secondary" onClick={() => setSelected(null)}>
          Back to customers
        </button>
        <p role={error ? "alert" : "status"}>{error || "Opening private customer profile…"}</p>
      </section>
    );
  const c = data.profile;
  return (
    <div className="cc-tool-stack cc-customer-360">
      <button
        className="cc-link cc-back"
        onClick={() => {
          setSelected(null);
          setData(null);
          setStudio(null);
        }}
      >
        <ArrowLeft size={16} /> All customers
      </button>
      <header className="cc-panel cc-customer-header">
        <div className="cc-customer-identity">
          <span className="cc-avatar large" aria-hidden="true">
            {c.name
              .split(/\s+/)
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <p className="cc-eyebrow">CUSTOMER C-{c.number} · PRIVATE</p>
            <h2>{c.name}</h2>
            <p>{c.business_name}</p>
            <p>
              {c.phone || "Phone not recorded"}
              {c.email ? ` · ${c.email}` : " · Phone-only profile"}
            </p>
            <small>
              Prefers {label(c.preferred_contact)} · {label(c.delivery_preference)}
              {c.archived ? " · Archived" : ""}
            </small>
            <div className="cc-tag-list">
              {c.tags.map((tag) => (
                <span className="cc-badge" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="cc-actions">
          <button
            className="cc-button"
            disabled={c.archived}
            onClick={() => setStudio({ saveOnly: false })}
          >
            <Phone size={18} /> New Phone Order
          </button>
          <button
            className="cc-button secondary"
            disabled={c.archived}
            onClick={() => {
              setTab("assets");
              setStudio(null);
            }}
          >
            <Upload size={16} /> Upload Artwork
          </button>
          <button
            className="cc-button secondary"
            onClick={() => {
              setEditing(true);
              setStudio(null);
            }}
          >
            <Pencil size={16} /> Edit profile
          </button>
        </div>
      </header>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="cc-success" role="status">
          {success}
        </p>
      )}
      {studio ? (
        <PhoneOrderStudio
          key={studio.design?.id ?? (studio.saveOnly ? "new-design" : "new-phone")}
          customer={c}
          assets={data.assets}
          designs={data.designs}
          initialDesign={studio.design}
          saveOnly={studio.saveOnly}
          onClose={() => setStudio(null)}
          onSaved={load}
          onOrder={openOrder}
        />
      ) : (
        <>
          <nav className="cc-customer-tabs" aria-label="Customer profile sections">
            {[
              ["designs", "Design Vault"],
              ["orders", "Orders & current work"],
              ["assets", "Artwork & completed work"],
              ["notes", "Preferences & notes"],
              ["history", "History & review"],
            ].map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setRevisionHistory(null);
                }}
              >
                {title}
              </button>
            ))}
          </nav>
          {tab === "designs" && (
            <section>
              <div className="cc-panel-heading">
                <div>
                  <h2>Saved designs</h2>
                  <p>Exact choices and private source files, ready for the next call.</p>
                </div>
                <button
                  className="cc-button secondary"
                  disabled={c.archived}
                  onClick={() => setStudio({ saveOnly: true })}
                >
                  <Plus size={16} /> Save a design
                </button>
              </div>
              <div className="cc-vault-grid">
                {data.designs.map((d) => (
                  <article className="cc-panel cc-vault-card" key={d.id}>
                    <VaultPreview
                      configuration={d.configuration}
                      asset={data.assets.find((a) => a.id === d.artwork_asset_id)}
                    />
                    <div>
                      <p className="cc-eyebrow">
                        REVISION {d.version} · {label(d.state)}
                      </p>
                      <h3>{d.name}</h3>
                      <p>
                        Richardson {d.configuration.modelId} · {d.configuration.patchShape}
                        <br />
                        {d.configuration.physicalInches.width}″ ×{" "}
                        {d.configuration.physicalInches.height}″ · {d.configuration.leatherette}
                      </p>
                      <small>Updated {new Date(d.updated_at).toLocaleDateString()}</small>
                      {d.compatibility.length > 0 && (
                        <p className="cc-error">{d.compatibility.join(" ")}</p>
                      )}
                      <div className="cc-actions">
                        <button
                          className="cc-button"
                          disabled={busy || c.archived || d.state === "archived"}
                          onClick={() => setStudio({ design: d, saveOnly: false })}
                        >
                          Build again
                        </button>
                        <button
                          className="cc-button secondary"
                          disabled={c.archived || d.state === "archived"}
                          onClick={() => setStudio({ design: d, saveOnly: true })}
                        >
                          Modify
                        </button>
                        {d.artwork_asset_id && (
                          <button
                            className="cc-button secondary"
                            onClick={() =>
                              void feedback(
                                () => downloadSource(d.artwork_asset_id!),
                                "Original source downloaded.",
                              )
                            }
                          >
                            <Download size={16} /> Source artwork
                          </button>
                        )}
                        <button
                          className="cc-button secondary"
                          onClick={() =>
                            void feedback(
                              async () =>
                                setRevisionHistory({
                                  name: d.name,
                                  rows: await getVaultDesignHistory({ data: d.id }),
                                }),
                              "Design history opened.",
                            )
                          }
                        >
                          <History size={16} /> Revisions
                        </button>
                        <button
                          className="cc-button secondary"
                          disabled={busy || c.archived}
                          onClick={() =>
                            void feedback(
                              async () => {
                                if (
                                  !window.confirm(
                                    d.state === "archived"
                                      ? "Restore this design for review? New orders still require a current proof."
                                      : "Archive this design while retaining all source files and revisions?",
                                  )
                                )
                                  return;
                                await actOnCustomer({
                                  data: {
                                    action: "design_archive",
                                    payload: {
                                      customerId: c.id,
                                      designId: d.id,
                                      version: d.version,
                                      archived: d.state !== "archived",
                                    },
                                  },
                                });
                              },
                              d.state === "archived"
                                ? "Design restored for review."
                                : "Design archived with history retained.",
                            )
                          }
                        >
                          {d.state === "archived" ? "Restore design" : "Archive design"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!data.designs.length && (
                <div className="cc-empty">
                  <h3>Keep their first design</h3>
                  <p>
                    Upload the original logo, then save the exact model, color, material, physical
                    dimensions and placement. A screenshot alone is not the production master.
                  </p>
                </div>
              )}
              {revisionHistory && (
                <div className="cc-panel">
                  <h3>{revisionHistory.name} · revisions</h3>
                  {revisionHistory.rows.map((r) => (
                    <div className="cc-order-item" key={r.revision}>
                      <strong>Revision {r.revision}</strong>
                      <p>{r.note}</p>
                      <small>
                        {new Date(r.created_at).toLocaleString()} · {r.configuration.leatherette} ·{" "}
                        {r.configuration.physicalInches.width}″ ×{" "}
                        {r.configuration.physicalInches.height}″
                      </small>
                      {r.artwork_asset_id && (
                        <button
                          className="cc-button secondary"
                          onClick={() =>
                            void feedback(
                              () => downloadSource(r.artwork_asset_id!),
                              "Revision source downloaded.",
                            )
                          }
                        >
                          Download revision source
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          {tab === "orders" && (
            <section className="cc-panel">
              <h2>Order history & current work</h2>
              {data.quotes.length > 0 && (
                <div className="cc-records" aria-label="Customer estimates">
                  {data.quotes.map((q) => (
                    <article key={q.id}>
                      <a className="cc-link" href="/admin?section=quotes">
                        Estimate #{q.number}
                      </a>
                      <span>
                        {label(q.state)} · {money(q.total)}
                      </span>
                    </article>
                  ))}
                </div>
              )}
              {data.documents
                .filter((d) => !d.order_id)
                .map((d) => (
                  <p key={d.id}>
                    <a
                      className="cc-link"
                      href={`/admin?section=${d.kind === "invoice" ? "invoices" : "proofs"}`}
                    >
                      {label(d.kind)} draft
                    </a>{" "}
                    · {label(d.state)}
                  </p>
                ))}
              <p className="cc-help">
                Original prices, payments and proofs remain with each order. A repeat creates a new
                order.
              </p>
              <div className="cc-records">
                {data.orders.map((o) => (
                  <article className="cc-order-item" key={o.id}>
                    <div className="cc-panel-heading">
                      <button className="cc-link" onClick={() => openOrder(o.id)}>
                        Order #{o.number}
                      </button>
                      <span>
                        {money(o.total)} · {new Date(o.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p>{o.titles}</p>
                    <div className="cc-order-states">
                      <span>
                        Financial <Badge value={o.payment_status} />
                      </span>
                      <span>
                        Artwork <Badge value={o.proof_status ?? "not_required"} />
                      </span>
                      <span>
                        Production <Badge value={o.stage} />
                      </span>
                    </div>
                    <div className="cc-actions">
                      <button className="cc-button secondary" onClick={() => openOrder(o.id)}>
                        Open order workspace
                      </button>
                      {owner && data.documents.some((d) => d.order_id === o.id) && (
                        <a
                          className="cc-button secondary"
                          href={`/admin?section=invoices&orderId=${o.id}`}
                        >
                          Invoice & separate proof
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!data.orders.length && (
                <p>No orders yet. Start a phone order using a saved design or a fresh build.</p>
              )}
            </section>
          )}
          {tab === "assets" && (
            <section className="cc-panel">
              <h2>Original artwork & completed work</h2>
              <p className="cc-help">
                Private source files retain their original bytes and checksum. Preview images are
                separate. These uploads are never published to the gallery automatically.
              </p>
              <ArtworkUpload customerId={c.id} disabled={c.archived} onSaved={load} />
              <div className="cc-asset-grid">
                {data.assets.map((asset) => (
                  <article className="cc-asset-card" key={asset.id}>
                    {asset.has_preview && <PrivateAssetPreview asset={asset} />}
                    <h3>{asset.name}</h3>
                    <p>
                      {label(asset.kind)} · {asset.mime}
                      <br />
                      {(asset.byte_size / 1024).toFixed(1)} KB
                      {asset.width && ` · ${asset.width} × ${asset.height} px`}
                    </p>
                    <p>{asset.provenance}</p>
                    <small title={asset.checksum}>
                      SHA-256 {asset.checksum.slice(0, 16)}… ·{" "}
                      {new Date(asset.created_at).toLocaleDateString()}
                    </small>
                    <button
                      className="cc-button secondary"
                      disabled={busy}
                      onClick={() =>
                        void feedback(() => downloadSource(asset.id), "Original source downloaded.")
                      }
                    >
                      <Download size={16} /> Download source
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          {tab === "notes" && (
            <section className="cc-panel">
              <h2>Preferences & private notes</h2>
              <p>{c.preferences || "No internal preferences recorded."}</p>
              <p>Delivery: {label(c.delivery_preference)}</p>
              <p>
                {Object.values(c.address ?? {})
                  .filter(Boolean)
                  .join(", ") || "No address supplied."}
              </p>
              <p className="cc-help">
                Contact preference records how the customer prefers to talk about an order. It
                grants no marketing consent and sends no messages.
              </p>
              <form
                className="cc-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    body = String(new FormData(form).get("body") ?? "");
                  await feedback(
                    () =>
                      actOnCustomer({
                        data: { action: "note", payload: { customerId: c.id, body } },
                      }),
                    "Private customer note saved.",
                  );
                  form.reset();
                }}
              >
                <label className="cc-field">
                  Internal customer note
                  <textarea
                    name="body"
                    aria-label="Internal customer note"
                    required
                    maxLength={4000}
                  />
                </label>
                <button className="cc-button secondary" disabled={busy || c.archived}>
                  Save private note
                </button>
              </form>
              {!!data.legacyContactNotes.length && (
                <div className="cc-notice">
                  <h3>Legacy contact notes · identity review</h3>
                  <p>
                    These older notes match a recorded email. Shared addresses may represent
                    different people; review them before treating them as this customer's
                    preferences.
                  </p>
                  {data.legacyContactNotes.map((n) => (
                    <p key={n.id}>
                      {n.body} · {new Date(n.created_at).toLocaleDateString()}
                    </p>
                  ))}
                </div>
              )}
              {data.notes.map((n) => (
                <div className="cc-order-item" key={n.id}>
                  <p>{n.body}</p>
                  <small>{new Date(n.created_at).toLocaleString()}</small>
                </div>
              ))}
            </section>
          )}
          {tab === "history" && (
            <section className="cc-panel">
              <h2>History & customer review</h2>
              <button
                className="cc-button secondary"
                disabled={busy}
                onClick={() =>
                  void feedback(async () => {
                    const result = await exportCustomerProfile({ data: c.id });
                    const url = URL.createObjectURL(
                      new Blob([result.json], { type: "application/json" }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = result.filename;
                    link.click();
                    URL.revokeObjectURL(url);
                  }, "Private customer record exported. Source files remain separately permissioned.")
                }
              >
                <Download size={16} /> Export customer record
              </button>
              <p className="cc-help">
                Historical profiles are kept separate until reviewed. Linking profiles keeps every
                original order, paid invoice, artwork owner and revision; no financial history is
                overwritten.
              </p>
              <button
                className="cc-button secondary"
                disabled={busy}
                onClick={() =>
                  void feedback(
                    async () => {
                      if (
                        !window.confirm(
                          c.archived
                            ? "Restore this customer for new work?"
                            : "Archive this profile? Financial and artwork history will remain available.",
                        )
                      )
                        return;
                      await actOnCustomer({
                        data: {
                          action: "archive",
                          payload: { customerId: c.id, version: c.version, archived: !c.archived },
                        },
                      });
                    },
                    c.archived ? "Customer restored." : "Customer archived.",
                  )
                }
              >
                <Archive size={16} />
                {c.archived ? "Restore profile" : "Archive profile"}
              </button>
              {owner && !c.archived && (
                <button
                  className="cc-button secondary"
                  onClick={() => {
                    setMerge(!merge);
                    void searchCustomerProfiles({ data: c.email ?? c.name })
                      .then(setRows)
                      .catch((e) => setError(ownerError(e)));
                  }}
                >
                  Review duplicate profiles
                </button>
              )}
              {merge && (
                <form
                  className="cc-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const reason = String(new FormData(e.currentTarget).get("reason") ?? ""),
                      target = rows.find((r) => r.id === mergeTarget);
                    if (
                      !target ||
                      !window.confirm(
                        `Link ${c.name} (C-${c.number}) into ${target.name} (C-${target.number}) after independent identity review? Original history is retained.`,
                      )
                    )
                      return;
                    await feedback(async () => {
                      const result = await actOnCustomer({
                        data: {
                          action: "merge",
                          payload: {
                            sourceId: c.id,
                            targetId: target.id,
                            sourceVersion: c.version,
                            targetVersion: target.version,
                            reason,
                            confirmed: true,
                          },
                        },
                      });
                      setMerge(false);
                      choose(result.id);
                    }, "Profiles linked with history preserved.");
                  }}
                >
                  <label className="cc-field">
                    Retained customer profile
                    <select
                      aria-label="Retained customer profile"
                      value={mergeTarget}
                      onChange={(e) => setMergeTarget(e.target.value)}
                      required
                    >
                      <option value="">Review and select a different profile</option>
                      {rows
                        .filter((r) => r.id !== c.id && !r.archived)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} · C-{r.number} · {r.phone || r.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="cc-field">
                    Identity review evidence
                    <textarea
                      name="reason"
                      aria-label="Identity review evidence"
                      required
                      minLength={10}
                      maxLength={500}
                    />
                  </label>
                  <button className="cc-button" disabled={busy}>
                    Link reviewed profiles
                  </button>
                </form>
              )}
              <div className="cc-records">
                {data.history.map((h) => (
                  <div key={h.id}>
                    <span>{label(h.action.replaceAll(".", " "))}</span>
                    <time>{new Date(h.created_at).toLocaleString()}</time>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
function ArtworkUpload({
  customerId,
  disabled,
  onSaved,
}: {
  customerId: string;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  return (
    <form
      className="cc-form cc-artwork-intake"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || disabled) return;
        const form = event.currentTarget,
          f = new FormData(form),
          file = f.get("file");
        if (!(file instanceof File) || !file.size || file.size > MAX_NEW_UPLOAD_BYTES) {
          setError("Choose a PNG, JPG, WebP, safe SVG or PDF up to 3 MB.");
          return;
        }
        setBusy(true);
        setError("");
        try {
          const data = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          await uploadCustomerAsset({
            data: {
              id: requestId,
              customerId,
              name: file.name,
              data,
              kind: String(f.get("kind")) as "original",
              provenance: String(f.get("provenance")),
            },
          });
          setRequestId(crypto.randomUUID());
          form.reset();
          setSuccess("Source artwork saved privately. Original bytes preserved.");
          await onSaved();
        } catch (e) {
          setError(ownerError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="cc-field">
        Source artwork file
        <input
          aria-label="Source artwork file"
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
          required
          disabled={busy || disabled}
        />
      </label>
      <label className="cc-field">
        File role
        <select name="kind" aria-label="File role" disabled={busy || disabled}>
          <option value="original">Original customer artwork</option>
          <option value="production">Production-ready derivative</option>
          <option value="proof">Proof / mock-up</option>
          <option value="finished">Completed work photograph</option>
        </select>
      </label>
      <label className="cc-field">
        Source / ownership note
        <input
          name="provenance"
          aria-label="Source / ownership note"
          placeholder="Customer supplied logo for their own orders"
          required
          minLength={5}
          maxLength={500}
          disabled={busy || disabled}
        />
      </label>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="cc-success" role="status">
          {success}
        </p>
      )}
      <button className="cc-button" disabled={busy || disabled}>
        {busy ? "Uploading and checking source…" : "Save private artwork"}
      </button>
    </form>
  );
}
function PrivateAssetPreview({ asset }: { asset: CustomerAsset }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true,
      objectUrl = "";
    const token = getBearerToken();
    void fetch(`/api/customer-artwork/${asset.id}?preview=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (r) => {
        if (!r.ok) return;
        objectUrl = URL.createObjectURL(await r.blob());
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.id]);
  return url ? (
    <img src={url} alt={`Private preview of ${asset.name}`} />
  ) : (
    <p className="cc-help">Loading private preview…</p>
  );
}
