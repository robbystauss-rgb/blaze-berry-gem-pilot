import type { FamilyId } from "./catalog";

export type ParsedColors = {
  front: string;
  visor: string;
  mesh: string;
  rope: string;
  isCamo: boolean;
  parts: string[];
};

const HEX: Record<string, string> = {
  white: "#F3EFE6",
  black: "#1A1816",
  navy: "#1A2744",
  "midnight navy": "#121A30",
  khaki: "#C6B48A",
  "pale khaki": "#D7C7A2",
  coffee: "#4C3428",
  charcoal: "#4A4C4F",
  "heather grey": "#A7ADB3",
  "light grey": "#C8CBCF",
  grey: "#8E9398",
  gray: "#8E9398",
  silver: "#C5C8CC",
  royal: "#2C4FA0",
  red: "#B31F24",
  cardinal: "#7A1E2C",
  maroon: "#6A2432",
  burgundy: "#6A2432",
  "dark green": "#2F4A32",
  loden: "#5C6848",
  "loden green": "#5C6848",
  "army olive": "#556246",
  kelly: "#1F7A45",
  "columbia blue": "#6BA3C8",
  "light blue": "#9EC4D8",
  "smoke blue": "#7E93A3",
  "dusty blue": "#7F98A8",
  "true blue": "#2A5F9E",
  "legion blue": "#3A5A7A",
  cyan: "#3AA0B8",
  "neon blue": "#3D8CFF",
  orange: "#D35A1F",
  "dark orange": "#B84412",
  "burnt orange": "#C45A22",
  "dk. orange": "#B84412",
  "amber gold": "#C8963A",
  gold: "#C4A04A",
  "vegas gold": "#C6B25A",
  "old gold": "#B39A4A",
  yellow: "#E2C84A",
  "neon yellow": "#D6E034",
  "neon green": "#7BE04A",
  "neon orange": "#FF6A1A",
  "neon pink": "#FF5AA5",
  "hot pink": "#E24B86",
  purple: "#5A3A8A",
  cream: "#E9DCC6",
  birch: "#DDD3C0",
  caramel: "#B07A45",
  brown: "#6A4632",
  "chocolate chip": "#5A3E30",
  "dark mocha": "#4A3228",
  "mink beige": "#C4B09A",
  biscuit: "#D2B48C",
  quarry: "#8A8680",
  "pale peach": "#E8C4B0",
  sage: "#8FA084",
  "sand dune": "#C8B898",
  "dusty red": "#A85A5A",
  aluminum: "#B8BCC0",
  blaze: "#FF5A1A",
  buck: "#A67C52",
  "light tan": "#D4C4A8",
  sandstone: "#C4B090",
  "ice grey": "#C5C9CC",
  "light brown": "#A07850",
  "light green": "#8FB56A",
  camo: "#5C6848",
  "green camo": "#4A5C3A",
  "desert camo": "#C4A878",
  "grey camo": "#6A7068",
  "digital camo": "#6A7A5A",
  "stars & stripes": "#2A3A6A",
  "black-white fade": "#6A6A6C",
  "navy-white fade": "#6A7A9A",
  "mossy oak": "#4A5638",
  "mossy oak bottomland": "#4A4028",
  "mossy oak country dna": "#5A4A32",
  "mossy oak dna": "#5A4A32",
  realtree: "#5A4A32",
  "realtree edge": "#5C4A32",
  "realtree original": "#4A5630",
  "realtree max-7": "#6A5A38",
  "realtree max-1 xt": "#6A5A38",
  "realtree timber": "#3A3A28",
  "realtree excape": "#4A4A32",
  "realtree advantage classic": "#5A6840",
  "realtree fishing light blue": "#7AA8C0",
  kryptek: "#4A4A3A",
  "kryptek highlander": "#6A5A38",
  "kryptek pontus": "#3A5A6A",
  "kryptek typhon": "#2A2A28",
  "kryptek inferno": "#8A3A1A",
  "kryptek neptune": "#2A4A5A",
  "bark duck camo": "#5A4028",
  "harvest duck camo": "#A07840",
  "marsh duck camo": "#5A6848",
  "saltwater duck camo": "#4A5A58",
  "blizzard duck camo": "#C8D0D4",
  "sable duck camo": "#2A2420",
  "blaze duck camo": "#E85A18",
  "admiral duck camo": "#2A3A48",
  "sienna duck camo": "#8A5A32",
  "mossy oak elements bonefish": "#C8C0B0",
  "mossy oak habitat": "#5A4A32",
  "mossy oak elements blacktip": "#3A3A38",
};

const KEYS = Object.keys(HEX).sort((a, b) => b.length - a.length);

function lookup(raw: string): string | null {
  const n = raw.toLowerCase().trim();
  if (!n) return null;
  if (HEX[n]) return HEX[n];
  for (const key of KEYS) {
    if (n.includes(key)) return HEX[key];
  }
  return null;
}

