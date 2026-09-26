import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "src/components/build/builder.tsx");
let source = fs.readFileSync(file, "utf8");
let changed = false;

function replaceOnce(oldText, newText, label) {
  if (source.includes(newText)) return;
  if (!source.includes(oldText)) {
    throw new Error(`[REC Mama Made] Could not apply QA fix: ${label}. Builder source changed and needs review.`);
  }
  source = source.replace(oldText, newText);
  changed = true;
}

replaceOnce(
  '  const colorway = prefillPending && initialColor !== undefined ? initialColor : draft.colorway;',
  '  const colorway = prefillPending\n    ? initialColor !== undefined\n      ? initialColor\n      : initialFamily\n        ? ""\n        : draft.colorway\n    : draft.colorway;',
  "clear stale color on family-only deep links",
);

replaceOnce(
  '    orderType,\n    tier: draft.tier,\n    quantity: qty,\n    family: familyId,',
  '    orderType,\n    tier: family.tier,\n    quantity: qty,\n    family: familyId,',
  "derive pricing tier from the effective hat family",
);

replaceOnce(
  '            {patchOnly ? "Patch only" : `${family.id} ${family.label}`}\n            {colorway ? ` · ${colorway}` : ""}',
  '            {patchOnly ? "Patch only" : `${family.id} ${family.label}${colorway ? ` · ${colorway}` : ""}`}',
  "remove hat color from patch-only heading",
);

replaceOnce(
  '{patchOnly ? "Patch only" : draft.tier === "premium" ? "Premium hat + patch" : "Standard hat + patch"} · ${est.unit} each',
  '{patchOnly ? "Patch only" : family.tier === "premium" ? "Premium hat + patch" : "Standard hat + patch"} · ${est.unit} each',
  "derive review tier copy from the effective hat family",
);

replaceOnce(
  '  const missingDesign = !draft.patchText.trim() && !draft.artworkDataUrl;\n  const continueLabel =',
  '  const missingDesign = !draft.patchText.trim() && !draft.artworkDataUrl;\n  const missingColor = !patchOnly && !colorway;\n  const continueLabel =',
  "track missing hat color",
);

replaceOnce(
  '    active === "review"\n      ? !draft.customerName.trim()\n        ? "Add your name"',
  '    active === "review"\n      ? missingColor\n        ? "Choose a hat color"\n        : !draft.customerName.trim()\n          ? "Add your name"',
  "show missing color on review",
);

replaceOnce(
  '  const ready = Boolean(draft.customerName.trim()) && emailOk && !missingDesign;',
  '  const ready = !missingColor && Boolean(draft.customerName.trim()) && emailOk && !missingDesign;\n  const canAdvance =\n    !(active === "color" && !colorway) &&\n    !(active === "design" && missingDesign);',
  "enforce required color and design before advancing",
);

if (!source.includes('disabled={next ? !canAdvance : !ready}') || !source.includes('else if (!next && ready) focusPayment();')) {
  throw new Error("[REC Mama Made] Desktop advance/payment guard is missing. Builder source changed and needs review.");
}

if (!source.includes('disabled={active === "review" ? !ready : !canAdvance}') || !source.includes('else if (active === "review" && ready) focusPayment();')) {
  throw new Error("[REC Mama Made] Mobile advance/payment guard is missing. Builder source changed and needs review.");
}

if (changed) {
  fs.writeFileSync(file, source);
  console.log("[REC Mama Made] Applied deep-link pricing, patch-only, and required-step QA fixes.");
} else {
  console.log("[REC Mama Made] Deep-link pricing, patch-only, and required-step QA fixes already applied.");
}
