import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CommandCenter } from "@/components/admin/command-center";
export const sections = [
  "overview",
  "orders",
  "payments",
  "production",
  "inventory",
  "products",
  "customers",
  "website",
  "activity",
  "notifications",
  "reports",
  "staff",
  "security",
] as const;
export const Route = createFileRoute("/admin")({
  validateSearch: z.object({
    section: z.enum(sections).default("overview"),
    orderId: z.string().uuid().optional(),
  }),
  head: () => ({
    meta: [
      { title: "Owner Command Center · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CommandCenter,
});
