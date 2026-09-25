import fs from "node:fs";
import path from "node:path";

function patchFile(relativePath, replacements) {
  const file = path.join(process.cwd(), relativePath);
  let source = fs.readFileSync(file, "utf8");
  let changed = false;

  for (const { oldText, newText, label, alreadyText } of replacements) {
    if (alreadyText && source.includes(alreadyText)) continue;
    if (newText && source.includes(newText)) continue;
    if (!newText && !source.includes(oldText)) continue;
    if (!source.includes(oldText)) {
      throw new Error(`[REC Mama Made] Could not apply fix: ${label}. ${relativePath} changed and needs review.`);
    }
    source = source.replace(oldText, newText);
    changed = true;
  }

  if (changed) fs.writeFileSync(file, source);
  return changed;
}

const builderChanged = patchFile("src/components/build/builder.tsx", [
  {
    oldText: 'import { familyHero, stageThumb } from "@/lib/stage-photos";\nimport { cn } from "@/lib/utils";',
    newText: 'import { familyHero, stageThumb } from "@/lib/stage-photos";\nimport { MASTER } from "@/lib/studio-store";\nimport { cn } from "@/lib/utils";',
    label: "catalog status import",
  },
  {
    oldText: 'function tooLarge(size: PatchSize, placement: Placement) {',
    newText: 'function isReadyFamily(id: FamilyId) {\n  return MASTER.models.find((model) => model.id === id)?.bucket === "ready";\n}\n\nfunction tooLarge(size: PatchSize, placement: Placement) {',
    label: "ready-family helper",
  },
  {
    oldText: '  const shape = draft.patchShape === "Louisiana" ? "Rounded Rectangle" : draft.patchShape;\n\n  useEffect(() => {\n    if (draft.patchShape === "Louisiana") draft.set("patchShape", "Rounded Rectangle");\n  }, [draft.patchShape, draft]);\n\n  useEffect(() => {\n    if (focus) setStep(focus);',
    newText: '  const shape: PatchShape = PATCH_SHAPES.includes(draft.patchShape as PatchShape) ? (draft.patchShape as PatchShape) : "Rounded Rectangle";\n\n  useEffect(() => {\n    if (!PATCH_SHAPES.includes(draft.patchShape as PatchShape)) draft.set("patchShape", "Rounded Rectangle");\n  }, [draft.patchShape, draft]);\n\n  useEffect(() => {\n    if (!patchOnly && !isReadyFamily(draft.family)) draft.setFamily("112");\n  }, [draft.family, patchOnly]);\n\n  useEffect(() => {\n    if (focus) setStep(focus);',
    label: "legacy shape normalization and incomplete-family guard",
    alreadyText: 'if (!PATCH_SHAPES.includes(draft.patchShape as PatchShape)) draft.set("patchShape", "Rounded Rectangle");',
  },
  {
    oldText: '        <p className="px-3 text-xs text-stage-muted">Heat adhesive only. Laser holes are fine. No sewing and no thread.</p>\n        {active === "hat" && (\n          <div className="flex gap-3 overflow-x-auto px-3 py-3">\n            {FAMILY_ORDER.map((id) => {',
    newText: '        {patchOnly && (\n          <p className="px-3 text-xs text-stage-muted">Patch only means a finished loose patch Ã¢ÂÂ no hat and no stitching/application.</p>\n        )}\n        {active === "hat" && (\n          <div className="flex gap-3 overflow-x-auto px-3 py-3">\n            {FAMILY_ORDER.filter(isReadyFamily).map((id) => {',
    label: "patch-only copy and ready-family filtering",
    alreadyText: "FAMILY_ORDER.filter(isReadyFamily).map",
  },
  {
    oldText: '                  <div className="grid h-24 place-items-center bg-stage px-3 text-center text-xs text-stage-muted">\n                    Image being updated\n                  </div>',
    newText: '                  <div className="h-24 overflow-hidden bg-stage">\n                    <img src={item.texture} alt={`${item.name} material`} className="h-full w-full object-cover" />\n                  </div>',
    label: "real material swatches",
  },
  {
    oldText: '            <div className="grid aspect-[4/3] place-items-center bg-stage text-sm text-stage-muted">Image being updated</div>',
    newText: '            <div className="aspect-[4/3] overflow-hidden bg-stage">\n              <img src={leather.detail} alt={`${leather.name} material detail`} className="h-full w-full object-cover" />\n            </div>',
    label: "real material detail",
  },
  {
    oldText: 'export function Builder({ focus }: { focus?: StepId }) {\n  const draft = useOrder();\n  const patchOnly = draft.orderType === "patch";',
    newText: 'export function Builder({\n  focus,\n  initialOrderType,\n  initialFamily,\n  initialColor,\n}: {\n  focus?: StepId;\n  initialOrderType?: "hat" | "patch";\n  initialFamily?: FamilyId;\n  initialColor?: string;\n}) {\n  const draft = useOrder();\n  const [prefillPending, setPrefillPending] = useState(() => Boolean(initialOrderType || initialFamily || initialColor));\n  const orderType = prefillPending && initialOrderType ? initialOrderType : draft.orderType;\n  const familyId = prefillPending && initialFamily ? initialFamily : draft.family;\n  const colorway = prefillPending && initialColor !== undefined ? initialColor : draft.colorway;\n  const patchOnly = orderType === "patch";',
    label: "SSR-safe builder deep-link prefill",
    alreadyText: 'const [prefillPending, setPrefillPending] = useState',
  },
  {
    oldText: '  const colorway = prefillPending && initialColor !== undefined ? initialColor : draft.colorway;',
    newText: '  const colorway = prefillPending\n    ? initialColor !== undefined\n      ? initialColor\n      : initialFamily\n        ? ""\n        : draft.colorway\n    : draft.colorway;',
    label: "clear stale color on family-only deep links",
  },
  {
    oldText: '  const family = FAMILIES[draft.family];\n  const colors = colorsForFamily(draft.family);',
    newText: '  const family = FAMILIES[familyId];\n  const colors = colorsForFamily(familyId);',
    label: "effective family for deep links",
  },
  {
    oldText: '    orderType: draft.orderType,\n    tier: draft.tier,\n    quantity: qty,\n    family: draft.family,',
    newText: '    orderType,\n    tier: family.tier,\n    quantity: qty,\n    family: familyId,',
    label: "effective pricing inputs",
    alreadyText: '    orderType,\n    tier: draft.tier,\n    quantity: qty,\n    family: familyId,',
  },
  {
    oldText: '    orderType,\n    tier: draft.tier,\n    quantity: qty,\n    family: familyId,',
    newText: '    orderType,\n    tier: family.tier,\n    quantity: qty,\n    family: familyId,',
    label: "effective family tier pricing",
  },
  {
    oldText: '  const shape: PatchShape = PATCH_SHAPES.includes(draft.patchShape as PatchShape) ? (draft.patchShape as PatchShape) : "Rounded Rectangle";\n\n  useEffect(() => {\n    if (!PATCH_SHAPES.includes(draft.patchShape as PatchShape)) draft.set("patchShape", "Rounded Rectangle");',
    newText: '  const shape: PatchShape = PATCH_SHAPES.includes(draft.patchShape as PatchShape) ? (draft.patchShape as PatchShape) : "Rounded Rectangle";\n\n  useEffect(() => {\n    if (initialFamily && draft.family !== initialFamily) draft.setFamily(initialFamily);\n    if (initialOrderType && draft.orderType !== initialOrderType) draft.set("orderType", initialOrderType);\n    if (initialColor !== undefined && draft.colorway !== initialColor) draft.set("colorway", initialColor);\n    setPrefillPending(false);\n  }, [initialColor, initialFamily, initialOrderType]);\n\n  useEffect(() => {\n    if (!PATCH_SHAPES.includes(draft.patchShape as PatchShape)) draft.set("patchShape", "Rounded Rectangle");',
    label: "hydrate deep-link prefill into order store",
  },
  {
    oldText: '    if (!patchOnly && !isReadyFamily(draft.family)) draft.setFamily("112");\n  }, [draft.family, patchOnly]);',
    newText: '    if (!patchOnly && !isReadyFamily(familyId)) draft.setFamily("112");\n  }, [familyId, patchOnly]);',
    label: "effective family guard",
  },
  {
    oldText: '    if (active !== "color" || !draft.colorway) return;\n    document.getElementById(`swatch-${draft.colorway}`)?.scrollIntoView({ inline: "center", block: "nearest" });\n  }, [active, draft.colorway]);',
    newText: '    if (active !== "color" || !colorway) return;\n    document.getElementById(`swatch-${colorway}`)?.scrollIntoView({ inline: "center", block: "nearest" });\n  }, [active, colorway]);',
    label: "effective deep-link color scroll",
  },
  {
    oldText: '        : active === "color" && !draft.colorway',
    newText: '        : active === "color" && !colorway',
    label: "effective color continue state",
  },
  {
    oldText: '      patchOnly ? "" : `Color: ${draft.colorway || "(not selected)"}`,',
    newText: '      patchOnly ? "" : `Color: ${colorway || "(not selected)"}`,',
    label: "effective color order summary",
  },
  {
    oldText: '  }, [draft, family, leather, patchOnly, qty, shape]);',
    newText: '  }, [colorway, draft, family, leather, patchOnly, qty, shape]);',
    label: "summary dependency",
  },
  {
    oldText: '            family={draft.family}\n            colorway={draft.colorway}',
    newText: '            family={familyId}\n            colorway={colorway}',
    label: "effective preview hat",
  },
  {
    oldText: '            {draft.colorway ? ` ÃÂ· ${draft.colorway}` : ""}',
    newText: '            {colorway ? ` ÃÂ· ${colorway}` : ""}',
    label: "effective builder heading color",
    alreadyText: '{patchOnly ? \"Patch only\" : `${family.id} ${family.label}${colorway ?',
  },
  {
    oldText: '            {patchOnly ? "Patch only" : `${family.id} ${family.label}`}\n            {colorway ? ` ÃÂ· ${colorway}` : ""}',
    newText: '            {patchOnly ? "Patch only" : `${family.id} ${family.label}${colorway ? ` ÃÂ· ${colorway}` : ""}`}',
    label: "remove hat color from patch-only heading",

    alreadyText: '{patchOnly ? \"Patch only\" : `${family.id} ${family.label}${colorway ?',  },
  {
    oldText: '              const on = draft.family === id;',
    newText: '              const on = familyId === id;',
    label: "effective selected family",
  },
  {
    oldText: '                const thumb = stageThumb(draft.family, name);\n                const on = draft.colorway === name;',
    newText: '                const thumb = stageThumb(familyId, name);\n                const on = colorway === name;',
    label: "effective family and color thumbnails",
  },
  {
    oldText: 'value={patchOnly ? "Loose patch" : `${family.label}${draft.colorway ? ` ÃÂ· ${draft.colorway}` : ""}`}',
    newText: 'value={patchOnly ? "Loose patch" : `${family.label}${colorway ? ` ÃÂ· ${colorway}` : ""}`}',
    label: "effective review color",

    alreadyText: 'value={patchOnly ? "Loose patch" : `${family.label}${colorway ?',  },
  {
    oldText: '{patchOnly ? "Patch only" : draft.tier === "premium" ? "Premium hat + patch" : "Standard hat + patch"} ÃÂ· ${est.unit} each',
    newText: '{patchOnly ? "Patch only" : family.tier === "premium" ? "Premium hat + patch" : "Standard hat + patch"} ÃÂ· ${est.unit} each',
    label: "effective family tier review copy",

    alreadyText: 'family.tier === "premium"',  },
  {
    oldText: 'stageThumb(draft.family, draft.colorway) ?? familyHero(draft.family)',
    newText: 'stageThumb(familyId, colorway) ?? familyHero(familyId)',
    label: "effective mobile summary image",

    alreadyText: 'stageThumb(familyId, colorway) ?? familyHero(familyId)',  },
  {
    oldText: '<p className="text-sm">{draft.colorway || "Color not chosen"}</p>',
    newText: '<p className="text-sm">{colorway || "Color not chosen"}</p>',
    label: "effective mobile summary color",

    alreadyText: '{colorway || "Color not chosen"}',  },
]);

