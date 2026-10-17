import { test } from "node:test";
import assert from "node:assert/strict";
import { sourcePixelProof } from "./hat-source-pixel-proof.mjs";
test("baseline proof permits only identical pixels or at most four isolated one-level roundoffs in a full-size frame", () => {
  const approved = new Uint8Array(4_800_000).fill(111),
    current = approved.slice();
  assert.deepEqual(sourcePixelProof(current, approved), { changedChannels: 0, maximumChange: 0 });
  current[3382113]++;
  assert.deepEqual(sourcePixelProof(current, approved), { changedChannels: 1, maximumChange: 1 });
  current[0] += 2;
  assert.equal(sourcePixelProof(current, approved), null);
  const several = approved.slice();
  for (let i = 0; i < 5; i++) several[i]++;
  assert.equal(sourcePixelProof(several, approved), null);
  assert.equal(sourcePixelProof(current, current.subarray(1)), null);
  assert.equal(sourcePixelProof(new Uint8Array(100), new Uint8Array(100)), null);
});
