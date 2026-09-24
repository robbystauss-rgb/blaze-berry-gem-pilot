import data from "./catalog-data.json";
import { MASTER } from "@/lib/studio-store";

export type ColorCategory = "Solid" | "Split" | "Combo" | "Tri" | "Alternate" | "Printed";

export type Colorway = {
  category: string;
  name: string;
};

export type FamilyId =
  | "112"
  | "112FP"
  | "112FPR"
  | "168"
  | "256"
  | "112PM"
  | "112P"
  | "112PFP"
  | "168P"
  | "256P";

export type LeatheretteId =
  | "buckskin"
  | "heritage"
  | "saddle"
  | "carbon"
  | "gold"
  | "white"
  | "camo"
  | "topo";

export type PatchShape =
  | "Rectangle"
  | "Rounded Rectangle"
  | "Circle"
  | "Oval"
  | "Hexagon"
  | "Shield"
  | "Louisiana"
  | "Custom Die-Cut";

export type PatchSize = "small" | "medium" | "large";
export type Placement = "front-center" | "left-front" | "right-front" | "side" | "rear";
export type OrderType = "hat" | "patch";
export type HatTier = "standard" | "premium";

export const ETSY_LISTING = "https://www.etsy.com/listing/4435836820";
export const ETSY_SHOP = "https://www.etsy.com/shop/RECMamaMade";

export const PRICING = {
  standard: 30,
  premium: 35,
  patch: 5,
} as const;

export const FAMILIES: Record<
  FamilyId,
  {
    id: FamilyId;
    label: string;
    short: string;
    blurb: string;
    tier: HatTier;
    kind: "solid" | "printed";
    silhouette: "trucker" | "seven" | "gramps";
  }
> = {
  "112": {
    id: "112",
    label: "Trucker",
    short: "Richardson 112",
    blurb: "Six-panel mesh-back trucker. The widest color range in the shop.",
    tier: "standard",
    kind: "solid",
    silhouette: "trucker",
  },
  "112FP": {
    id: "112FP",
    label: "Five-Panel Trucker",
    short: "Richardson 112FP",
    blurb: "Five-panel trucker. The family is real. Colorways stay held until the front files are named.",
    tier: "premium",
    kind: "solid",
    silhouette: "gramps",
  },
  "112FPR": {
    id: "112FPR",
    label: "Five Panel Trucker with Rope",
    short: "Richardson 112FPR",
    blurb: "Five-panel trucker with a rope on the bill. Ten front photos. No side or back files in the library.",
    tier: "premium",
    kind: "solid",
    silhouette: "gramps",
  },
  "168": {
    id: "168",
    label: "Seven Panel Trucker Cap",
    short: "Richardson 168",
    blurb: "Seven-panel trucker. The color library is not in Drive yet.",
    tier: "premium",
    kind: "solid",
    silhouette: "seven",
  },
  "256": {
    id: "256",
    label: "Umpqua",
    short: "Richardson 256",
    blurb: "Five-panel rope cap. Model number 256. Gramps is a nickname, not the model name.",
    tier: "premium",
    kind: "solid",
    silhouette: "gramps",
  },
  "112PM": {
    id: "112PM",
    label: "Printed Mesh",
    short: "Richardson 112PM",
    blurb: "Printed mesh trucker. No dedicated photo folder yet, so no extra colors were added.",
    tier: "premium",
    kind: "printed",
    silhouette: "trucker",
  },
  "112P": {
    id: "112P",
    label: "Printed Trucker",
    short: "Richardson 112P",
    blurb: "Printed trucker in camo and pattern colorways.",
    tier: "premium",
    kind: "printed",
    silhouette: "trucker",
  },
  "112PFP": {
    id: "112PFP",
    label: "Printed Five Panel Trucker",
    short: "Richardson 112PFP",
    blurb: "Printed five-panel trucker.",
    tier: "premium",
    kind: "printed",
    silhouette: "gramps",
  },
  "168P": {
    id: "168P",
    label: "Printed Seven Panel",
    short: "Richardson 168P",
    blurb: "Printed seven-panel. No printed color folder yet.",
    tier: "premium",
    kind: "printed",
    silhouette: "seven",
  },
  "256P": {
    id: "256P",
    label: "Printed Umpqua",
    short: "Richardson 256P",
    blurb: "Printed five-panel Umpqua. Not the solid 256 colors.",
    tier: "premium",
    kind: "printed",
    silhouette: "gramps",
  },
};

export const FAMILY_ORDER: FamilyId[] = [
  "112",
  "112FP",
  "112FPR",
  "112P",
  "112PM",
  "112PFP",
  "168",
  "168P",
  "256",
  "256P",
];

