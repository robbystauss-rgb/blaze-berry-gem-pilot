import fs from "node:fs";
import path from "node:path";

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function requireText(source, relativePath, label, text) {
  if (!source.includes(text)) {
    throw new Error(`[REC Mama Made] ${label} is missing from ${relativePath}. Review the source before continuing.`);
  }
}

function forbidText(source, relativePath, label, text) {
  if (source.includes(text)) {
    throw new Error(`[REC Mama Made] ${label} is present in ${relativePath}. Review the source before continuing.`);
  }
}

const builderPath = "src/components/build/builder.tsx";
const orderPath = "src/routes/order.tsx";
const homePath = "src/routes/index.tsx";
const studioPath = "src/routes/studio.tsx";
const catalogPath = "src/lib/catalog.ts";
const hatPreviewPath = "src/components/hat/hat-preview.tsx";
const checkoutPath = "src/components/build/checkout-panel.tsx";
const paymentsPath = "src/lib/payments.ts";

const builder = read(builderPath);
const order = read(orderPath);
const home = read(homePath);
const studio = read(studioPath);
const catalog = read(catalogPath);
const hatPreview = read(hatPreviewPath);
const checkout = read(checkoutPath);
const payments = read(paymentsPath);

// Catalog safety: only asset-complete families belong in the customer selector.
requireText(builder, builderPath, "catalog status import", 'import { MASTER } from "@/lib/studio-store";');
requireText(builder, builderPath, "ready-family helper", "function isReadyFamily(id: FamilyId)");
requireText(builder, builderPath, "ready-family filtering", "FAMILY_ORDER.filter(isReadyFamily).map");
requireText(builder, builderPath, "incomplete-family guard", 'if (!patchOnly && !isReadyFamily(familyId)) draft.setFamily("112");');

// Patch-shape safety: legacy/invalid values normalize without reintroducing Louisiana.
requireText(builder, builderPath, "shape allow-list normalization", "PATCH_SHAPES.includes(draft.patchShape as PatchShape)");
forbidText(builder, builderPath, "removed Louisiana patch shape", '"Louisiana"');

// Material safety: the builder must use the approved real swatch/detail assets, never placeholders.
requireText(builder, builderPath, "real material library", "LEATHERETTES.map");
requireText(builder, builderPath, "real material swatches", 'src={item.texture}');
requireText(builder, builderPath, "real material detail", 'src={leather.detail}');
forbidText(builder, builderPath, "material placeholder", "Image being updated");


// Checkout safety: Etsy is retired; payment handoff stays inside the REC checkout experience.
forbidText(builder, builderPath, "retired Etsy checkout", "Etsy");
forbidText(builder, builderPath, "retired Etsy constant", "ETSY_");
forbidText(catalog, catalogPath, "retired Etsy URLs", "etsy.com");
requireText(builder, builderPath, "REC payment panel", "<CheckoutPanel");
requireText(checkout, checkoutPath, "manual Venmo fallback label", "Pay manually with Venmo");
requireText(payments, paymentsPath, "manual Venmo fallback URL", "https://venmo.com/u/Stauss_Distributing_LLC");
requireText(payments, paymentsPath, "Stripe server checkout", "STRIPE_SECRET_KEY");
requireText(payments, paymentsPath, "PayPal server checkout", "PAYPAL_CLIENT_SECRET");

// Patch-preview safety: real leatherette texture is rendered directly, without a fake color wash.
forbidText(hatPreview, hatPreviewPath, "fake patch material gradient", "linear-gradient(160deg");
requireText(hatPreview, hatPreviewPath, "real patch texture", 'backgroundImage: leather.texture ? `url(${leather.texture})` : undefined');

// Patch-only wording must accurately describe the physical product and application status.
requireText(
  builder,
  builderPath,
  "patch-only customer copy",
  "Patch only means a finished loose patch — no hat and no stitching/application.",
);

// Deep links must render deterministically on the server and hydrate into the existing order store.
requireText(builder, builderPath, "SSR-safe prefill state", "const [prefillPending, setPrefillPending] = useState");
requireText(builder, builderPath, "initial order type", 'initialOrderType?: "hat" | "patch";');
requireText(builder, builderPath, "initial family", "initialFamily?: FamilyId;");
requireText(builder, builderPath, "initial color", "initialColor?: string;");
requireText(builder, builderPath, "effective family", "const family = FAMILIES[familyId];");
requireText(builder, builderPath, "effective colors", "const colors = colorsForFamily(familyId);");
requireText(builder, builderPath, "effective pricing order type", "    orderType,");
requireText(builder, builderPath, "effective pricing tier", "    tier: family.tier,");
requireText(builder, builderPath, "effective pricing family", "    family: familyId,");
requireText(builder, builderPath, "effective preview family", "            family={familyId}");
requireText(builder, builderPath, "effective preview color", "            colorway={colorway}");
requireText(builder, builderPath, "effective thumbnail family", "stageThumb(familyId, name)");
requireText(builder, builderPath, "effective mobile summary image", "stageThumb(familyId, colorway) ?? familyHero(familyId)");

// Route-level deep-link guards must reject incomplete models and colors that do not belong to a model.
requireText(order, orderPath, "numeric Richardson search normalization", 'typeof search.family === "string" || typeof search.family === "number"');
requireText(order, orderPath, "ready-family deep-link guard", "function isReadyFamily(value: string): value is FamilyId");
requireText(order, orderPath, "patch-only deep-link guard", 'const patchOnly = search.type === "patch";');
requireText(order, orderPath, "safe initial family", "const initialFamily = !patchOnly && search.family && isReadyFamily(search.family)");
requireText(order, orderPath, "family-specific color guard", "colorsForFamily(colorFamily).includes(search.color)");
requireText(order, orderPath, "builder initial order type", "initialOrderType={search.type}");
requireText(order, orderPath, "builder initial family", "initialFamily={initialFamily}");
requireText(order, orderPath, "builder initial color", "initialColor={initialColor}");

// Staging copy must continue to describe the real approved material source accurately.
requireText(home, homePath, "accurate homepage material source copy", "The staging builder uses the 31 named swatches");
requireText(studio, studioPath, "accurate Studio material source copy", "The staging builder uses the 31 named material swatches from the approved source sheet");

console.log("[REC Mama Made] Verified canonical asset, builder, deep-link, and staging-copy safeguards.");
