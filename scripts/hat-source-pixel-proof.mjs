/** Provider re-encoding can change isolated 8-bit rounding. Never accept a crop,
 * a resized image, or a perceptually similar replacement as baseline proof.
 * Callers must already have verified identical dimensions/channels and asset ID.
 */
export function sourcePixelProof(current, approved) {
  if (current.length !== approved.length || current.length < 1_000_000) return null;
  let changedChannels = 0,
    maximumChange = 0;
  for (let i = 0; i < current.length; i++) {
    const delta = Math.abs(current[i] - approved[i]);
    if (delta) {
      changedChannels++;
      maximumChange = Math.max(maximumChange, delta);
    }
    if (delta > 1 || changedChannels > 4) return null;
  }
  return { changedChannels, maximumChange };
}
