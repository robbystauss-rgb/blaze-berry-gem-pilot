import { z } from "zod";
import { getSql } from "@/lib/db";
import { assertPermission, audit } from "./core.server";
import type { Role } from "./types";
type Actor = { userId: string; role: Role };
export type OwnerTask = {
  id: string;
  title: string;
  details: string;
  due_date: string | null;
  priority: "low" | "normal" | "high";
  state: "open" | "done" | "archived";
  version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const parsed = new Date(v + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, "Enter a real calendar date.");
export const ownerTaskSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().min(0),
  title: z.string().trim().min(3).max(180),
  details: z.string().trim().max(2000),
  dueDate: date.nullable(),
  priority: z.enum(["low", "normal", "high"]),
  state: z.enum(["open", "done", "archived"]),
});
export async function ownerTasks(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "website");
  const p = z
    .object({
      state: z.enum(["open", "done", "archived", "all"]).default("open"),
      search: z.string().trim().max(100).default(""),
    })
    .parse(raw);
  const sql = await getSql();
  const [summary] = await sql<{
    open: number;
    overdue: number;
    done: number;
    archived: number;
  }>`select count(*) filter(where state='open')::int as open,count(*) filter(where state='open' and due_date<(now() at time zone 'America/Chicago')::date)::int as overdue,count(*) filter(where state='done')::int as done,count(*) filter(where state='archived')::int as archived from commerce_owner_tasks`;
  const tasks =
    await sql<OwnerTask>`select * from commerce_owner_tasks where (${p.state}='all' or state=${p.state}) and (title ilike ${"%" + p.search + "%"} or details ilike ${"%" + p.search + "%"}) order by case state when 'open' then 0 when 'done' then 1 else 2 end,case priority when 'high' then 0 when 'normal' then 1 else 2 end,due_date nulls last,updated_at desc limit 200`;
  return { summary, tasks };
}
export async function saveOwnerTask(raw: unknown, actor: Actor) {
  assertPermission(actor.role, "website");
  const p = ownerTaskSchema.parse(raw),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"owner-task:" + p.id}))`;
    const [before] =
      await tx<OwnerTask>`select * from commerce_owner_tasks where id=${p.id} for update`;
    if ((before?.version ?? 0) !== p.version)
      throw Error("This task changed. Refresh and review before saving.");
    if (!before && p.state !== "open")
      throw Error("Create a new task as Open before completing or archiving it.");
    const [saved] =
      await tx<OwnerTask>`insert into commerce_owner_tasks(id,title,details,due_date,priority,state,created_by,updated_by) values(${p.id},${p.title},${p.details},${p.dueDate},${p.priority},${p.state},${actor.userId},${actor.userId}) on conflict(id) do update set title=excluded.title,details=excluded.details,due_date=excluded.due_date,priority=excluded.priority,state=excluded.state,version=commerce_owner_tasks.version+1,updated_by=excluded.updated_by,updated_at=now(),completed_at=case when excluded.state='done' then coalesce(commerce_owner_tasks.completed_at,now()) when excluded.state='open' then null else commerce_owner_tasks.completed_at end returning *`;
    await audit(
      tx,
      actor.userId,
      "owner_task." + (!before ? "created" : p.state !== before.state ? p.state : "edited"),
      "owner_task",
      p.id,
      before ?? null,
      saved,
    );
    return saved;
  });
}

export async function ownerDashboardInsights(actor: Actor) {
  assertPermission(actor.role, "website");
  const sql = await getSql();
  const [promotions, uploads] = await Promise.all([
    sql<{
      id: string;
      code: string;
      campaign: string;
      starts_at: string | null;
      ends_at: string | null;
      upcoming: boolean;
    }>`select id,code,definition->>'campaign' as campaign,definition->>'startsAt' as starts_at,definition->>'endsAt' as ends_at,(nullif(definition->>'startsAt','')::timestamptz>now()) as upcoming from commerce_promotions where state='active' and (nullif(definition->>'endsAt','') is null or (definition->>'endsAt')::timestamptz>now()) and ((nullif(definition->>'startsAt','')::timestamptz>now() and (definition->>'startsAt')::timestamptz<now()+interval '30 days') or (nullif(definition->>'endsAt','')::timestamptz>now() and (definition->>'endsAt')::timestamptz<now()+interval '30 days')) order by coalesce(nullif(definition->>'startsAt','')::timestamptz,nullif(definition->>'endsAt','')::timestamptz) limit 8`,
    sql<{
      id: string;
      name: string;
      alt: string;
      created_at: string;
    }>`select id,name,alt,created_at from commerce_media where not archived order by created_at desc limit 6`,
  ]);
  return { promotions, uploads };
}
