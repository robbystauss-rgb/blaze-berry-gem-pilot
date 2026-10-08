import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSessionUser } from "@/lib/auth/verify.server";
import { readSessionToken } from "@/lib/auth/server";
import { getSql, type Sql } from "@/lib/db";
import { audit, assertPermission } from "./core.server";
import type { Permission, Role } from "./types";

export function sessionHash(bearer?: string) {
  const material = bearer || readSessionToken();
  if (!material) throw new Error("A verified session is required.");
  return createHash("sha256").update(material).digest("hex");
}
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
  const sql = await getSql();
  const [mfa] = await sql<{
    enabled: boolean;
  }>`select enabled from commerce_mfa where user_id=${userId}`;
  const required = process.env.ADMIN_REQUIRE_MFA === "true" || mfa?.enabled;
  if (required) {
    const proof =
      await sql`select session_hash from commerce_mfa_sessions where user_id=${userId} and session_hash=${sessionHash(bearer)} and expires_at>now()`;
    if (!proof.length) throw new Error("MFA required: verify your authenticator in Security.");
  }
  return actor;
}
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer) {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}
export function totp(secret: string, counter: number) {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const c of secret) {
    value = (value << 5) | BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(message).digest();
  const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
function key() {
  const value = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value))
    throw new Error("MFA encryption key is not configured.");
  return Buffer.from(value, "hex");
}
export function encrypt(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function decrypt(value: string) {
  const raw = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString();
}
export async function enrollMfa(sql: Sql, userId: string) {
  const [current] = await sql<{
    enabled: boolean;
  }>`select enabled from commerce_mfa where user_id=${userId} for update`;
  if (current?.enabled) throw new Error("MFA is already enrolled.");
  const secret = base32(randomBytes(20));
  await sql`insert into commerce_mfa(user_id,secret_encrypted) values(${userId},${encrypt(secret)}) on conflict(user_id) do update set secret_encrypted=excluded.secret_encrypted`;
  await audit(sql, userId, "security.mfa_enrollment_started", "staff", userId);
  return {
    secret,
    uri: `otpauth://totp/REC%20Mama%20Made:${encodeURIComponent(userId)}?secret=${secret}&issuer=REC%20Mama%20Made`,
  };
}
export async function verifyMfa(sql: Sql, userId: string, code: string, hash: string) {
  // Return failures, rather than throw within the transaction: rate-limit counters must commit.
  const [row] = await sql<{
    secret_encrypted: string;
    last_counter: number;
    blocked_until: string | null;
    failures: number;
  }>`select * from commerce_mfa where user_id=${userId} for update`;
  if (!row) throw new Error("Enroll an authenticator first.");
  if (row.blocked_until && new Date(row.blocked_until) > new Date()) return false;
  const current = Math.floor(Date.now() / 30000);
  let matched = -1;
  for (let c = current - 1; c <= current + 1; c++) {
    const expected = totp(decrypt(row.secret_encrypted), c);
    if (
      /^\d{6}$/.test(code) &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(code)) &&
      c > Number(row.last_counter)
    )
      matched = c;
  }
  if (matched < 0) {
    await sql`update commerce_mfa set failures=failures+1,blocked_until=case when failures>=4 then now()+interval '5 minutes' else blocked_until end where user_id=${userId}`;
    return false;
  }
  await sql`update commerce_mfa set enabled=true,last_counter=${matched},failures=0,blocked_until=null where user_id=${userId}`;
  await sql`insert into commerce_mfa_sessions(session_hash,user_id,expires_at) values(${hash},${userId},now()+interval '4 hours') on conflict(session_hash) do update set expires_at=excluded.expires_at`;
  await audit(sql, userId, "security.mfa_verified", "staff", userId);
  return true;
}
