import { getSessionUser } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";
import { audit, assertPermission } from "./core.server";
import type { Permission, Role } from "./types";

export async function membership(userId: string, bearer?: string) {
  const user = await getSessionUser(bearer);
  if (!user || user.id !== userId) throw new Error("Unauthorized");
  const sql = await getSql();
  const allowed = (process.env.REC_OWNER_USER_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (allowed.includes(user.id))
    await sql.transaction(async (tx) => {
      const inserted =
        await tx`insert into merchant_staff(user_id,role) values(${user.id},'owner') on conflict do nothing returning user_id`;
      if (inserted.length) await audit(tx, user.id, "staff.owner_provisioned", "staff", user.id);
    });
  const [row] = await sql<{
    role: Role;
    active: boolean;
  }>`select role,active from merchant_staff where user_id=${user.id}`;
  if (!row?.active) throw new Error("Access denied: your account has no active merchant role.");
  return { userId: user.id, role: row.role };
}
export async function requireAccess(userId: string, permission: Permission, bearer?: string) {
  const actor = await membership(userId, bearer);
  assertPermission(actor.role, permission);
  return actor;
}
