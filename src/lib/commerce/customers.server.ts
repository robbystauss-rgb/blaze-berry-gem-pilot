import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import catalog from "@/data/master-catalog.json";
import { FAMILIES, LEATHERETTES, PATCH_SHAPES, PLACEMENTS, colorsForFamily } from "@/lib/catalog";
import { isRetiredHatModel } from "@/lib/catalog-lifecycle";
import { physicalPatch } from "@/lib/patch-physical";
import { assertPermission, audit, ORDER_SELECT, orderById, reserveInventory } from "./core.server";
import { quoteSelection, reservePromotion } from "./pricing.server";
import { artworkReadiness } from "./artwork-readiness.server";
import { decodeArtwork } from "./checkout.server";
import {
  normalizeCustomerPhone,
  saveCustomerSchema,
  saveCustomerDesignSchema,
  savedBuildSchema,
  type CustomerProfile,
  type CustomerAsset,
  type CustomerDesign,
  type SavedBuild,
} from "./customer-schemas";
import type { Role, OrderRow, NoteRow } from "./types";
type Actor = { userId: string; role: Role };
const uuid = z.string().uuid();
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const assetColumns =
  "id,customer_id,kind,name,mime,checksum,byte_size,width,height,preview is not null as has_preview,provenance,created_at";

