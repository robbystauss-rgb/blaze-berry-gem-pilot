import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { saveCustomerSchema, saveCustomerDesignSchema, savedBuildSchema } from "./customer-schemas";
import { ownerError } from "./errors";
import { MAX_NEW_UPLOAD_DATA_URL_LENGTH } from "@/lib/upload-limits";
const uuid = z.string().uuid();
async function actor(userId: string, bearer?: string) {
  return (await import("./access.server")).requireAccess(userId, "customers", bearer);
}
export const searchCustomerProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().max(200))
  .handler(async ({ data, context }) =>
    (await import("./customers.server")).listCustomers(
      data,
      await actor(context.userId, context.bearerToken),
    ),
  );
export const getCustomerProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(uuid)
  .handler(async ({ data, context }) =>
    (await import("./customers.server")).readCustomer(
      data,
      await actor(context.userId, context.bearerToken),
    ),
  );
export const saveCustomerProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveCustomerSchema)
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).saveCustomer(data, await actor(context.userId, context.bearerToken));
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const uploadCustomerAsset = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: uuid,
      customerId: uuid,
      name: z.string().max(180),
      data: z.string().max(MAX_NEW_UPLOAD_DATA_URL_LENGTH),
      kind: z.enum(["original", "production", "proof", "finished"]),
      provenance: z.string().min(5).max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).uploadCustomerArtwork(data, await actor(context.userId, context.bearerToken));
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const saveVaultDesign = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveCustomerDesignSchema)
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).saveCustomerDesign(data, await actor(context.userId, context.bearerToken));
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const getVaultDesignHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(uuid)
  .handler(async ({ data, context }) =>
    (await import("./customers.server")).customerDesignHistory(
      data,
      await actor(context.userId, context.bearerToken),
    ),
  );
export const getPhoneOrderPrice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ customerId: uuid, configuration: savedBuildSchema }))
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).quotePhoneOrder(data, await actor(context.userId, context.bearerToken));
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const savePhoneOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.record(z.string(), z.unknown()))
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).createPhoneOrder(data, await actor(context.userId, context.bearerToken));
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const preparePhoneOrderInvoice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uuid)
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).preparePhoneInvoice(data, await actor(context.userId, context.bearerToken));
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const actOnCustomer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      action: z.enum(["note", "archive", "merge", "link_account", "design_archive"]),
      payload: z.record(z.string(), z.unknown()),
    }),
  )
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).customerOperation(
        data.action,
        data.payload,
        await actor(context.userId, context.bearerToken),
      );
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const saveOrderToVault = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ itemId: uuid, designId: uuid, name: z.string().trim().min(1).max(160) }))
  .handler(async ({ data, context }) => {
    try {
      return await (
        await import("./customers.server")
      ).captureOrderDesign(data, await actor(context.userId, context.bearerToken));
    } catch (e) {
      throw Error(ownerError(e));
    }
  });
export const exportCustomerProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uuid)
  .handler(async ({ data, context }) => {
    const staff = await actor(context.userId, context.bearerToken);
    const { assertPermission, audit } = await import("./core.server");
    assertPermission(staff.role, "reports");
    const record = await (await import("./customers.server")).readCustomer(data, staff);
    const { getSql } = await import("@/lib/db");
    await audit(await getSql(), staff.userId, "customer.record_exported", "customer", data, null, {
      assetCount: record.assets.length,
      orderCount: record.orders.length,
    });
    return {
      filename: `customer-C-${record.profile.number}.json`,
      json: JSON.stringify(record, null, 2),
    };
  });
