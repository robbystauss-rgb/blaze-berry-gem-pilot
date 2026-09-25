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

if (changed) {
  fs.writeFileSync(file, source);
  console.log("[REC Mama Made] Applied deep-link pricing and patch-only QA fixes.");
} else {
  console.log("[REC Mama Made] Deep-link pricing and patch-only QA fixes already applied.");
}
