import type {
  FamilyId,
  OrderType,
  LeatheretteId,
  PatchShape,
  PatchSize,
  Placement,
} from "@/lib/catalog";
import type { CrownPosition } from "@/lib/crown-geometry";
export type ReorderSettings = {
  orderType: OrderType;
  family: FamilyId;
  colorway: string;
  leatherette: LeatheretteId;
  patchShape: PatchShape;
  patchSize: PatchSize;
  placement: Placement;
  quantity: number;
  patchText: string;
  patchPosition?: CrownPosition;
};
export type ReorderLine = { id: string; title: string; quantity: number; supported: boolean };
export type ReorderIntent = {
  settings: ReorderSettings;
  quote: { unitCents: number; totalCents: number; discountCents: number; discountLabel: string };
  notice: string;
};