function splitParts(name: string): string[] {
  return name
    .split("/")
    .map((p) => p.replace(/\[[^\]]*\]/g, "").trim())
    .filter(Boolean);
}

export function parseColorway(name: string): ParsedColors {
  const parts = splitParts(name || "Black");
  const hexes = parts.map((p) => lookup(p) ?? "#6A5A4A");
  const front = hexes[0] ?? "#1A1816";
  const visor = hexes[1] ?? front;
  const mesh = hexes[2] ?? hexes[1] ?? darken(front, 0.18);
  const joined = name.toLowerCase();
  const isCamo = /camo|realtree|kryptek|mossy|duck|fade|stars/.test(joined);
  return {
    front,
    visor: hexes.length === 1 ? darken(front, 0.08) : visor,
    mesh: hexes.length === 1 ? darken(front, 0.22) : mesh,
    rope: lighten(front, 0.35),
    isCamo,
    parts,
  };
}

export function darken(hex: string, amt: number) {
  return mix(hex, "#000000", amt);
}
export function lighten(hex: string, amt: number) {
  return mix(hex, "#ffffff", amt);
}

function mix(a: string, b: string, t: number) {
  const pa = toRgb(a);
  const pb = toRgb(b);
  const m = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${m(0)} ${m(1)} ${m(2)})`;
}

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  if (h.length >= 6 && hex.startsWith("#")) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  const m = hex.match(/rgb\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [80, 60, 50];
}

const DEDICATED: Array<{ test: (f: FamilyId, n: string) => boolean; src: string }> = [
  { test: (f, n) => f.startsWith("112") && /hot pink/.test(n), src: "/products/hat-112-pink-black.jpg" },
  { test: (f, n) => f.startsWith("112") && /khaki/.test(n) && /coffee/.test(n), src: "/products/hat-112-khaki-coffee.jpg" },
  { test: (f, n) => f.startsWith("112") && /navy/.test(n) && /white/.test(n), src: "/products/hat-112-navy-white.jpg" },
  { test: (f, n) => f.startsWith("112") && /^cream$|^white$/.test(n), src: "/products/hat-112-cream.jpg" },
  { test: (f, n) => f.startsWith("112") && /^charcoal$/.test(n), src: "/products/hat-112-charcoal.jpg" },
  { test: (f, n) => f.startsWith("112") && /^(loden|dark green|kelly)$/.test(n), src: "/products/hat-112-loden.jpg" },
  { test: (f, n) => f.startsWith("112") && /^black$/.test(n), src: "/products/hat-112-black.jpg" },
  { test: (f, n) => f.startsWith("168") && /brown/.test(n) && /khaki/.test(n), src: "/products/hat-168-brown-khaki.jpg" },
  { test: (f, n) => f.startsWith("168") && /^black$/.test(n), src: "/products/hat-168-black.jpg" },
  { test: (f, n) => f.startsWith("256") && /sage/.test(n), src: "/products/hat-256-sage-white.jpg" },
  { test: (f, n) => f.startsWith("256") && /black/.test(n) && /white/.test(n), src: "/products/hat-256-black-white.jpg" },
  { test: (_f, n) => /camo|realtree|kryptek|mossy|duck/.test(n), src: "/products/hat-camo.jpg" },
];

export function dedicatedPhoto(family: FamilyId, colorway: string): string | null {
  const n = colorway.toLowerCase().trim();
  for (const rule of DEDICATED) {
    if (rule.test(family, n)) return rule.src;
  }
  return null;
}

export function photoFor(family: FamilyId, colorway: string): string {
  return (
    dedicatedPhoto(family, colorway) ??
    (family.startsWith("256")
      ? "/products/hat-256-black-white.jpg"
      : family.startsWith("168")
        ? "/products/hat-168-black.jpg"
        : "/products/hat-112-black.jpg")
  );
}

export const FEATURED_PHOTOS = [
  { src: "/products/hat-patch-black-tan.jpg", label: "Black 112 · tan leatherette", family: "112" as FamilyId, color: "Black" },
  { src: "/products/hat-patch-cream-rosegold.jpg", label: "Cream 112 · rose gold patch", family: "112" as FamilyId, color: "Cream" },
  { src: "/products/hat-patch-navy-brown.jpg", label: "Navy 112 · cognac patch", family: "112" as FamilyId, color: "Navy" },
  { src: "/products/hat-112-khaki-coffee.jpg", label: "112 Khaki / Coffee", family: "112" as FamilyId, color: "Khaki/Coffee" },
  { src: "/products/hat-256-black-white.jpg", label: "256 Black / White", family: "256" as FamilyId, color: "Black/White" },
  { src: "/products/hat-camo.jpg", label: "Printed camo five-panel", family: "112PFP" as FamilyId, color: "Realtree Edge/Brown" },
];
