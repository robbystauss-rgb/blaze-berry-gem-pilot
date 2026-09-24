import type { FamilyId } from "@/lib/catalog";
import { MASTER, drivePhoto, workDecision, type WorkDecision } from "@/lib/studio-store";

export type StageViews = { front: string | null; side: string | null; back: string | null };

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/gray/g, "grey")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[^a-z0-9/]+/g, "")
    .trim();
}

export function stageViews(family: FamilyId, colorway: string): StageViews {
  const model = MASTER.models.find((item) => item.id === family);
  const empty = { front: null, side: null, back: null };
  if (!model) return empty;
  const needle = norm(colorway);
  const color = model.colorways.find((item) => norm(item.officialName) === needle);
  if (!color) return empty;
  return {
    front: drivePhoto(color.views.front, 1200),
    side: drivePhoto(color.views.side, 1200),
    back: drivePhoto(color.views.back, 1200),
  };
}

export function stageThumb(family: FamilyId, colorway: string) {
  const model = MASTER.models.find((item) => item.id === family);
  if (!model) return null;
  const needle = norm(colorway);
  const color = model.colorways.find((item) => norm(item.officialName) === needle);
  return drivePhoto(color?.views.front, 360);
}

export function familyHero(family: FamilyId) {
  const model = MASTER.models.find((item) => item.id === family);
  if (!model) return null;
  return drivePhoto(model.heroDriveId ?? model.colorways[0]?.views.front, 900);
}

export function galleryWork(work: Record<string, WorkDecision>) {
  return MASTER.work
    .map((item, index) => ({ item, index, decision: workDecision({ work }, item.id) }))
    .filter((entry) => !entry.decision.hidden)
    .sort(
      (a, b) =>
        Number(b.decision.featured) - Number(a.decision.featured) ||
        Number(b.decision.recent) - Number(a.decision.recent) ||
        a.index - b.index,
    );
}