export const LEATHERETTES: Array<{
  id: LeatheretteId;
  name: string;
  note: string;
  hex: string;
  hi: string;
  lo: string;
  ink: string;
  engrave: string;
  texture: string;
}> = [
  { id: "buckskin", name: "Buckskin", note: "Shop sheet", hex: "#C4A06A", hi: "#E4C48A", lo: "#8A6840", ink: "#1C140C", engrave: "Engraves black", texture: "" },
  { id: "heritage", name: "Heritage Black", note: "Gold core", hex: "#1A120C", hi: "#3A2A1C", lo: "#0C0806", ink: "#C6A15A", engrave: "Engraves gold", texture: "" },
  { id: "saddle", name: "Saddle Tan", note: "Shop sheet", hex: "#A87848", hi: "#D0A070", lo: "#6A4828", ink: "#1C140C", engrave: "Engraves black", texture: "" },
  { id: "carbon", name: "Black Carbon Fiber", note: "Silver core", hex: "#161616", hi: "#3A3A3A", lo: "#080808", ink: "#D8D8D8", engrave: "Engraves silver", texture: "" },
  { id: "gold", name: "Black / Gold", note: "Metallic", hex: "#1A140C", hi: "#4A3A22", lo: "#0C0A08", ink: "#E0C070", engrave: "Engraves gold", texture: "" },
  { id: "white", name: "Matte White", note: "Black core", hex: "#F4F1EC", hi: "#FFFFFF", lo: "#D4D0C8", ink: "#1C140C", engrave: "Engraves black", texture: "" },
  { id: "camo", name: "Duck Camo", note: "Shop sheet", hex: "#6A6840", hi: "#8A8860", lo: "#3A3820", ink: "#1C140C", engrave: "Engraves black", texture: "" },
  { id: "topo", name: "Stealth Topo", note: "Shop sheet", hex: "#2A2A2A", hi: "#4A4A4A", lo: "#141414", ink: "#F4F1EC", engrave: "Engraves white", texture: "" },
];

export const PATCH_SHAPES: PatchShape[] = [
  "Rectangle",
  "Rounded Rectangle",
  "Circle",
  "Oval",
  "Hexagon",
  "Shield",
  "Custom Die-Cut",
];

export const PLACEMENTS: Array<{ id: Placement; label: string; hint: string }> = [
  { id: "front-center", label: "Front Center", hint: "Most popular" },
  { id: "left-front", label: "Left Front", hint: "Left panel" },
  { id: "right-front", label: "Right Front", hint: "Right panel" },
  { id: "side", label: "Side", hint: "Side panel" },
  { id: "rear", label: "Rear", hint: "Back of hat" },
];

export const COLOR_112: Colorway[] = data.color112;
export const COLOR_168: string[] = data.collection168;
export const COLOR_256: string[] = data.collection256;
export const PRINTED = data.printed as Record<string, string[]>;

export function colorsForFamily(id: FamilyId): string[] {
  const model = MASTER.models.find((item) => item.id === id);
  if (!model || model.bucket !== "ready") return [];
  if (id === "112FP") return [];
  return model.colorways.filter((color) => color.views.front).map((color) => color.officialName);
}

export function colorwaysForFamily(id: FamilyId): Colorway[] {
  return colorsForFamily(id).map((name) => {
    const parts = name.split("/").length;
    const category = FAMILIES[id].kind === "printed" ? "Printed" : parts >= 3 ? "Tri" : parts === 2 ? "Split" : "Solid";
    return { category, name };
  });
}

export function bonusHats(qty: number) {
  return Math.floor(Math.max(qty, 0) / 12);
}

export function estimateTotal(opts: {
  orderType: OrderType;
  tier: HatTier;
  quantity: number;
  family?: FamilyId;
  promo?: string;
}) {
  const purchased = Math.max(1, Math.floor(opts.quantity) || 1);
  if (opts.orderType === "patch") {
    return {
      unit: PRICING.patch,
      purchased,
      bonus: 0,
      fulfilled: purchased,
      total: purchased * PRICING.patch,
      zaddy: false,
    };
  }
  const zaddy = opts.promo?.trim().toUpperCase() === "ZADDY" && opts.family === "112" && opts.tier === "standard";
  const unit = zaddy ? 25 : opts.tier === "premium" ? PRICING.premium : PRICING.standard;
  const bonus = bonusHats(purchased);
  return {
    unit,
    purchased,
    bonus,
    fulfilled: purchased + bonus,
    total: purchased * unit,
    zaddy,
  };
}

export function getLeatherette(id: string) {
  return LEATHERETTES.find((l) => l.id === id) ?? LEATHERETTES[0]!;
}
