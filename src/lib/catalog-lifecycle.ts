/** Exact model identities retained for history, never prefix or title matching. */
export const RETIRED_HAT_MODEL_IDS: readonly string[] = ["112PM"];

export function isRetiredHatModel(id: unknown): boolean {
  return typeof id === "string" && RETIRED_HAT_MODEL_IDS.includes(id);
}

export function assertHatModelAvailable(orderType: string, family: string) {
  if (orderType === "hat" && isRetiredHatModel(family))
    throw Error("This hat model is no longer offered. Choose an available model.");
}

export function hasRetiredModelOption(options: Record<string, unknown> = {}) {
  return [options.family, options.modelId, options.model].some(isRetiredHatModel);
}