async function profile(sql: Sql, id: string, lock = false) {
  if (lock) await sql`select id from commerce_customers where id=${id} for update`;
  const [row] = await sql<CustomerProfile>`select * from commerce_customers where id=${id}`;
  if (!row) throw Error("Customer profile not found.");
  return row;
}
async function editableProfile(sql: Sql, id: string) {
  const row = await profile(sql, id, true);
  if (row.merged_into)
    throw Error(
      "This customer was linked to another profile. Open the retained profile before creating new work.",
    );
  if (row.archived)
    throw Error("This customer is archived. Restore the profile before creating new work.");
  return row;
}
async function belongs(sql: Sql, requested: string, actual: string) {
  return (
    (
      await sql`select id from commerce_customers where id=${actual} and (id=${requested} or merged_into=${requested})`
    ).length > 0
  );
}
export async function listCustomers(search: string, actor: Actor, connection?: Sql) {
  assertPermission(actor.role, "customers");
  const sql = connection ?? (await getSql());
  const term = z.string().trim().max(200).parse(search),
    like = `%${term}%`,
    digits = term.replace(/\D/g, "");
  return sql<
    CustomerProfile & { order_count: number }
  >`select c.*, (select count(*)::int from commerce_orders o where o.customer_id=c.id or o.customer_id in(select id from commerce_customers where merged_into=c.id)) as order_count from commerce_customers c where c.merged_into is null and (${term}='' or c.name ilike ${like} or c.email ilike ${like} or c.business_name ilike ${like} or c.aliases::text ilike ${like} or c.tags::text ilike ${like} or c.number::text=${term.replace(/^C-?/i, "")} or (${digits}<>'' and c.phone_normalized like ${"%" + digits + "%"}) or exists(select 1 from commerce_orders o where (o.customer_id=c.id or o.customer_id in(select id from commerce_customers where merged_into=c.id)) and o.number::text=${term.replace(/^#/, "")})) order by c.archived,c.updated_at desc,c.number desc limit 100`;
}
export async function saveCustomer(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "customers");
  const p = saveCustomerSchema.parse(raw),
    b = p.body,
    phone = normalizeCustomerPhone(b.phone, b.phoneCountry),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('customer-profile-directory'))`;
    const [before] =
      await tx<CustomerProfile>`select * from commerce_customers where id=${p.id} for update`;
    if (before && before.version !== p.version)
      throw Error("Customer changed. Reopen the profile before saving.");
    if (before?.merged_into) throw Error("Edit the retained customer profile after a merge.");
    if (!before && p.version !== 0) throw Error("Customer profile not found.");
    if (
      !before &&
      !p.reviewedDuplicate &&
      (
        await tx`select id from commerce_customers where merged_into is null and (lower(name)=lower(${b.name}) or (${b.email}::text is not null and lower(email)=${b.email}) or (${phone}<>'' and phone_normalized=${phone})) limit 1`
      ).length
    )
      throw Error(
        "A possible duplicate exists. Search the name, phone or email, then explicitly confirm a separate customer if needed.",
      );
    await tx`insert into commerce_customers(id,name,email,phone,phone_normalized,preferred_contact,business_name,aliases,tags,delivery_preference,address,preferences,created_by) values(${p.id},${b.name},${b.email},${b.phone},${phone},${b.preferredContact},${b.businessName},${JSON.stringify(b.aliases)},${JSON.stringify(b.tags)},${b.deliveryPreference},${JSON.stringify(b.address)},${b.preferences},${actor.userId}) on conflict(id) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,phone_normalized=excluded.phone_normalized,preferred_contact=excluded.preferred_contact,business_name=excluded.business_name,aliases=excluded.aliases,tags=excluded.tags,delivery_preference=excluded.delivery_preference,address=excluded.address,preferences=excluded.preferences,version=commerce_customers.version+1,updated_at=now()`;
    await audit(
      tx,
      actor.userId,
      before ? "customer.profile_updated" : "customer.profile_created",
      "customer",
      p.id,
      before ?? null,
      { ...b, phoneCountry: undefined },
    );
    return { id: p.id };
  });
}
export function buildCompatibility(c: SavedBuild) {
  const issues: string[] = [];
  const model = catalog.models.find((m) => m.id === c.modelId);
  const variant = model?.colorways.find((v) => v.id === c.variantId);
  if (!model || model.bucket !== "ready" || isRetiredHatModel(c.modelId))
    issues.push(
      "This exact hat model is no longer offered. Choose an alternative explicitly; no model is substituted.",
    );
  if (
    !variant ||
    !colorsForFamily(c.modelId as keyof typeof FAMILIES).includes(variant.officialName)
  )
    issues.push("This exact colorway is unavailable. Review a new selection before ordering.");
  if (
    !LEATHERETTES.some((m) => m.id === c.leatherette) ||
    !PATCH_SHAPES.includes(c.patchShape as never) ||
    !PLACEMENTS.some((p) => p.id === c.placement)
  )
    issues.push("A material, shape or placement needs a new production review.");
  const nominal = physicalPatch(c.patchShape, c.patchSize);
  if (
    Math.abs(c.physicalInches.width - nominal.width) > 0.001 ||
    Math.abs(c.physicalInches.height - nominal.height) > 0.001
  )
    issues.push(
      "Saved physical dimensions differ from today's offered size. Request a reviewed quote; dimensions will not be silently changed.",
    );
  return issues;
}
export function selectionForSavedBuild(c: SavedBuild) {
  const issues = buildCompatibility(c);
  if (issues.length) throw Error(issues.join(" "));
  const variant = catalog.models
    .find((m) => m.id === c.modelId)!
    .colorways.find((v) => v.id === c.variantId)!;
  return {
    orderType: c.orderType,
    family: c.modelId,
    colorway: variant.officialName,
    leatherette: c.leatherette,
    patchShape: c.patchShape,
    patchSize: c.patchSize,
    placement: c.placement,
    quantity: c.quantity,
  };
}
export async function readCustomer(id: string, actor: Actor) {
  assertPermission(actor.role, "customers");
  const sql = await getSql();
  let c = await profile(sql, uuid.parse(id));
  if (c.merged_into) c = await profile(sql, c.merged_into);
  const group = (
    await sql<{
      id: string;
    }>`select id from commerce_customers where id=${c.id} or merged_into=${c.id}`
  ).map((x) => x.id);
  const designs =
    await sql<CustomerDesign>`select d.*,r.configuration,r.artwork_asset_id from commerce_customer_designs d join commerce_customer_design_revisions r on r.design_id=d.id and r.revision=d.version where d.customer_id=any(${group}::text[]) order by d.updated_at desc`;
  return {
    profile: c,
    orders: await sql.query<OrderRow>(
      `${ORDER_SELECT} where o.customer_id=any($1::text[]) order by o.created_at desc limit 100`,
      [group],
    ),
    designs: designs.map((d) => ({ ...d, compatibility: buildCompatibility(d.configuration) })),
    assets: await sql.query<CustomerAsset>(
      `select ${assetColumns} from commerce_customer_assets where customer_id=any($1::text[]) order by created_at desc limit 300`,
      [group],
    ),
    notes:
      await sql<NoteRow>`select id,actor_id,body,created_at from commerce_notes where customer_id=any(${group}::text[]) order by created_at desc`,
    legacyContactNotes:
      await sql<NoteRow>`select id,actor_id,body,created_at from commerce_notes where customer_id is null and order_id is null and customer_email in(select email from commerce_customers where id=any(${group}::text[]) and email is not null) order by created_at desc`,
    documents:
      actor.role === "owner"
        ? await sql<{
            id: string;
            kind: string;
            state: string;
            order_id: string;
          }>`select id,kind,state,order_id from commerce_studio_documents where customer_id=any(${group}::text[]) or order_id in(select id from commerce_orders where customer_id=any(${group}::text[])) order by created_at desc limit 100`
        : [],
    quotes:
      actor.role === "owner"
        ? await sql<{
            id: string;
            number: number;
            state: string;
            total: number;
          }>`select id,number,state,total from commerce_quotes where customer_id=any(${group}::text[]) order by updated_at desc limit 100`
        : [],
    history: await sql<{
      id: string;
      action: string;
      created_at: string;
    }>`select id,action,created_at from commerce_audit where resource_type='customer' and resource_id=any(${group}::text[]) order by created_at desc limit 80`,
  };
}
export async function uploadCustomerArtwork(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "customers");
  const p = z
    .object({
      id: uuid,
      customerId: uuid,
      name: z.string().trim().min(1).max(180),
      data: z.string().max(4_100_000),
      kind: z.enum(["original", "production", "proof", "finished"]).default("original"),
      provenance: z.string().trim().min(5).max(500),
    })
    .parse(raw);
  const art = decodeArtwork(p.data);
  if (!art) throw Error("Choose an artwork file.");
  const checksum = createHash("sha256").update(art.bytes).digest("hex");
  let width: number | null = null,
    height: number | null = null,
    preview: Buffer | null = null;
  if (art.mime.startsWith("image/")) {
    try {
      const image = sharp(art.bytes, { limitInputPixels: 32_000_000 });
      const metadata = await image.metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
      preview = await image
        .rotate()
        .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      throw Error(
        "This image could not be safely decoded. Upload a supported image with no more than 32 million pixels, or a PDF for manual review.",
      );
    }
  }
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await editableProfile(tx, p.customerId);
    const [before] = await tx<{
      id: string;
      checksum: string;
      customer_id: string;
    }>`select id,checksum,customer_id from commerce_customer_assets where id=${p.id}`;
    if (before) {
      if (before.checksum !== checksum || before.customer_id !== p.customerId)
        throw Error(
          "This upload request already belongs to different artwork. Reopen the upload form.",
        );
      return { id: p.id };
    }
    await tx`insert into commerce_customer_assets(id,customer_id,kind,name,mime,bytes,checksum,byte_size,width,height,preview,provenance,actor_id) values(${p.id},${p.customerId},${p.kind},${p.name},${art.mime},${art.bytes},${checksum},${art.bytes.length},${width},${height},${preview},${p.provenance},${actor.userId})`;
    await audit(tx, actor.userId, "customer.artwork_saved", "customer", p.customerId, null, {
      assetId: p.id,
      checksum,
      kind: p.kind,
    });
    return { id: p.id };
  });
}
export async function customerArtwork(id: string, actor: Actor, preview = false) {
  assertPermission(actor.role, "customers");
  const sql = await getSql();
  const [row] = await sql<{
    bytes: Uint8Array;
    preview: Uint8Array | null;
    mime: string;
    name: string;
    customer_id: string;
  }>`select bytes,preview,mime,name,customer_id from commerce_customer_assets where id=${uuid.parse(id)}`;
  if (!row) throw Error("Customer artwork not found.");
  if (preview && !row.preview)
    throw Error("This source has no safe image preview; download it for review.");
  if (!preview)
    await audit(
      sql,
      actor.userId,
      "customer.artwork_downloaded",
      "customer",
      row.customer_id,
      null,
      { assetId: id },
    );
  return {
    bytes: preview ? row.preview! : row.bytes,
    mime: preview ? "image/png" : row.mime,
    name: row.name,
  };
}
export async function saveCustomerDesign(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "customers");
  const p = saveCustomerDesignSchema.parse(raw),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    await editableProfile(tx, p.customerId);
    const [before] =
      await tx<CustomerDesign>`select * from commerce_customer_designs where id=${p.id} for update`;
    if (before && !(await belongs(tx, p.customerId, before.customer_id)))
      throw Error(
        "This design belongs to a different customer. Cross-customer reuse requires separate documented authorization.",
      );
    if ((before?.version ?? 0) !== p.version)
      throw Error("Design changed. Open the latest revision before saving.");
    if (before?.state === "archived")
      throw Error("Restore this archived design before creating a new revision.");
    if (p.artworkAssetId) {
      const [asset] = await tx<{
        customer_id: string;
        kind: string;
      }>`select customer_id,kind from commerce_customer_assets where id=${p.artworkAssetId}`;
      if (!asset || !(await belongs(tx, p.customerId, asset.customer_id)))
        throw Error("Select artwork owned by this customer.");
      if (asset.kind !== "original" && asset.kind !== "production")
        throw Error(
          "Use original or production artwork. A proof or finished photograph is not a production master.",
        );
    }
    if (!p.artworkAssetId && !p.configuration.patchText.trim())
      throw Error("Choose source artwork or enter the actual design text.");
    await tx`insert into commerce_customer_designs(id,customer_id,name,collection,state,created_by) values(${p.id},${p.customerId},${p.name},${p.collection},${p.approvedProofId ? "approved" : "draft"},${actor.userId}) on conflict(id) do update set name=excluded.name,collection=excluded.collection,state=excluded.state,version=commerce_customer_designs.version+1,updated_at=now()`;
    if (p.sourceItemId) {
      const [source] = await tx<{
        customer_id: string;
      }>`select o.customer_id from commerce_order_items i join commerce_orders o on o.id=i.order_id where i.id=${p.sourceItemId}`;
      if (!source?.customer_id || !(await belongs(tx, p.customerId, source.customer_id)))
        throw Error("The source order belongs to a different customer.");
    }
    if (
      p.approvedProofId &&
      !(
        await tx`select d.id from commerce_studio_documents d join commerce_orders o on o.id=d.order_id join commerce_order_items i on i.order_id=o.id where d.id=${p.approvedProofId} and i.id=${p.sourceItemId} and d.kind='proof' and d.state='approved' and (o.customer_id=${p.customerId} or o.customer_id in(select id from commerce_customers where merged_into=${p.customerId}))`
      ).length
    )
      throw Error("Use an actual approved proof for this customer's work.");
    await tx`insert into commerce_customer_design_revisions(design_id,revision,configuration,artwork_asset_id,source_item_id,approved_proof_id,actor_id,note) values(${p.id},${p.version + 1},${JSON.stringify(p.configuration)},${p.artworkAssetId},${p.sourceItemId},${p.approvedProofId},${actor.userId},${p.note})`;
    await audit(
      tx,
      actor.userId,
      "customer.design_revision_saved",
      "customer",
      p.customerId,
      null,
      { designId: p.id, revision: p.version + 1 },
    );
    return { id: p.id, revision: p.version + 1 };
  });
}
export async function customerDesignHistory(id: string, actor: Actor) {
  assertPermission(actor.role, "customers");
  const sql = await getSql();
  return sql<{
    revision: number;
    configuration: SavedBuild;
    artwork_asset_id: string | null;
    note: string;
    created_at: string;
  }>`select revision,configuration,artwork_asset_id,note,created_at from commerce_customer_design_revisions where design_id=${uuid.parse(id)} order by revision desc`;
}
export async function quotePhoneOrder(raw: unknown, actor: Actor, connection?: Sql) {
  assertPermission(actor.role, "orders");
  assertPermission(actor.role, "customers");
  const p = z.object({ customerId: uuid, configuration: savedBuildSchema }).parse(raw),
    sql = connection ?? (await getSql());
  const c = await profile(sql, p.customerId);
  if (c.archived || c.merged_into)
    throw Error("Open an active, retained customer profile before creating an order.");
  const selection = selectionForSavedBuild(p.configuration);
  const quote = await quoteSelection(selection, "", c.email ?? "", sql, null);
  const { previewSnapshot } = await import("./preview-snapshot.server");
  const preview = await previewSnapshot(
    {
      ...selection,
      family: selection.family as keyof typeof FAMILIES,
      patchShape: p.configuration.patchShape as (typeof PATCH_SHAPES)[number],
      placement: p.configuration.placement as (typeof PLACEMENTS)[number]["id"],
      previewPlacement: {
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        ...(p.configuration.patchPosition ? { position: p.configuration.patchPosition } : {}),
      },
    },
    sql,
  );
  return { ...quote, preview, previewSignature: fingerprint(preview) };
}
export async function createPhoneOrder(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "orders");
  assertPermission(actor.role, "customers");
  const p = z
    .object({
      requestId: uuid,
      customerId: uuid,
      designId: uuid.nullable(),
      revision: z.number().int().positive().nullable(),
      configuration: savedBuildSchema,
      artworkAssetId: uuid.nullable(),
      expectedTotal: z.number().int().positive(),
      expectedPriceRevision: z.number().int().min(0),
      expectedPreviewSignature: z.string().length(64),
      shipping: z.number().int().min(0).max(1000000),
      tax: z.number().int().min(0).max(1000000),
      chargesReviewed: z.literal(true),
    })
    .parse(raw);
  const digest = fingerprint(p),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"phone-order:" + p.requestId}))`;
    const [prior] = await tx<{
      order_id: string;
      fingerprint: string;
    }>`select order_id,fingerprint from commerce_phone_order_requests where id=${p.requestId}`;
    if (prior) {
      if (prior.fingerprint !== digest)
        throw Error(
          "This order request already has different details. Review the existing order before creating another.",
        );
      return { id: prior.order_id, duplicate: true };
    }
    const c = await editableProfile(tx, p.customerId);
    if ((p.shipping || p.tax) && actor.role !== "owner")
      throw Error("Finance must review shipping and tax charges.");
    if (p.designId) {
      const [design] =
        await tx<CustomerDesign>`select * from commerce_customer_designs where id=${p.designId} for update`;
      if (
        !design ||
        !(await belongs(tx, p.customerId, design.customer_id)) ||
        design.state === "archived" ||
        design.version !== p.revision
      )
        throw Error("Choose a current saved design owned by this customer.");
    }
    let artwork: { bytes: Uint8Array; mime: string; checksum: string } | null = null;
    if (p.artworkAssetId) {
      const [asset] = await tx<{
        customer_id: string;
        kind: string;
        bytes: Uint8Array;
        mime: string;
        checksum: string;
      }>`select customer_id,kind,bytes,mime,checksum from commerce_customer_assets where id=${p.artworkAssetId}`;
      if (
        !asset ||
        !(await belongs(tx, p.customerId, asset.customer_id)) ||
        !["original", "production"].includes(asset.kind)
      )
        throw Error("Use this customer's original or production artwork.");
      artwork = asset;
    }
    if (!artwork && !p.configuration.patchText)
      throw Error("Select artwork or add the actual design text.");
    const selection = selectionForSavedBuild(p.configuration),
      quote = await quotePhoneOrder(p, actor, tx);
    if (quote.totalCents !== p.expectedTotal || quote.priceRevision !== p.expectedPriceRevision)
      throw Error("Current pricing changed. Refresh the price review before creating this draft.");
    if (quote.previewSignature !== p.expectedPreviewSignature)
      throw Error(
        "The exact photo or calibration changed. Review the current mock-up before creating the new draft.",
      );
    const total = quote.totalCents + p.shipping + p.tax;
    if (!Number.isSafeInteger(total) || total > 10_000_000)
      throw Error("This order total needs a reviewed bulk quote.");
    const orderId = p.requestId,
      itemId = randomUUID();
    await tx`insert into commerce_orders(id,customer_id,customer_name,customer_email,shipping_address,source,subtotal,discount,shipping,tax,total) values(${orderId},${c.id},${c.name},${c.email},${JSON.stringify(c.delivery_preference === "shipping" ? c.address : null)},'phone_order',${quote.subtotalCents},${quote.discountCents},${p.shipping},${p.tax},${total})`;
    const specs = {
      ...selection,
      patchText: p.configuration.patchText,
      notes: p.configuration.notes,
      previewPlacement: { position: p.configuration.patchPosition },
      preview: quote.preview,
      physicalInches: p.configuration.physicalInches,
      variantId: p.configuration.variantId,
      customerDesignId: p.designId,
      customerDesignRevision: p.revision,
      sourceAssetId: p.artworkAssetId,
      sourceChecksum: artwork?.checksum ?? null,
      artworkReadiness: artwork
        ? await artworkReadiness(artwork, p.configuration.physicalInches)
        : null,
      deliveryPreference: c.delivery_preference,
      instructions: p.configuration.notes,
      pricing: quote,
    };
    await tx`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type) values(${itemId},${orderId},${selection.orderType + ":" + selection.family + ":" + selection.colorway},${`Richardson ${selection.family} · ${selection.colorway} · ${p.configuration.patchShape}`},${selection.quantity},${quote.fulfilled},${quote.unitCents},${JSON.stringify(specs)},${artwork?.bytes ?? null},${artwork?.mime ?? null})`;
    await reservePromotion(tx, orderId, selection, "", c.email ?? "", quote, null);
    await reserveInventory(tx, orderId, actor.userId);
    await tx`insert into commerce_proof_controls(order_id,required) values(${orderId},true)`;
    await tx`insert into commerce_phone_order_requests(id,order_id,fingerprint,customer_id,design_id,revision,actor_id) values(${p.requestId},${orderId},${digest},${c.id},${p.designId},${p.revision},${actor.userId})`;
    await audit(tx, actor.userId, "order.phone_draft_created", "order", orderId, null, {
      customerId: c.id,
      designId: p.designId,
      revision: p.revision,
      total,
      requiresNewProof: true,
    });
    await audit(tx, actor.userId, "customer.phone_order_created", "customer", c.id, null, {
      orderId,
    });
    // Draft creation intentionally sends no messages or payment requests.
    return { id: orderId, duplicate: false };
  });
}
export async function preparePhoneInvoice(orderId: string, actor: Actor) {
  assertPermission(actor.role, "finance");
  const sql = await getSql();
  const order = await sql.transaction(async (tx) => {
    const o = await orderById(tx, uuid.parse(orderId), true);
    if (o.source !== "phone_order" || !o.customer_id || o.paid || o.stage === "canceled")
      throw Error("Choose an unpaid phone-order draft.");
    const c = await profile(tx, o.customer_id);
    if (!c.email || !z.email().safeParse(c.email).success)
      throw Error(
        "This phone-only draft is saved. Add a genuine customer email to the profile before preparing an eligible Studio Invoice. No address is invented and no message is sent.",
      );
    const [existing] = await tx<{
      id: string;
    }>`select id from commerce_studio_documents where order_id=${orderId} and kind='invoice' and state<>'void'`;
    if (existing) return { ...o, existingId: existing.id };
    await tx`update commerce_orders set customer_email=${c.email} where id=${orderId}`;
    return { ...o, customer_email: c.email, existingId: null };
  });
  if (order.existingId) return { id: order.existingId };
  const { saveStudio } = await import("./studio.server");
  const items = await sql<{
    id: string;
    title: string;
    quantity: number;
    unit_amount: number;
  }>`select id,title,quantity,unit_amount from commerce_order_items where order_id=${orderId}`;
  return saveStudio(
    {
      kind: "invoice",
      id: randomUUID(),
      version: 0,
      orderId,
      body: {
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        billingAddress: "",
        shippingAddress: Object.values(order.shipping_address ?? {})
          .filter(Boolean)
          .join(", "),
        lines: items.map((i) => ({
          id: i.id,
          kind: "product",
          title: i.title,
          quantity: i.quantity,
          unitAmount: i.unit_amount,
          specifications: "Recorded exact saved design",
          productKey: "",
        })),
        shipping: order.shipping,
        tax: order.tax,
        discount: order.discount,
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        terms: "",
        notes: "",
        totalsConfirmed: false,
        availabilityConfirmed: false,
        requiresProof: true,
      },
    },
    actor,
  );
}
export async function captureOrderDesign(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "customers");
  assertPermission(actor.role, "orders");
  const p = z
      .object({ itemId: uuid, designId: uuid, name: z.string().trim().min(1).max(160) })
      .parse(raw),
    sql = await getSql();
  const [item] = await sql<{
    specifications: Record<string, unknown>;
    artwork: Uint8Array | null;
    artwork_type: string | null;
    customer_id: string | null;
    quantity: number;
    order_id: string;
  }>`select i.specifications,i.artwork,i.artwork_type,o.customer_id,i.quantity,i.order_id from commerce_order_items i join commerce_orders o on o.id=i.order_id where i.id=${p.itemId}`;
  if (!item?.customer_id)
    throw Error(
      "Link this order to a reviewed customer profile before saving artwork to the vault.",
    );
  let c = await profile(sql, item.customer_id);
  if (c.merged_into) c = await profile(sql, c.merged_into);
  const s = item.specifications;
  const model = catalog.models.find((m) => m.id === s.family);
  const variant = model?.colorways.find((v) => v.officialName === s.colorway);
  if (!model || !variant)
    throw Error(
      "This historical item has no exact model/colorway configuration. Save its original artwork and enter a reviewed design from the customer profile.",
    );
  let assetId: string | null = null;
  if (item.artwork && item.artwork_type) {
    const [prior] = await sql<{
      id: string;
    }>`select id from commerce_customer_assets where source_item_id=${p.itemId} and kind='original'`;
    assetId = prior?.id ?? randomUUID();
    if (!prior) {
      const bytes = Buffer.from(item.artwork),
        checksum = createHash("sha256").update(bytes).digest("hex");
      let preview: Buffer | null = null,
        width: number | null = null,
        height: number | null = null;
      if (/^image\/(png|jpeg|webp)$/.test(item.artwork_type))
        try {
          const im = sharp(bytes, { limitInputPixels: 32_000_000 });
          const m = await im.metadata();
          width = m.width ?? null;
          height = m.height ?? null;
          preview = await im
            .rotate()
            .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
        } catch {
          /* Preserve the original; no misleading derivative. */
        }
      await sql.transaction(async (tx) => {
        await editableProfile(tx, c.id);
        await tx`insert into commerce_customer_assets(id,customer_id,kind,name,mime,bytes,checksum,byte_size,width,height,preview,provenance,source_item_id,actor_id) values(${assetId},${c.id},'original',${"Original order artwork " + p.itemId},${item.artwork_type},${bytes},${checksum},${bytes.length},${width},${height},${preview},'Original uploaded order bytes; retained by owner',${p.itemId},${actor.userId})`;
        await audit(tx, actor.userId, "customer.order_artwork_retained", "customer", c.id, null, {
          assetId,
          sourceItemId: p.itemId,
          checksum,
        });
      });
    }
  }
  const oldPreview = s.preview as { physicalInches?: unknown } | undefined;
  const position = (s.previewPlacement as { position?: unknown } | undefined)?.position;
  const configuration = savedBuildSchema.parse({
    orderType: s.orderType,
    modelId: model.id,
    variantId: variant.id,
    leatherette: s.leatherette,
    patchShape: s.patchShape,
    patchSize: s.patchSize,
    physicalInches:
      oldPreview?.physicalInches ??
      s.physicalInches ??
      physicalPatch(String(s.patchShape), s.patchSize as "small" | "medium" | "large"),
    placement: s.placement,
    patchPosition: position ?? null,
    patchText: s.patchText ?? "",
    quantity: item.quantity,
    notes: s.notes ?? s.instructions ?? "",
    previewSnapshot: oldPreview ?? null,
  });
  const [proof] = await sql<{
    id: string;
  }>`select id from commerce_studio_documents where order_id=${item.order_id} and kind='proof' and state='approved' order by proof_version desc limit 1`;
  const result = await saveCustomerDesign(
    {
      id: p.designId,
      customerId: c.id,
      version: 0,
      name: p.name,
      configuration,
      artworkAssetId: assetId,
      note: "Saved original order configuration for future owner-assisted work",
      sourceItemId: p.itemId,
      approvedProofId: proof?.id ?? null,
    },
    actor,
  );
  return { ...result, customerId: c.id };
}
export async function customerOperation(action: string, raw: unknown, actor: Actor) {
  assertPermission(actor.role, "customers");
  const sql = await getSql();
  if (action === "design_archive") {
    const p = z
      .object({
        customerId: uuid,
        designId: uuid,
        version: z.number().int().positive(),
        archived: z.boolean(),
      })
      .parse(raw);
    return sql.transaction(async (tx) => {
      await editableProfile(tx, p.customerId);
      const [design] =
        await tx<CustomerDesign>`select * from commerce_customer_designs where id=${p.designId} for update`;
      if (
        !design ||
        !(await belongs(tx, p.customerId, design.customer_id)) ||
        design.version !== p.version
      )
        throw Error("Design changed. Refresh its history before archiving or restoring.");
      await tx`update commerce_customer_designs set state=${p.archived ? "archived" : "draft"},version=version+1,updated_at=now() where id=${p.designId}`;
      await tx`insert into commerce_customer_design_revisions(design_id,revision,configuration,artwork_asset_id,source_item_id,approved_proof_id,actor_id,note) select design_id,revision+1,configuration,artwork_asset_id,source_item_id,approved_proof_id,${actor.userId},${p.archived ? "Archived by owner; original source and revisions retained" : "Restored for review; new orders require current approval"} from commerce_customer_design_revisions where design_id=${p.designId} and revision=${p.version}`;
      await audit(
        tx,
        actor.userId,
        p.archived ? "customer.design_archived" : "customer.design_restored",
        "customer",
        p.customerId,
        null,
        { designId: p.designId, revision: p.version + 1 },
      );
      return { id: p.customerId };
    });
  }
  if (action === "note") {
    const p = z.object({ customerId: uuid, body: z.string().trim().min(1).max(4000) }).parse(raw);
    return sql.transaction(async (tx) => {
      await editableProfile(tx, p.customerId);
      const id = randomUUID();
      await tx`insert into commerce_notes(id,customer_id,actor_id,body) values(${id},${p.customerId},${actor.userId},${p.body})`;
      await audit(tx, actor.userId, "customer.note_added", "customer", p.customerId, null, {
        noteId: id,
      });
      return { id: p.customerId };
    });
  }
  if (action === "archive") {
    const p = z
      .object({ customerId: uuid, version: z.number().int(), archived: z.boolean() })
      .parse(raw);
    return sql.transaction(async (tx) => {
      const c = await profile(tx, p.customerId, true);
      if (c.version !== p.version) throw Error("Customer changed. Refresh before archiving.");
      await tx`update commerce_customers set archived=${p.archived},version=version+1,updated_at=now() where id=${p.customerId}`;
      await audit(
        tx,
        actor.userId,
        p.archived ? "customer.archived" : "customer.restored",
        "customer",
        c.id,
      );
      return { id: c.id };
    });
  }
  if (action === "merge") {
    assertPermission(actor.role, "staff");
    const p = z
      .object({
        sourceId: uuid,
        targetId: uuid,
        sourceVersion: z.number().int(),
        targetVersion: z.number().int(),
        reason: z.string().trim().min(10).max(500),
        confirmed: z.literal(true),
      })
      .parse(raw);
    if (p.sourceId === p.targetId) throw Error("Choose two distinct profiles.");
    return sql.transaction(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('customer-profile-directory'))`;
      const a = await editableProfile(tx, p.sourceId),
        b = await editableProfile(tx, p.targetId);
      if (a.version !== p.sourceVersion || b.version !== p.targetVersion)
        throw Error("A profile changed. Review both profiles before merging.");
      await tx`update commerce_customers set merged_into=${b.id},version=version+1,updated_at=now() where id=${a.id} or merged_into=${a.id}`;
      await tx`update commerce_customer_accounts set customer_id=${b.id} where customer_id=${a.id} or customer_id in(select id from commerce_customers where merged_into=${b.id})`;
      await audit(
        tx,
        actor.userId,
        "customer.profiles_linked",
        "customer",
        b.id,
        { sourceId: a.id },
        { reason: p.reason, retainsOriginalOwnership: true },
      );
      return { id: b.id };
    });
  }
  if (action === "link_account") {
    assertPermission(actor.role, "staff");
    const p = z
      .object({
        customerId: uuid,
        userId: z.string().min(1).max(200),
        reason: z.string().trim().min(10).max(500),
        confirmed: z.literal(true),
      })
      .parse(raw);
    return sql.transaction(async (tx) => {
      await editableProfile(tx, p.customerId);
      if (!(await tx`select id from "user" where id=${p.userId} and "emailVerified"=true`).length)
        throw Error(
          "A verified existing account and independent owner identity review are required.",
        );
      const [link] = await tx<{
        customer_id: string;
      }>`select customer_id from commerce_customer_accounts where user_id=${p.userId}`;
      if (link && link.customer_id !== p.customerId)
        throw Error(
          "This verified account is already linked elsewhere. Review the identity history.",
        );
      await tx`insert into commerce_customer_accounts(user_id,customer_id,verified_by,reason) values(${p.userId},${p.customerId},${actor.userId},${p.reason}) on conflict do nothing`;
      await audit(
        tx,
        actor.userId,
        "customer.account_link_verified",
        "customer",
        p.customerId,
        null,
        { userId: p.userId, reason: p.reason },
      );
      return { id: p.customerId };
    });
  }
  throw Error("This customer action is unavailable.");
}
