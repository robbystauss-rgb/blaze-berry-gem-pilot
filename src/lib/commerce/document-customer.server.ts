import type { Sql } from "@/lib/db";
import { assertPermission } from "./core.server";
import type { Role } from "./types";

/** A staff choice is explicit; contact resemblance never claims a historical identity. */
export async function documentCustomer(
  sql: Sql,
  id: string | null | undefined,
  body: { customerName: string; customerEmail: string },
  role: Role,
) {
  if (!id) return null;
  assertPermission(role, "customers");
  const [profile] = await sql<{
    id: string;
    name: string;
    email: string | null;
    archived: boolean;
    merged_into: string | null;
  }>`select id,name,email,archived,merged_into from commerce_customers where id=${id} for share`;
  if (!profile || profile.archived || profile.merged_into)
    throw Error("Choose an active customer profile. Refresh after an archive or reviewed merge.");
  if (!profile.email)
    throw Error(
      "This phone-only customer can have an internal phone-order draft. Add a genuine email to the profile before preparing this document.",
    );
  if (
    profile.name !== body.customerName ||
    profile.email.toLowerCase() !== body.customerEmail.toLowerCase()
  )
    throw Error(
      "The selected customer's contact details changed. Choose the customer again, or clear the association for a one-off document.",
    );
  return profile.id;
}