const orderChanged = patchFile("src/routes/order.tsx", [
  {
    oldText: '    family: typeof search.family === "string" ? search.family : undefined,',
    newText: '    family: typeof search.family === "string" || typeof search.family === "number" ? String(search.family) : undefined,',
    label: "preserve numeric Richardson family IDs in search",
  },
  {
    oldText: 'import { useEffect } from "react";\n',
    newText: '',
    label: "remove effect-only deep-link import",
  },
  {
    oldText: 'import { useOrder } from "@/lib/order-store";\n',
    newText: '',
    label: "remove render-after-load order store mutation",
  },
  {
    oldText: 'function OrderPage() {\n  const search = Route.useSearch();\n  useEffect(() => {\n    if (search.family && isFamily(search.family)) {\n      useOrder.getState().setFamily(search.family);\n      useOrder.getState().set("orderType", "hat");\n    }\n    if (search.type === "patch") useOrder.getState().set("orderType", "patch");\n    if (search.type === "hat") useOrder.getState().set("orderType", "hat");\n    if (search.color) useOrder.getState().set("colorway", search.color);\n  }, [search.family, search.color, search.type]);\n  return <Builder focus={search.color ? "material" : search.family ? "color" : undefined} />;\n}',
    newText: 'function OrderPage() {\n  const search = Route.useSearch();\n  const initialFamily = search.family && isFamily(search.family) ? search.family : undefined;\n  return (\n    <Builder\n      initialOrderType={search.type}\n      initialFamily={initialFamily}\n      initialColor={search.color}\n      focus={search.color ? "material" : initialFamily ? "color" : undefined}\n    />\n  );\n}',
    label: "SSR-safe order deep links",
    alreadyText: 'const patchOnly = search.type === "patch";',
  },
]);

const homeChanged = patchFile("src/routes/index.tsx", [
  {
    oldText: 'The material photos are in Studio for a visual check. They are not on the builder until you approve each one.',
    newText: 'The staging builder uses the 31 named swatches from My leatherette options.PNG. Two unnamed source cards stay excluded until they can be identified.',
    label: "accurate staging material copy",
    alreadyText: "The staging builder uses the 31 named swatches",
  },
]);

const studioChanged = patchFile("src/routes/studio.tsx", [
  {
    oldText: 'The public builder is a live showroom, still using the current color lists. Nothing here is offered until you set a model to Active and a color to Offered, then approve that preview. Publish to the live shop stays off.',
    newText: 'The staging builder uses the 31 named material swatches from the approved source sheet and keeps the two unnamed cards out. This Studio panel is for visual QA and catalog review; publishing to the live shop stays off.',
    label: "accurate Studio staging copy",
  },
]);

const changed = builderChanged || orderChanged || homeChanged || studioChanged;
console.log(
  changed
    ? "[REC Mama Made] Applied verified asset, deep-link, and staging-copy fixes."
    : "[REC Mama Made] Verified fixes already applied.",
);
