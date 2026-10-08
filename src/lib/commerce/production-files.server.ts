import { randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { decodeArtwork } from "./checkout.server";
import { audit, assertPermission, orderById } from "./core.server";
import type { Role } from "./types";
export async function saveProductionFile(
  input: { orderId: string; name: string; data: string; reason: string; requestId: string },
  actor: { userId: string; role: Role },
) {
  assertPermission(actor.role, "production");
  const file = decodeArtwork(input.data);
  if (!file) throw new Error("Select a production file.");
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const order = await orderById(tx, input.orderId, true);
    if (actor.role === "production" && order.assigned_to !== actor.userId)
      throw new Error("Access denied: this order is not assigned to you.");
    const [prior] = await tx<{
      id: string;
      order_id: string;
      name: string;
      reason: string;
      mime: string;
      bytes: Uint8Array;
    }>`select * from commerce_production_files where request_id=${input.requestId}`;
    if (prior) {
      if (
        prior.order_id !== input.orderId ||
        prior.name !== input.name ||
        prior.reason !== input.reason ||
        prior.mime !== file.mime ||
        !Buffer.from(prior.bytes).equals(file.bytes)
      )
        throw new Error("Upload request has different content.");
      return { id: prior.id };
    }
    const id = randomUUID();
    await tx`insert into commerce_production_files(id,order_id,name,mime,bytes,actor_id,reason,request_id) values(${id},${order.id},${input.name},${file.mime},${file.bytes},${actor.userId},${input.reason},${input.requestId})`;
    await audit(tx, actor.userId, "order.production_file_uploaded", "order", order.id, null, {
      fileId: id,
      name: input.name,
      reason: input.reason,
    });
    return { id };
  });
}
