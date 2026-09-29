import type { FamilyId } from "@/lib/catalog";

export type HatCollectionId = "112" | "seven-panel" | "gramps";

export type HatModelPath =
  | "/112"
  | "/112fp"
  | "/112fpr"
  | "/112p"
  | "/112pm"
  | "/112pfp"
  | "/168"
  | "/168p"
  | "/256"
  | "/256p";

export const HAT_MODEL_PATHS: Record<FamilyId, HatModelPath> = {
  "112": "/112",
  "112FP": "/112fp",
  "112FPR": "/112fpr",
  "112P": "/112p",
  "112PM": "/112pm",
  "112PFP": "/112pfp",
  "168": "/168",
  "168P": "/168p",
  "256": "/256",
  "256P": "/256p",
};

export const HAT_MODEL_LABELS: Record<FamilyId, string> = {
  "112": "Trucker",
  "112FP": "Five Panel Trucker",
  "112FPR": "Five Panel Trucker with Rope",
  "112P": "Printed Trucker",
  "112PM": "Printed Mesh Trucker",
  "112PFP": "Printed Five Panel Trucker",
  "168": "7 Panel Mesh Back",
  "168P": "Printed 7 Panel Mesh Back",
  "256": "Umpqua Gramps Cap",
  "256P": "Printed Umpqua Gramps Cap",
};

export const HAT_MODEL_BLURBS: Record<FamilyId, string> = {
  "112": "Classic six-panel mesh-back trucker. Its supplied photos and colorways stay with model 112 only.",
  "112FP": "Five-panel trucker. Its supplied photos and colorways stay separate from every other 112 variant.",
  "112FPR": "Five-panel trucker with rope. Only verified supplied angles are shown; missing views are never substituted.",
  "112P": "Printed trucker in camo and pattern colorways, using only the supplied 112P photo library.",
  "112PM": "Printed mesh trucker. It stays visible as a distinct model and is not populated with another model's photos.",
  "112PFP": "Printed five-panel trucker with its own supplied color library, separate from 112P and 112FP.",
  "168": "Seven-panel mesh-back cap. Only verified 168 product assets belong to this model.",
  "168P": "Printed seven-panel mesh-back cap. Printed 168P assets remain separate from the standard 168.",
  "256": "Umpqua Gramps Cap. The standard 256 keeps its own color library and never borrows from 256P.",
  "256P": "Printed Umpqua Gramps Cap. The printed 256P stays separate from the solid 256.",
};

export const HAT_COLLECTIONS: Array<{
  id: HatCollectionId;
  label: string;
  description: string;
  modelIds: FamilyId[];
}> = [
  {
    id: "112",
    label: "112 Trucker Collection",
    description: "The 112-based trucker models stay separated by exact model number, including five-panel, rope, printed, and mesh variants.",
    modelIds: ["112", "112FP", "112FPR", "112P", "112PM", "112PFP"],
  },
  {
    id: "seven-panel",
    label: "7 Panel",
    description: "The standard 168 and printed 168P keep their own photos and color libraries.",
    modelIds: ["168", "168P"],
  },
  {
    id: "gramps",
    label: "Gramps",
    description: "The 256 Umpqua Gramps Cap and 256P Printed Umpqua Gramps Cap are related Gramps models, but their photos and colors never mix.",
    modelIds: ["256", "256P"],
  },
];

export function hatModelPath(id: FamilyId): HatModelPath {
  return HAT_MODEL_PATHS[id];
}
