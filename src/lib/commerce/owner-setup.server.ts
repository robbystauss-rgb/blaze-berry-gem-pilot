import { createHash, timingSafeEqual } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { audit } from "./core.server";

function invitation(token: string) {
  const digest = createHash("sha256").update(token).digest("hex");
  const configured = process.env.REC_OWNER_INVITE_SHA256 ?? "";
  const expires = Date.parse(process.env.REC_OWNER_INVITE_EXPIRES_AT ?? "");
  const email = process.env.REC_OWNER_INVITE_EMAIL?.trim().toLowerCase();
  if (
    !/^[\da-f]{64}$/i.test(configured) ||
    !Number.isFinite(expires) ||
    expires <= Date.now() ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^[\w-]{43,128}$/.test(token) ||
    !timingSafeEqual(Buffer.from(configured.toLowerCase()), Buffer.from(digest))
  )
    throw new Error("This private setup link is invalid or expired.");
  return { digest, email };
}

export async function inspectOwnerInvitation(token: string) {
  const invite = invitation(token);
  const sql = await getSql();
  const used =
    await sql`select digest from commerce_owner_setup_uses where digest=${invite.digest}`;
  if (used.length)
    throw new Error("This setup link has already been used. Sign in with your existing account.");
  const accounts = await sql`select id from "user" where lower(email)=${invite.email}`;
  return { email: invite.email, hasAccount: accounts.length > 0 };
}

export async function redeemOwnerInvitation(sql: Sql, userId: string, token: string) {
  const invite = invitation(token);
  return sql.transaction(async (tx) => {
    const [user] = await tx<{
      email: string;
    }>`select email from "user" where id=${userId} for share`;
    if (!user || user.email.trim().toLowerCase() !== invite.email)
      throw new Error("Sign in with the account named in this private invitation.");
    const inserted = await tx`insert into commerce_owner_setup_uses(digest,user_id)
      values(${invite.digest},${userId}) on conflict do nothing returning digest`;
    if (!inserted.length) throw new Error("This setup link has already been used.");
    const [before] =
      await tx`select role,active from merchant_staff where user_id=${userId} for update`;
    await tx`insert into merchant_staff(user_id,role,active) values(${userId},'owner',true)
      on conflict(user_id) do update set role='owner',active=true`;
    await audit(tx, userId, "staff.owner_invite_accepted", "staff", userId, before ?? null, {
      role: "owner",
      active: true,
    });
    return { userId, role: "owner" as const };
  });
}
