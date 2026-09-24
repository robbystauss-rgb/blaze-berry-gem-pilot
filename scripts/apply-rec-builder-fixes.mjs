import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "src/components/build/builder.tsx");
let source = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) {
    throw new Error(`[REC Mama Made] Could not apply builder fix: ${label}. The source changed and needs review.`);
  }
  source = source.replace(oldText, newText);
  changed = true;
}

replaceOnce(
  'import { familyHero, stageThumb } from "@/lib/stage-photos";\nimport { cn } from "@/lib/utils";',
  'import { familyHero, stageThumb } from "@/lib/stage-photos";\nimport { MASTER } from "@/lib/studio-store";\nimport { cn } from "@/lib/utils";',
  "catalog status import",
);

replaceOnce(
  'function tooLarge(size: PatchSize, placement: Placement) {',
  'function isReadyFamily(id: FamilyId) {\n  return MASTER.models.find((model) => model.id === id)?.bucket === "ready";\n}\n\nfunction tooLarge(size: PatchSize, placement: Placement) {',
  "ready-family helper",
);

replaceOnce(
  '  const shape = draft.patchShape === "Louisiana" ? "Rounded Rectangle" : draft.patchShape;\n\n  useEffect(() => {\n    if (draft.patchShape === "Louisiana") draft.set("patchShape", "Rounded Rectangle");\n  }, [draft.patchShape, draft]);\n\n  useEffect(() => {\n    if (focus) setStep(focus);',
  '  const shape: PatchShape = PATCH_SHAPES.includes(draft.patchShape as PatchShape) ? (draft.patchShape as PatchShape) : "Rounded Rectangle";\n\n  useEffect(() => {\n    if (!PATCH_SHAPES.includes(draft.patchShape as PatchShape)) draft.set("patchShape", "Rounded Rectangle");\n  }, [draft.patchShape, draft]);\n\n  useEffect(() => {\n    if (!patchOnly && !isReadyFamily(draft.family)) draft.setFamily("112");\n  }, [draft.family, patchOnly]);\n\n  useEffect(() => {\n    if (focus) setStep(focus);',
  "legacy shape normalization and incomplete-family guard",
);

replaceOnce(
  '        <p className="px-3 text-xs text-stage-muted">Heat adhesive only. Laser holes are fine. No sewing and no thread.</p>\n        {active === "hat" && (\n          <div className="flex gap-3 overflow-x-auto px-3 py-3">\n            {FAMILY_ORDER.map((id) => {',
  '        {patchOnly && (\n          <p className="px-3 text-xs text-stage-muted">Patch only means a finished loose patch — no hat and no stitching/application.</p>\n        )}\n        {active === "hat" && (\n          <div className="flex gap-3 overflow-x-auto px-3 py-3">\n            {FAMILY_ORDER.filter(isReadyFamily).map((id) => {',
  "patch-only copy and ready-family filtering",
);

replaceOnce(
  '                  <div className="grid h-24 place-items-center bg-stage px-3 text-center text-xs text-stage-muted">\n                    Image being updated\n                  </div>',
  '                  <div className="h-24 overflow-hidden bg-stage">\n                    <img src={item.texture} alt={`${item.name} material`} className="h-full w-full object-cover" />\n                  </div>',
  "real material swatches",
);

replaceOnce(
  '            <div className="grid aspect-[4/3] place-items-center bg-stage text-sm text-stage-muted">Image being updated</div>',
  '            <div className="aspect-[4/3] overflow-hidden bg-stage">\n              <img src={leather.detail} alt={`${leather.name} material detail`} className="h-full w-full object-cover" />\n            </div>',
  "real material detail",
);

if (changed) {
  fs.writeFileSync(file, source);
  console.log("[REC Mama Made] Applied verified builder asset fixes.");
} else {
  console.log("[REC Mama Made] Builder asset fixes already applied.");
}
