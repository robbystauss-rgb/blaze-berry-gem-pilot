import materialReview from "@/data/material-review.json";
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

export type LeatheretteId = string;

export type PatchShape =
  | "Rectangle"
  | "Rounded Rectangle"
  | "Circle"
  | "Oval"
  | "Hexagon"
  | "Shield"
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
    label: "Five Panel Trucker",
    short: "Richardson 112FP",
    blurb: "Five-panel trucker with 19 supplied complete photo sets in the audited catalog.",
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
    label: "7 Panel Mesh Back",
    short: "Richardson 168",
    blurb: "Seven-panel mesh-back cap with 17 recovered complete front, side, and back photo sets.",
    tier: "premium",
    kind: "solid",
    silhouette: "seven",
  },
  "256": {
    id: "256",
    label: "Umpqua Gramps Cap",
    short: "Richardson 256",
    blurb: "Richardson 256 Umpqua Gramps Cap with supplied real product photography.",
    tier: "premium",
    kind: "solid",
    silhouette: "gramps",
  },
  "112PM": {
    id: "112PM",
    label: "Printed Mesh Trucker",
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
    label: "Printed 7 Panel Mesh Back",
    short: "Richardson 168P",
    blurb: "Printed 7 Panel Mesh Back. Kept in the master catalog; product-photo assets are still incomplete.",
    tier: "premium",
    kind: "printed",
    silhouette: "seven",
  },
  "256P": {
    id: "256P",
    label: "Printed Umpqua Gramps Cap",
    short: "Richardson 256P",
    blurb: "Printed Umpqua Gramps Cap. Its color library stays separate from the solid 256.",
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
  detail: string;
}> = materialReview
  .filter((item) => item.named && item.name && item.swatch)
  .map((item) => {
    const legacyId: Record<string, string> = {
      "Matte White": "white",
      "Saddle Tan": "saddle",
      Buckskin: "buckskin",
      "Heritage Black": "heritage",
      "Duck Camo": "camo",
      "Black Carbon Fiber": "carbon",
      "Stealth Topo": "topo",
    };
    const palette: Record<string, { hex: string; hi: string; lo: string }> = {
      leatherette: { hex: "#9d7a58", hi: "#d5b38b", lo: "#5d4634" },
      camo: { hex: "#68634f", hi: "#989079", lo: "#3f3c31" },
      carbon: { hex: "#171717", hi: "#3b3b3b", lo: "#080808" },
      topo: { hex: "#5d5145", hi: "#9b846b", lo: "#2d2824" },
      metallic: { hex: "#b6b0a3", hi: "#e5dfd1", lo: "#777165" },
      acrylic: { hex: "#4d8ca8", hi: "#7fc5df", lo: "#28566c" },
      sport: { hex: "#e8e5df", hi: "#ffffff", lo: "#bdb8af" },
      specialty: { hex: "#8d8a88", hi: "#c8c5c1", lo: "#545250" },
    };
    const base = palette[item.category] ?? palette.leatherette;
    const ink = item.engrave.toLowerCase().includes("white")
      ? "#f7f4ee"
      : item.engrave.toLowerCase().includes("silver")
        ? "#d8d8d8"
        : item.engrave.toLowerCase().includes("gold")
          ? "#d7b465"
          : "#17120e";
    return {
      id: legacyId[item.name] ?? item.id,
      name: item.name,
      note: "Actual REC Mama Made material source",
      hex: base.hex,
      hi: base.hi,
      lo: base.lo,
      ink,
      engrave: item.engrave,
      texture: item.swatch,
      detail: item.detail,
    };
  });

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

export function colorsForFamily(id: FamilyId): string[] {
  const model = MASTER.models.find((item) => item.id === id);
  if (!model || model.bucket !== "ready") return [];
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
  const legacyAlias: Record<string, string> = { gold: "heritage" };
  const normalized = legacyAlias[id] ?? id;
  return LEATHERETTES.find((l) => l.id === normalized) ?? LEATHERETTES.find((l) => l.id === "buckskin") ?? LEATHERETTES[0]!;
}
