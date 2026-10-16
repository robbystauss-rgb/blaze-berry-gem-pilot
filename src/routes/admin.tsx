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
  "calibration",
  "gallery",
  "pricing",
  "promotions",
  "content",
] as const;
export const Route = createFileRoute("/admin")({
  validateSearch: z.object({
    section: z.enum(sections).default("overview"),
    orderId: z.string().uuid().optional(),
    query: z.string().max(200).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Owner Command Center · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CommandCenter,
});
