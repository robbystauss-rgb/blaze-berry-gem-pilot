import { useEffect, useState, useCallback, type ReactNode, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { StripeHistory } from "./stripe-history";
import { Route, sections } from "@/routes/admin";
import {
  LayoutDashboard,
  ShoppingBag,
  CreditCard,
  Layers,
  Package,
  Tags,
  Users,
  Globe,
  History,
  Bell,
  ChartNoAxesCombined,
  ShieldCheck,
  Menu,
  X,
  RefreshCw,
  ArrowUpRight,
  Download,
  Plus,
  Printer,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import * as Dialog from "@radix-ui/react-dialog";
import {
  getMerchantAccess,
  getAdminData,
  getOrderDetail,
  getDraftInventoryOptions,
  mutateAdmin,
  invoiceAction,
  connectStripeEvents,
  mfaAction,
  recoveryAction,
  exportAdminRecords,
  uploadProductImage,
} from "@/lib/commerce/api";
import {
  PERMISSIONS,
  STAGES,
  CONTENT_KEYS,
  label,
  money,
  type Permission,
  type OrderRow,
  type ProductRow,
  type VariantRow,
  type InventoryRow,
} from "@/lib/commerce/types";
import type { AdminData } from "@/lib/commerce/read.server";
import { UserButton } from "@/lib/auth/gates";
import { FAMILIES, colorsForFamily } from "@/lib/catalog";
import { OrderDetail } from "./order-detail";
import { ProductEditor } from "./product-editor";
import { CustomerDetail } from "./customer-detail";
import { BuilderCatalogEditor } from "./builder-catalog-editor";

type Section = (typeof sections)[number];
const NAV: { id: Section; name: string; icon: typeof Menu; permission: Permission | "security" }[] =
  [
    { id: "overview", name: "Overview", icon: LayoutDashboard, permission: "orders" },
    { id: "orders", name: "Orders", icon: ShoppingBag, permission: "orders" },
    { id: "payments", name: "Payments & invoices", icon: CreditCard, permission: "finance" },
    { id: "production", name: "Production queue", icon: Layers, permission: "production" },
    { id: "inventory", name: "Inventory", icon: Package, permission: "inventory" },
    { id: "products", name: "Products", icon: Tags, permission: "products" },
    { id: "customers", name: "Customers", icon: Users, permission: "customers" },
    { id: "website", name: "Website", icon: Globe, permission: "website" },
    { id: "activity", name: "Activity history", icon: History, permission: "audit" },
    { id: "notifications", name: "Notifications", icon: Bell, permission: "orders" },
    { id: "reports", name: "Reports", icon: ChartNoAxesCombined, permission: "reports" },
    { id: "staff", name: "Staff access", icon: Users, permission: "staff" },
    { id: "security", name: "Security", icon: ShieldCheck, permission: "security" },
  ];
const DESCRIPTION: Record<Section, string> = {
  overview: "A clear view of your business, from payment to packaging.",
  orders: "Every order, its original specifications and the next step.",
  payments: "Verified receipts and invoices, with a complete financial trail.",
  production: "Custom work, organized around the way you make it.",
  inventory: "Real stock counts, commitments and material movements.",
  products: "Manage ordinary merchandise without opening source code.",
  customers: "Customer purchase history and internal notes.",
  website: "Publish routine store content through authorized database updates.",
  activity: "Trusted history of changes made to your business.",
  notifications: "Orders and inventory that need your attention.",
  reports: "Actual collections, refunds and your operational backlog.",
  staff: "Grant access to existing authenticated accounts.",
  security: "Protect merchant operations with an authenticator.",
};
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`cc-badge ${["paid", "completed", "delivered", "active", "consumed"].includes(value) ? "good" : ["failed", "canceled", "refunded", "disputed", "error"].includes(value) ? "attention" : ""}`}
    >
      {label(value)}
    </span>
  );
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="cc-empty">
      <Package size={28} />
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
export function Field({
  name,
  title,
  type = "text",
  value,
  required = false,
  children,
}: {
  name: string;
  title: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  children?: ReactNode;
}) {
  return (
    <label className="cc-field">
      {title}
      {children ??
        (type === "textarea" ? (
          <textarea name={name} defaultValue={value} required={required} rows={4} />
        ) : (
          <input
            name={name}
            type={type}
            defaultValue={value}
            required={required}
            min={type === "number" ? 0 : undefined}
            step={type === "number" ? "any" : undefined}
          />
        ))}
    </label>
  );
}
function Select({
  name,
  title,
  value,
  options,
}: {
  name: string;
  title: string;
  value?: string;
  options: readonly string[];
}) {
  return (
    <Field name={name} title={title}>
      <select name={name} defaultValue={value}>
        {options.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(on) => !on && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="cc-overlay" />
        <Dialog.Content className="cc-modal">
          <div className="cc-modal-title">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="cc-icon" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Review details and save an authorized business change.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function SaveButton({ busy }: { busy: boolean }) {
  return (
    <button className="cc-button" disabled={busy}>
      {busy ? "Saving…" : "Save changes"}
    </button>
  );
}
function formValues(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
function getNumber(form: FormData, key: string) {
  return Number(form.get(key) || 0);
}
function getCents(form: FormData, key: string) {
  return Math.round(getNumber(form, key) * 100);
}
function getText(form: FormData, key: string) {
  return String(form.get(key) || "");
}
function dateValue(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}
function csvDownload(name: string, rows: Record<string, unknown>[]) {
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const cell = (v: unknown) => {
    let s =
      v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const csv =
    "\uFEFF" +
    [keys.map(cell).join(","), ...rows.map((row) => keys.map((k) => cell(row[k])).join(","))].join(
      "\r\n",
    );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function CommandCenter() {
  const { section, orderId } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin" });
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getMerchantAccess>> | null>(null);
  const [accessError, setAccessError] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [range, setRange] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editor, setEditor] = useState<string | null>(null);
  const [draftRecipes, setDraftRecipes] = useState<
    Awaited<ReturnType<typeof getDraftInventoryOptions>>
  >([]);
  useEffect(() => {
    if (editor === "draft")
      void getDraftInventoryOptions()
        .then(setDraftRecipes)
        .catch((e) => setError(errorText(e)));
  }, [editor]);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [inventory, setInventory] = useState<InventoryRow | null>(null);
  const [customer, setCustomer] = useState<string | null>(null);
  const refreshAccess = useCallback(
    () =>
      getMerchantAccess()
        .then((a) => {
          setAccess(a);
          setAccessError("");
        })
        .catch((e) => {
          setAccessError(errorText(e));
          setLoading(false);
        }),
    [],
  );
  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);
  const permitted =
    access &&
    (section === "security" ||
      (NAV.find((n) => n.id === section)?.permission &&
        PERMISSIONS[access.role].includes(
          NAV.find((n) => n.id === section)!.permission as Permission,
        )));
  const load = useCallback(async () => {
    if (
      !access ||
      !permitted ||
      section === "security" ||
      (access.mfaRequired && !access.mfaVerified)
    ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const dates = ["overview", "reports"].includes(section)
        ? {
            from: from
              ? new Date(from + "T00:00:00").toISOString()
              : new Date(Date.now() - Number(range) * 86400000).toISOString(),
            to: to ? new Date(to + "T23:59:59").toISOString() : new Date().toISOString(),
          }
        : from || to
          ? {
              from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
              to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
            }
          : {};
      setData(
        await getAdminData({
          data: {
            section: section as Exclude<Section, "security">,
            search,
            page,
            status,
            ...dates,
          },
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [access, permitted, section, search, page, status, from, to, range]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    setSearch("");
    setStatus("");
    setPage(0);
    setEditor(null);
    setSuccess("");
    setFrom("");
    setTo("");
    setNavOpen(false);
    setData(null);
  }, [section]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!busy && !editor) void load();
    }, 60000);
    return () => clearInterval(timer);
  }, [load, busy, editor]);
  async function save(
    action: Parameters<typeof mutateAdmin>[0]["data"]["action"],
    payload: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await mutateAdmin({ data: { action, payload } });
      setSuccess("Changes saved.");
      await load();
      return result;
    } catch (e) {
      setError(errorText(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  function openOrder(id: string) {
    void navigate({
      search: { section: section === "production" ? "production" : "orders", orderId: id },
    });
  }
  if (accessError)
    return (
      <div className="cc-access">
        <ShieldCheck size={32} />
        <h1>Merchant access required</h1>
        <p>{accessError}</p>
        <Link to="/login" className="cc-button">
          Sign in
        </Link>
        <Link to="/" className="cc-button secondary">
          Return to storefront
        </Link>
      </div>
    );
  if (!access)
    return (
      <div className="cc-access" role="status">
        Checking secure merchant access…
      </div>
    );
  const needsMfa = access.mfaRequired && !access.mfaVerified;
  const title = NAV.find((n) => n.id === section)?.name ?? "Overview";
  return (
    <div className="cc-shell">
      <aside className={`cc-sidebar ${navOpen ? "is-open" : ""}`}>
        <a href="/" className="cc-brand">
          <img src="/brand/rec-mama-made-louisiana-logo.jpeg" alt="" />
          <span>
            REC Mama Made<small>OWNER COMMAND CENTER</small>
          </span>
        </a>
        <button
          className="cc-icon cc-mobile-close"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <nav aria-label="Merchant navigation">
          {NAV.filter(
            (n) => n.permission === "security" || PERMISSIONS[access.role].includes(n.permission),
          ).map((n) => (
            <Link
              key={n.id}
              to="/admin"
              search={{ section: n.id }}
              className={section === n.id ? "active" : ""}
            >
              <n.icon size={18} />
              <span>{n.name}</span>
            </Link>
          ))}
        </nav>
        <div className="cc-sidebar-foot">
          <a href="/" target="_blank" rel="noreferrer">
            View storefront <ArrowUpRight size={16} />
          </a>
          <span className="cc-badge">{label(access.role)}</span>
          <UserButton />
        </div>
      </aside>
      {navOpen && (
        <button
          className="cc-nav-scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <main id="main" className="cc-main">
        <header className="cc-topbar">
          <div>
            <button
              className="cc-icon cc-menu"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <span>
              REC Mama Made <ChevronRight size={14} /> {title}
            </span>
          </div>
          <button
            className="cc-icon"
            aria-label="Refresh data"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={18} />
          </button>
        </header>
        <div className="cc-body">
          <div className="cc-heading">
            <div>
              <p className="cc-eyebrow">YOUR BUSINESS, AT A GLANCE</p>
              <h1>{orderId ? "Order workspace" : title}</h1>
              <p>{DESCRIPTION[section]}</p>
            </div>
            <div className="cc-heading-actions">
              {section === "orders" && !orderId && (
                <button className="cc-button" onClick={() => setEditor("draft")}>
                  <Plus size={17} />
                  Create draft order
                </button>
              )}
              {section === "products" && (
                <button
                  className="cc-button"
                  onClick={() => {
                    setProduct(null);
                    setEditor("product");
                  }}
                >
                  <Plus size={17} />
                  Add product
                </button>
              )}
              {section === "inventory" && (
                <button className="cc-button" onClick={() => setEditor("inventory")}>
                  <Plus size={17} />
                  Add inventory item
                </button>
              )}
            </div>
          </div>
          {access.storage !== "postgres" && (
            <div className="cc-notice">
              Development workspace · Local records reset when the server restarts. Production
              requires persistent PostgreSQL. No live customer messages or charges are part of this
              test environment.
            </div>
          )}
          {error && (
            <div className="cc-error" role="alert">
              {error}
              <button onClick={() => void load()} className="cc-button secondary">
                Retry
              </button>
            </div>
          )}
          {success && (
            <div className="cc-success" role="status">
              {success}
            </div>
          )}
          {needsMfa || section === "security" ? (
            <Security access={access} refresh={refreshAccess} />
          ) : !permitted ? (
            <Empty
              title="Access restricted"
              body="Your role does not have permission to view this section."
            />
          ) : orderId ? (
            <OrderDetail
              id={orderId}
              access={access}
              close={() => void navigate({ search: { section } })}
              onChange={load}
            />
          ) : (
            <>
              {["overview", "reports"].includes(section) ? (
                <div className="cc-filters">
                  <select
                    aria-label="Report date range"
                    value={range}
                    onChange={(e) => {
                      setRange(e.target.value);
                      setFrom("");
                      setTo("");
                    }}
                  >
                    <option value="1">Today / last 24 hours</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                  <label>
                    From
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </label>
                  <label>
                    Through
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </label>
                  <span>America/Chicago</span>
                </div>
              ) : (
                !["website", "staff", "notifications"].includes(section) && (
                  <div className="cc-filters">
                    <div className="cc-search">
                      <Search size={16} />
                      <input
                        aria-label="Search records"
                        placeholder="Search records…"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(0);
                        }}
                      />
                    </div>
                    {[
                      "orders",
                      "production",
                      "products",
                      "activity",
                      "inventory",
                      "payments",
                    ].includes(section) && (
                      <select
                        aria-label="Filter status"
                        value={status}
                        onChange={(e) => {
                          setStatus(e.target.value);
                          setPage(0);
                        }}
                      >
                        <option value="">
                          All {section === "activity" ? "resources" : "statuses"}
                        </option>
                        {(section === "products"
                          ? ["draft", "active", "inactive", "archived"]
                          : section === "inventory"
                            ? ["setup_required", "low_stock", "out_of_stock", "available"]
                            : section === "payments"
                              ? [
                                  "paid",
                                  "unpaid",
                                  "pending",
                                  "failed",
                                  "partially_paid",
                                  "partially_refunded",
                                  "refunded",
                                  "disputed",
                                ]
                              : section === "activity"
                                ? ["order", "product", "inventory", "content", "staff", "customer"]
                                : STAGES
                        ).map((s) => (
                          <option key={s} value={s}>
                            {label(s)}
                          </option>
                        ))}
                      </select>
                    )}
                    {["orders", "activity", "payments"].includes(section) && (
                      <>
                        <label>
                          From
                          <input
                            type="date"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                          />
                        </label>
                        <label>
                          Through
                          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                        </label>
                      </>
                    )}
                  </div>
                )
              )}
              {loading && !data ? (
                <div className="cc-loading" role="status">
                  Loading business records…
                </div>
              ) : (
                data && (
                  <>
                    {section === "overview" && <Overview data={data} openOrder={openOrder} />}
                    {["orders", "production"].includes(section) && (
                      <OrderList
                        orders={data.orders}
                        open={openOrder}
                        production={section === "production"}
                      />
                    )}
                    {section === "payments" && (
                      <>
                        <StripeHistory refresh={load} open={openOrder} />
                        <div className="cc-panel">
                          <h2>Verified payment events</h2>
                          <p>
                            Connect signed Stripe events to update payments and refunds
                            automatically. Provider permissions are required.
                          </p>
                          <button
                            className="cc-button secondary"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                await connectStripeEvents();
                                setSuccess(
                                  "Stripe confirmed the REC payment-event connection is active.",
                                );
                                await load();
                              } catch (e) {
                                setError(errorText(e));
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Connect payment events
                          </button>
                        </div>
                        <div className="cc-notice">
                          {data.config.invoices
                            ? `Invoice sender reviewed: ${data.config.sender}`
                            : "Invoice sending needs verified REC Mama Made Stripe branding, sender and webhooks. You can review real payments now."}{" "}
                          Processor fees appear only when supplied by the provider.
                        </div>
                        <OrderList orders={data.orders} open={openOrder} />
                        <div className="cc-panel">
                          <h2>Transaction ledger</h2>
                          {data.payments.length ? (
                            <div className="cc-records">
                              {data.payments.map((p) => (
                                <div key={p.id}>
                                  <div>
                                    <Badge value={p.kind} />
                                    <b>{money(p.amount)}</b>
                                    <small>
                                      {p.provider} · {p.reference}
                                    </small>
                                  </div>
                                  <span>
                                    {new Date(p.occurred_at).toLocaleString()}
                                    <small>
                                      Fee: {p.fee === null ? "Unavailable" : money(p.fee)}
                                    </small>
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Empty
                              title="No recorded transactions"
                              body="Verified payments and refunds will appear here."
                            />
                          )}
                        </div>
                      </>
                    )}
                    {section === "inventory" && (
                      <Inventory
                        data={data}
                        edit={(item, mode) => {
                          setInventory(item);
                          setEditor(mode);
                        }}
                      />
                    )}
                    {section === "products" && (
                      <>
                        <BuilderCatalogEditor products={data.builderProducts} refresh={load} />
                        <div className="cc-notice">
                          The existing Richardson builder catalog, calibration and pricing remain
                          protected. These products extend the storefront through the Shop section.
                          Use Studio for the existing visual catalog review.
                        </div>
                        <div className="cc-grid">
                          {data.products
                            .filter((p) => !p.builder_family)
                            .map((p) => (
                              <article key={p.id} className="cc-product-card">
                                {p.images[0] && <img src={p.images[0]} alt={p.title} />}
                                <div>
                                  <Badge
                                    value={
                                      p.state === "active" &&
                                      p.publish_at &&
                                      new Date(p.publish_at) > new Date()
                                        ? "scheduled"
                                        : p.state
                                    }
                                  />
                                  {p.publish_at && (
                                    <p className="cc-help">
                                      Publish date: {new Date(p.publish_at).toLocaleString()}
                                    </p>
                                  )}
                                  <h2>{p.title}</h2>
                                  <p>{p.category}</p>
                                  <small>
                                    {
                                      data.variants.filter((v) => v.product_id === p.id && v.active)
                                        .length
                                    }{" "}
                                    active variants
                                  </small>
                                  <div className="cc-actions">
                                    <button
                                      className="cc-button secondary"
                                      onClick={() => {
                                        setProduct(p);
                                        setEditor("product");
                                      }}
                                    >
                                      Edit product
                                    </button>
                                    <button
                                      className="cc-button secondary"
                                      disabled={busy}
                                      onClick={() => void save("product.duplicate", { id: p.id })}
                                    >
                                      Duplicate
                                    </button>
                                  </div>
                                </div>
                              </article>
                            ))}
                        </div>
                        {!data.products.length && (
                          <Empty
                            title="Add your first managed product"
                            body="Your existing custom hat catalog is preserved. Add apparel, finished merchandise or other products here."
                          />
                        )}
                      </>
                    )}
                    {section === "customers" && (
                      <div className="cc-panel">
                        {data.customers.length ? (
                          <div className="cc-records">
                            {data.customers.map((c) => (
                              <div key={c.email}>
                                <div>
                                  <button className="cc-link" onClick={() => setCustomer(c.email)}>
                                    {c.name}
                                  </button>
                                  <small>{c.email}</small>
                                </div>
                                <span>
                                  {c.order_count} orders
                                  <small>
                                    {money(c.paid - c.refunded)} net collected · {c.open_orders}{" "}
                                    open · {c.unpaid_invoices} unpaid invoices
                                  </small>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title="No customers recorded yet"
                            body="The directory is populated by genuine order records."
                          />
                        )}
                      </div>
                    )}
                    {section === "website" && (
                      <div className="cc-grid">
                        {CONTENT_KEYS.map((key) => {
                          const value = data.content.find((c) => c.key === key);
                          return (
                            <div key={key} className="cc-panel">
                              <h2>{label(key)}</h2>
                              <p className="cc-content-preview">
                                {value?.value || "Using existing storefront content."}
                              </p>
                              <button
                                className="cc-button secondary"
                                onClick={() => setEditor("content:" + key)}
                              >
                                Edit content
                              </button>
                            </div>
                          );
                        })}
                        <div className="cc-panel">
                          <h2>Deployment version</h2>
                          <p>
                            {data.config.version ??
                              "No deployment metadata available in this environment."}
                          </p>
                          <p>
                            Routine content saves use the database. Source changes require a
                            separately approved release.
                          </p>
                        </div>
                      </div>
                    )}
                    {section === "activity" && (
                      <div className="cc-panel">
                        {data.audit.length ? (
                          <div className="cc-records">
                            {data.audit.map((a) => (
                              <div key={a.id}>
                                <div>
                                  <b>{label(a.action.replaceAll(".", " "))}</b>
                                  <small>
                                    {a.actor_name} · {a.resource_type} · {a.resource_id}
                                  </small>
                                  <details>
                                    <summary>Change details</summary>
                                    <pre>
                                      {JSON.stringify(
                                        { before: a.before_value, after: a.after_value },
                                        null,
                                        2,
                                      )}
                                    </pre>
                                  </details>
                                  {a.resource_type === "content" &&
                                    a.action === "website.content_edited" && (
                                      <button
                                        className="cc-button secondary"
                                        disabled={busy}
                                        onClick={async () => {
                                          const website = await getAdminData({
                                            data: {
                                              section: "website",
                                              search: "",
                                              page: 0,
                                              status: "",
                                            },
                                          });
                                          const current = website.content.find(
                                            (c) => c.key === a.resource_id,
                                          );
                                          if (
                                            current &&
                                            window.confirm(
                                              "Restore this prior content value? Newer changes will block restoration.",
                                            )
                                          )
                                            await save("content.restore", {
                                              id: a.id,
                                              version: current.version,
                                            });
                                        }}
                                      >
                                        Restore prior content
                                      </button>
                                    )}
                                </div>
                                <time>{new Date(a.created_at).toLocaleString()}</time>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title="No matching activity"
                            body="Administrative actions are recorded by the server."
                          />
                        )}
                      </div>
                    )}
                    {section === "notifications" && (
                      <div className="cc-panel">
                        {data.notifications.length ? (
                          <div className="cc-records">
                            {data.notifications.map((n) => (
                              <div key={n.id}>
                                <div>
                                  <b>{n.title}</b>
                                  <small>{new Date(n.created_at).toLocaleString()}</small>
                                  {n.order_id && (
                                    <button
                                      className="cc-link"
                                      onClick={() => openOrder(n.order_id!)}
                                    >
                                      Open order
                                    </button>
                                  )}
                                </div>
                                <button
                                  className="cc-button secondary"
                                  disabled={n.is_read || busy}
                                  onClick={() => void save("notification.read", { id: n.id })}
                                >
                                  {n.is_read ? "Read" : "Mark read"}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty
                            title="All quiet"
                            body="New orders, payment problems and low stock will appear here."
                          />
                        )}
                      </div>
                    )}
                    {section === "reports" && <Reports data={data} openOrder={openOrder} />}
                    {section === "staff" && (
                      <div className="cc-panel">
                        <div className="cc-panel-heading">
                          <h2>Merchant team</h2>
                          <button className="cc-button" onClick={() => setEditor("staff")}>
                            <Plus size={16} />
                            Grant staff access
                          </button>
                        </div>
                        <p>
                          Owner: full access. Manager: orders, products, inventory, customers and
                          reporting. Production: assigned production work only. Financial functions
                          remain owner-only.
                        </p>
                        <div className="cc-records">
                          {data.staff.map((s) => (
                            <div key={s.user_id}>
                              <div>
                                <b>{s.name}</b>
                                <small>{s.email}</small>
                                <small>User ID: {s.user_id}</small>
                              </div>
                              <span>
                                <Badge value={s.role} />
                                <small>{s.active ? "Active" : "Disabled"}</small>
                                {s.role !== "owner" && (
                                  <button
                                    className="cc-button secondary"
                                    onClick={() =>
                                      void save("staff.save", {
                                        userId: s.user_id,
                                        role: s.role,
                                        active: !s.active,
                                      })
                                    }
                                  >
                                    {s.active ? "Disable access" : "Enable access"}
                                  </button>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {[
                      "orders",
                      "production",
                      "payments",
                      "inventory",
                      "products",
                      "customers",
                      "activity",
                      "notifications",
                    ].includes(section) && (
                      <div className="cc-pagination">
                        <span>
                          {data.total} records · Page {page + 1}
                        </span>
                        <button
                          className="cc-button secondary"
                          disabled={page === 0 || loading}
                          onClick={() => setPage(page - 1)}
                        >
                          Previous
                        </button>
                        <button
                          className="cc-button secondary"
                          disabled={(page + 1) * 50 >= data.total || loading}
                          onClick={() => setPage(page + 1)}
                        >
                          Next
                        </button>
                        {PERMISSIONS[access.role].includes("reports") && (
                          <button
                            className="cc-button secondary"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                const result = await exportAdminRecords({
                                  data: {
                                    section: section as "orders",
                                    search,
                                    status,
                                    from: from
                                      ? new Date(from + "T00:00:00").toISOString()
                                      : undefined,
                                    to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
                                  },
                                });
                                const url = URL.createObjectURL(
                                  new Blob([result.csv], { type: "text/csv;charset=utf-8" }),
                                );
                                const link = document.createElement("a");
                                link.href = url;
                                link.download = section + ".csv";
                                link.click();
                                URL.revokeObjectURL(url);
                                setSuccess("Exported " + result.count + " matching records.");
                              } catch (e) {
                                setError(errorText(e));
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <Download size={16} />
                            Export all matching records
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )
              )}
            </>
          )}
        </div>
      </main>
      {editor && (
        <Modal
          title={
            editor === "draft"
              ? "Create a real draft order"
              : editor === "product"
                ? "Product editor"
                : editor === "adjust"
                  ? "Adjust verified stock"
                  : editor === "settings"
                    ? "Inventory planning settings"
                    : editor === "rule"
                      ? "Configure consumption rule"
                      : editor.startsWith("content:")
                        ? "Edit website content"
                        : editor === "staff"
                          ? "Grant staff access"
                          : "Create inventory item"
          }
          close={() => setEditor(null)}
        >
          {error && (
            <p className="cc-error" role="alert">
              {error}
            </p>
          )}
          {editor === "draft" && (
            <form
              className="cc-form"
              onSubmit={async (e) => {
                const f = formValues(e);
                const r = await save("order.draft", {
                  customerName: getText(f, "name"),
                  customerEmail: getText(f, "email"),
                  title: getText(f, "title"),
                  quantity: getNumber(f, "quantity"),
                  unitAmount: getCents(f, "unit"),
                  shipping: getCents(f, "shipping"),
                  tax: getCents(f, "tax"),
                  discount: getCents(f, "discount"),
                  specifications: getText(f, "specifications"),
                  dueAt: getText(f, "due") ? new Date(getText(f, "due")).toISOString() : null,
                  shippingAddress: { address: getText(f, "address") },
                  requestId: crypto.randomUUID(),
                  productKey: getText(f, "productKey") || "custom_draft",
                });
                if (r) {
                  setEditor(null);
                  openOrder(r.id);
                }
              }}
            >
              <p>
                A draft is an actual customer obligation awaiting payment. Review all amounts before
                invoicing.
              </p>
              <div className="cc-form-grid">
                <Field name="name" title="Customer name" required />
                <Field name="email" title="Customer email" type="email" required />
                <Field name="title" title="Product / work description" required />
                <Field name="quantity" title="Quantity" type="number" value={1} required />
                <Field name="unit" title="Unit price ($)" type="number" required />
                <Field name="shipping" title="Recorded shipping ($)" type="number" value={0} />
                <Field name="tax" title="Recorded tax ($)" type="number" value={0} />
                <Field name="discount" title="Discount ($)" type="number" value={0} />
                <Field name="due" title="Scheduled fulfillment / due date" type="datetime-local" />
              </div>
              <Field name="address" title="Shipping address" type="textarea" />
              <label className="cc-field">
                Configured production components
                <select name="productKey" defaultValue="custom_draft">
                  <option value="custom_draft">
                    Custom draft defaults (no quantities inferred)
                  </option>
                  {draftRecipes
                    .filter((r) => r.key !== "custom_draft")
                    .map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.title} per item
                      </option>
                    ))}
                </select>
              </label>
              <p className="cc-help">
                Select the verified blank and material recipe for this work. Configured units
                reserve when the draft is saved. Unconfigured components require inventory setup.
              </p>
              <Field
                name="specifications"
                title="Customer-selected specifications / instructions"
                type="textarea"
              />
              <SaveButton busy={busy} />
            </form>
          )}
          {editor === "inventory" && (
            <form
              className="cc-form"
              onSubmit={async (e) => {
                const f = formValues(e);
                if (
                  await save("inventory.create", {
                    sku: getText(f, "sku"),
                    title: getText(f, "title"),
                    category: getText(f, "category"),
                    threshold: getNumber(f, "threshold"),
                    incoming: getNumber(f, "incoming"),
                  })
                )
                  setEditor(null);
              }}
            >
              <p>
                New inventory starts with an unknown count. Enter verified stock through Adjust
                stock.
              </p>
              <Field name="title" title="Item / variant name" required />
              <Field name="sku" title="Unique SKU" required />
              <Select
                name="category"
                title="Stock type"
                options={[
                  "blank_hat",
                  "leatherette",
                  "acrylic",
                  "blank_apparel",
                  "finished_product",
                  "other",
                ]}
              />
              <Field name="threshold" title="Low-stock threshold" type="number" value={0} />
              <Field name="incoming" title="Recorded incoming units" type="number" value={0} />
              <SaveButton busy={busy} />
            </form>
          )}
          {editor === "adjust" && inventory && (
            <form
              className="cc-form"
              onSubmit={async (e) => {
                const f = formValues(e);
                if (
                  await save("inventory.adjust", {
                    id: inventory.id,
                    version: inventory.version,
                    delta: getNumber(f, "delta"),
                    reason: getText(f, "reason"),
                    requestId: crypto.randomUUID(),
                  })
                )
                  setEditor(null);
              }}
            >
              <p>
                {inventory.title} · On hand: {inventory.on_hand ?? "Needs setup"} · Reserved:{" "}
                {inventory.reserved} · Committed: {inventory.committed}
              </p>
              <label className="cc-field">
                {inventory.on_hand === null
                  ? "Verified initial count"
                  : "Adjustment (+ restock / − remove)"}
                <input
                  name="delta"
                  type="number"
                  step="1"
                  required
                  min={inventory.on_hand === null ? 0 : undefined}
                />
              </label>
              <Field name="reason" title="Reason / reference" type="textarea" required />
              <p className="cc-help">
                Refunds do not automatically restock consumed materials. Record a verified return or
                correction here.
              </p>
              <SaveButton busy={busy} />
            </form>
          )}
          {editor === "settings" && inventory && (
            <form
              className="cc-form"
              onSubmit={async (e) => {
                const f = formValues(e);
                if (
                  await save("inventory.settings", {
                    id: inventory.id,
                    version: inventory.version,
                    threshold: getNumber(f, "threshold"),
                    incoming: getNumber(f, "incoming"),
                    reason: getText(f, "reason"),
                  })
                )
                  setEditor(null);
              }}
            >
              <p>
                {inventory.title}. Incoming units are recorded purchase commitments and do not
                increase available stock. Receive goods with a verified stock adjustment.
              </p>
              <Field
                name="threshold"
                title="Low-stock threshold"
                type="number"
                value={inventory.threshold}
                required
              />
              <Field
                name="incoming"
                title="Recorded incoming units"
                type="number"
                value={inventory.incoming}
                required
              />
              <Field name="reason" title="Reason / supplier reference" required />
              <SaveButton busy={busy} />
            </form>
          )}
          {editor === "rule" && inventory && (
            <form
              className="cc-form"
              onSubmit={async (e) => {
                const f = formValues(e);
                if (
                  await save("inventory.rule", {
                    inventoryId: inventory.id,
                    productKey: getText(f, "key"),
                    units: getNumber(f, "units"),
                  })
                )
                  setEditor(null);
              }}
            >
              <p>
                Map {inventory.title} to an exact ordered variant. This controls future
                reservations; existing allocations are preserved.
              </p>
              <Field name="key" title="Ordered product key" required>
                <input name="key" list="cc-product-keys" required />
                <datalist id="cc-product-keys">
                  {Object.keys(FAMILIES).flatMap((f) =>
                    colorsForFamily(f as keyof typeof FAMILIES).map((c) => (
                      <option key={f + c} value={`hat:${f}:${c}`} />
                    )),
                  )}
                  {data?.variants.map((v) => (
                    <option key={v.id} value={"variant:" + v.id} />
                  ))}
                </datalist>
              </Field>
              <Field
                name="units"
                title="Configured whole units consumed per fulfilled item (0 removes rule)"
                type="number"
                value={1}
              />
              <p className="cc-help">
                Use real production quantities. Stock units may be individual blanks or explicitly
                defined material units.
              </p>
              <SaveButton busy={busy} />
            </form>
          )}
          {editor === "product" && (
            <ProductEditor
              product={product}
              variants={data?.variants.filter((v) => v.product_id === product?.id) ?? []}
              busy={busy}
              save={async (p) => {
                if (await save("product.save", p)) setEditor(null);
              }}
            />
          )}
          {editor.startsWith("content:") && (
            <form
              className="cc-form"
              onSubmit={async (e) => {
                const f = formValues(e);
                const key = editor.slice(8);
                if (
                  await save("content.save", {
                    key,
                    value: getText(f, "value"),
                    version: data?.content.find((c) => c.key === key)?.version ?? 0,
                  })
                )
                  setEditor(null);
              }}
            >
              <Field
                name="value"
                title={label(editor.slice(8))}
                type="textarea"
                value={data?.content.find((c) => c.key === editor.slice(8))?.value ?? ""}
              />
              <p className="cc-help">
                Plain text only. An empty value restores the existing content fallback. Featured
                products use comma-separated managed product IDs.
              </p>
              <SaveButton busy={busy} />
            </form>
          )}
          {editor === "staff" && (
            <form
              className="cc-form"
              onSubmit={async (e) => {
                const f = formValues(e);
                if (
                  await save("staff.save", {
                    userId: getText(f, "userId"),
                    role: getText(f, "role"),
                    active: true,
                  })
                )
                  setEditor(null);
              }}
            >
              <p>
                The person must already have an authenticated account. Use their exact user ID;
                email addresses do not grant privileged access.
              </p>
              <Field name="userId" title="Existing authenticated user ID" required />
              <Select name="role" title="Role" options={["production", "manager"]} />
              <SaveButton busy={busy} />
            </form>
          )}
        </Modal>
      )}
      {customer && (
        <Modal title="Customer history" close={() => setCustomer(null)}>
          <CustomerDetail
            email={customer}
            open={(id) => {
              setCustomer(null);
              openOrder(id);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function exportRows(section: string, data: AdminData): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] =
    section === "inventory"
      ? data.inventory
      : section === "products"
        ? data.products
        : section === "customers"
          ? data.customers
          : section === "activity"
            ? data.audit
            : section === "notifications"
              ? data.notifications
              : data.orders;
  return rows;
}
function Overview({ data, openOrder }: { data: AdminData; openOrder: (id: string) => void }) {
  const m = data.metrics;
  return (
    <>
      <div className="cc-metrics">
        {[
          ["Collected in period", money(m.collected)],
          ["Net after refunds", money(m.net_collected)],
          ["New orders", m.new_orders],
          ["Awaiting payment", m.awaiting_payment],
        ].map(([title, value]) => (
          <div key={title} className="cc-metric">
            <span>{title}</span>
            <strong>{value}</strong>
            {title === "Collected in period" && (
              <small>Previous period: {money(m.previous_collected)}</small>
            )}
          </div>
        ))}
      </div>
      <div className="cc-overview-grid">
        <div className="cc-panel">
          <div className="cc-panel-heading">
            <h2>Collections over time</h2>
            <span>Actual receipts · USD</span>
          </div>
          <p className="cc-help">
            Collected includes recorded tax and shipping after discounts. Net collected subtracts
            successful refunds. Unpaid orders are excluded.
          </p>
          {data.trend.length ? (
            <div className="cc-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => "$" + Number(v) / 100} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    stroke="var(--color-wine)"
                    fill="var(--color-blush)"
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="refunds"
                    stroke="var(--color-bark)"
                    fill="var(--color-pill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="No collections in this period"
              body="This chart appears when trusted payment receipts are recorded."
            />
          )}
          <div className="cc-inline-stats">
            {[
              ["Today", m.today],
              ["7 days", m.days7],
              ["30 days", m.days30],
              ["90 days", m.days90],
            ].map(([title, v]) => (
              <span key={title}>
                <small>{title}</small>
                <b>{money(Number(v))}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="cc-panel">
          <h2>Needs attention</h2>
          <div className="cc-attention">
            {[
              ["production", "Awaiting / in production", m.production],
              ["orders", "Ready to ship", m.ready_to_ship],
              ["payments", "Open invoices", m.open_invoices],
              ["inventory", "Low stock", m.low_stock],
              ["inventory", "Stock counts need setup", m.stock_setup],
              ["orders", "Historical fulfillment needs review", m.history_review],
            ].map(([s, t, v]) => (
              <Link key={t} to="/admin" search={{ section: s as Section }}>
                <span>{t}</span>
                <b>{v}</b>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
          <div className="cc-inline-stats">
            <span>
              <small>Completed</small>
              <b>{m.completed}</b>
            </span>
            <span>
              <small>Fulfilled</small>
              <b>{m.fulfilled}</b>
            </span>
          </div>
        </div>
      </div>
      <div className="cc-panel">
        <div className="cc-panel-heading">
          <h2>Recent orders</h2>
          <Link to="/admin" search={{ section: "orders" }} className="cc-link">
            View all orders
          </Link>
        </div>
        <OrderList orders={data.orders} open={openOrder} />
      </div>
      <div className="cc-panel">
        <h2>Recent administrative activity</h2>
        {data.audit.length ? (
          <div className="cc-records">
            {data.audit.map((a) => (
              <div key={a.id}>
                <span>
                  {label(a.action.replaceAll(".", " "))}
                  <small>{a.actor_name}</small>
                </span>
                <time>{new Date(a.created_at).toLocaleString()}</time>
              </div>
            ))}
          </div>
        ) : (
          <p>No recorded changes yet.</p>
        )}
      </div>
      <p className="cc-help">{data.config.historicalWarning}</p>
    </>
  );
}
function OrderList({
  orders,
  open,
  production = false,
}: {
  orders: OrderRow[];
  open: (id: string) => void;
  production?: boolean;
}) {
  return orders.length ? (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>
            <th>Order / customer</th>
            <th>Purchased items</th>
            <th>{production ? "Production" : "Payment / total"}</th>
            <th>Status / next step</th>
            <th>Open</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td data-label="Order">
                <button className="cc-link" onClick={() => open(o.id)}>
                  #{o.number} · {o.customer_name}
                </button>
                <small>{new Date(o.created_at).toLocaleString()}</small>
                <small>{label(o.source)}</small>
              </td>
              <td data-label="Products">{o.titles}</td>
              <td data-label={production ? "Production" : "Payment"}>
                <Badge
                  value={
                    production
                      ? o.source === "stripe_history_review" && o.stage === "new"
                        ? "historical_review_required"
                        : o.stage
                      : o.payment_status
                  }
                />
                {!production && <b>{money(o.total)}</b>}
              </td>
              <td data-label="Status">
                <Badge
                  value={
                    o.source === "stripe_history_review" && o.stage === "new"
                      ? "historical_review_required"
                      : o.stage
                  }
                />
                {o.due_at && <small>Due {new Date(o.due_at).toLocaleDateString()}</small>}
                {o.tracking && (
                  <small>
                    {o.carrier} · {o.tracking}
                  </small>
                )}
              </td>
              <td>
                <button
                  className="cc-icon"
                  onClick={() => open(o.id)}
                  aria-label={`Manage order ${o.number}`}
                >
                  <ArrowUpRight size={20} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title={production ? "No production work in this view" : "No orders in this view"}
      body={
        production
          ? "Assigned work and current custom orders will appear here."
          : "New and historical captured orders appear here. Try adjusting your filters."
      }
    />
  );
}
function Inventory({
  data,
  edit,
}: {
  data: AdminData;
  edit: (i: InventoryRow, mode: string) => void;
}) {
  return (
    <>
      <p className="cc-help">
        Available = on hand − reserved − committed. Starting production consumes committed stock.
        Counts and consumable rules are never guessed.
      </p>
      {data.inventory.length ? (
        <div className="cc-panel">
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Stock item</th>
                  <th>Available / on hand</th>
                  <th>Reserved / committed</th>
                  <th>Incoming / threshold</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.inventory.map((i) => (
                  <tr key={i.id}>
                    <td data-label="Stock item">
                      <b>{i.title}</b>
                      <small>
                        {i.sku} · {label(i.category)}
                      </small>
                    </td>
                    <td data-label="Available / on hand">
                      {i.on_hand === null ? (
                        <Badge value="needs_setup" />
                      ) : (
                        <>
                          <b>
                            {i.on_hand - i.reserved - i.committed} / {i.on_hand}
                          </b>
                          {i.on_hand - i.reserved - i.committed <= i.threshold && (
                            <Badge
                              value={
                                i.on_hand - i.reserved - i.committed === 0
                                  ? "out_of_stock"
                                  : "low_stock"
                              }
                            />
                          )}
                        </>
                      )}
                    </td>
                    <td data-label="Reserved / committed">
                      {i.reserved} / {i.committed}
                    </td>
                    <td data-label="Incoming / threshold">
                      {i.incoming} / {i.threshold}
                    </td>
                    <td>
                      <div className="cc-actions">
                        <button className="cc-button secondary" onClick={() => edit(i, "adjust")}>
                          Adjust stock
                        </button>
                        <button className="cc-button secondary" onClick={() => edit(i, "rule")}>
                          Consumption rule
                        </button>
                        <button className="cc-button secondary" onClick={() => edit(i, "settings")}>
                          Planning settings
                        </button>
                      </div>
                      <small>
                        {data.rules
                          .filter((r) => r.inventory_id === i.id)
                          .map((r) => `${r.product_key}: ${r.units_per_item} units`)
                          .join(" · ") || "No consumption mappings configured"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Empty
          title="Inventory setup required"
          body="Add blanks, material units and finished goods, then enter verified counts. The existing hat catalog remains available."
        />
      )}
      <div className="cc-panel">
        <h2>Inventory movements</h2>
        {data.movements.length ? (
          <div className="cc-records">
            {data.movements.map((m) => (
              <div key={m.id}>
                <span>
                  <b>{m.reason}</b>
                  <small>
                    On hand {m.on_hand_delta > 0 ? "+" : ""}
                    {m.on_hand_delta} · Reserved {m.reserved_delta} · Committed {m.committed_delta}
                  </small>
                  <small>{m.actor_id}</small>
                </span>
                <time>{new Date(m.created_at).toLocaleString()}</time>
              </div>
            ))}
          </div>
        ) : (
          <p>No stock movements recorded.</p>
        )}
      </div>
    </>
  );
}
function Reports({ data, openOrder }: { data: AdminData; openOrder: (id: string) => void }) {
  return (
    <>
      <Overview data={data} openOrder={openOrder} />
      <div className="cc-panel">
        <h2>Best-selling products and variants</h2>
        <p className="cc-help">
          Purchased quantities for fully paid orders created in the selected period. Bonus units are
          excluded. Refunds are reported separately; returned quantities are not inferred.
        </p>
        <div className="cc-records">
          {data.topProducts.map((p) => (
            <div key={p.product_key}>
              <span>
                {p.title}
                <small>{p.product_key}</small>
              </span>
              <b>{p.quantity} purchased</b>
            </div>
          ))}
        </div>
        {!data.topProducts.length && <p>No fully paid product purchases in this period.</p>}
        <div className="cc-actions">
          <button
            className="cc-button secondary"
            onClick={() => csvDownload("sales-by-day", data.trend)}
          >
            <Download size={16} />
            Sales over time CSV
          </button>
          <button
            className="cc-button secondary"
            onClick={() => csvDownload("products", data.topProducts)}
          >
            Product CSV
          </button>
          <button
            className="cc-button secondary"
            onClick={() => csvDownload("operations", [data.metrics])}
          >
            Operations CSV
          </button>
        </div>
      </div>
    </>
  );
}
function Security({
  access,
  refresh,
}: {
  access: Awaited<ReturnType<typeof getMerchantAccess>>;
  refresh: () => Promise<unknown>;
}) {
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="cc-panel cc-security">
      <h2>Authenticator verification</h2>
      <p>
        Privileged accounts can enroll an authenticator. Codes protect this signed-in session for
        four hours. The server rejects reused codes and rate-limits failures.
      </p>
      <p>
        {access.mfaVerified
          ? "This session is verified."
          : access.mfaEnabled
            ? "Enter the current code from your authenticator."
            : access.mfaConfigured
              ? "Enroll an authenticator to protect merchant access."
              : "MFA enrollment needs a server-side encryption key configured before use."}
      </p>
      {!access.mfaEnabled && access.mfaConfigured && (
        <button
          className="cc-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await mfaAction({ data: { action: "enroll", code: "" } });
              setEnrollment(result.enrollment);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Enroll authenticator
        </button>
      )}
      {enrollment && (
        <div className="cc-notice">
          <p>Add an account in your authenticator with this setup key:</p>
          <code>{enrollment.secret}</code>
          <p>Issuer: REC Mama Made · Time based (TOTP), 6 digits, 30 seconds.</p>
        </div>
      )}
      {(enrollment || access.mfaEnabled) && !access.mfaVerified && (
        <form
          className="cc-form"
          onSubmit={async (e) => {
            const f = formValues(e);
            setBusy(true);
            setError("");
            try {
              await mfaAction({ data: { action: "verify", code: getText(f, "code") } });
              setEnrollment(null);
              await refresh();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field name="code" title="Six-digit authenticator code" required />
          <SaveButton busy={busy} />
        </form>
      )}
      {access.mfaEnabled && access.mfaVerified && (
        <div className="cc-form">
          <h3>Recovery codes</h3>
          <p>
            Save these privately. Creating a new set invalidates earlier codes. They are shown only
            here and stored as hashes.
          </p>
          <button
            className="cc-button secondary"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Replace any existing recovery codes? Save the new codes privately before leaving this screen.",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                const result = await recoveryAction({ data: { action: "generate", code: "" } });
                setCodes(result.codes);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Create recovery codes
          </button>
          {codes.length > 0 && (
            <div className="cc-notice">
              <p>Store these outside your phone. Leaving this page clears this display.</p>
              {codes.map((code) => (
                <p key={code}>
                  <code>{code}</code>
                </p>
              ))}
              <button className="cc-button secondary" onClick={() => setCodes([])}>
                Clear displayed codes
              </button>
            </div>
          )}
        </div>
      )}
      {access.mfaEnabled && !access.mfaVerified && (
        <form
          className="cc-form"
          onSubmit={async (e) => {
            const f = formValues(e);
            setBusy(true);
            setError("");
            try {
              await recoveryAction({ data: { action: "recover", code: getText(f, "recovery") } });
              await refresh();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Lost your authenticator?</h3>
          <p>
            Use a saved recovery code to invalidate the old device, all recovery codes and verified
            sessions. You must enroll a new authenticator before merchant access resumes.
          </p>
          <Field name="recovery" title="Recovery code" required />
          <SaveButton busy={busy} />
        </form>
      )}
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
