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
