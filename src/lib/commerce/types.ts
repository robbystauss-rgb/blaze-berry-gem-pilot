export const STAGES = [
  "new",
  "artwork_review",
  "customer_approval",
  "ready_for_production",
  "engraving",
  "assembly",
  "quality_check",
  "packaging",
  "ready_to_ship",
  "shipped",
  "delivered",
  "completed",
  "canceled",
] as const;
export type Stage = (typeof STAGES)[number];
export type Role = "owner" | "manager" | "production";
export type Permission =
  | "orders"
  | "production"
  | "customers"
  | "finance"
  | "inventory"
  | "products"
  | "website"
  | "staff"
  | "audit"
  | "reports";
export const PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: [
    "orders",
    "production",
    "customers",
    "finance",
    "inventory",
    "products",
    "website",
    "staff",
    "audit",
    "reports",
  ],
  manager: ["orders", "production", "customers", "inventory", "products", "reports"],
  production: ["production"],
};
export const CONTENT_KEYS = [
  "announcement",
  "homepage_intro",
  "contact_email",
  "contact_phone",
  "shipping_policy",
  "refund_policy",
  "privacy_policy",
  "seo_title",
  "seo_description",
  "featured_product_ids",
] as const;
export const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export type OrderRow = {
  id: string;
  number: number;
  created_at: string;
  customer_name: string;
  customer_email: string;
  source: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  stage: Stage;
  version: number;
  due_at: string | null;
  assigned_to: string | null;
  tracking: string | null;
  carrier: string | null;
  shipping_address: Record<string, string> | null;
  paid: number;
  refunded: number;
  payment_status: string;
  titles: string;
  financial_detail_known: boolean;
};
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type ItemRow = {
  id: string;
  order_id: string;
  product_key: string;
  title: string;
  quantity: number;
  fulfilled_quantity: number;
  unit_amount: number;
  specifications: Record<string, Json>;
  has_artwork: boolean;
  artwork_type: string | null;
};
export type InventoryRow = {
  id: string;
  sku: string;
  title: string;
  category: string;
  on_hand: number | null;
  reserved: number;
  committed: number;
  incoming: number;
  threshold: number;
  version: number;
};
export type ProductRow = {
  id: string;
  builder_family: string | null;
  title: string;
  description: string;
  category: string;
  state: string;
  images: string[];
  seo_title: string;
  seo_description: string;
  version: number;
};
export type VariantRow = {
  id: string;
  product_id: string;
  title: string;
  sku: string;
  price: number;
  active: boolean;
  options: Record<string, string>;
};
export type AuditRow = {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before_value: Json;
  after_value: Json;
  created_at: string;
};
export type InvoiceRow = {
  order_id: string;
  provider_id: string | null;
  state: string;
  hosted_url: string | null;
  pdf_url: string | null;
  sent_at: string | null;
  last_error: string | null;
};
export type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  reference: string;
  kind: string;
  amount: number;
  fee: number | null;
  occurred_at: string;
  reason: string | null;
};
export type NoteRow = { id: string; actor_id: string; body: string; created_at: string };
export type CustomerRow = {
  email: string;
  name: string;
  order_count: number;
  paid: number;
  refunded: number;
  open_orders: number;
  unpaid_invoices: number;
};
