import test from "node:test";
import assert from "node:assert/strict";
import { LUCKY_PRIZES } from "../../src/types/luckyDraw.ts";

test("LUCKY_PRIZES is configured with Free Fire and Mobile Legends Weekly passes & diamonds", () => {
  assert.strictEqual(LUCKY_PRIZES.length, 8, "Wheel must have exactly 8 slices");

  const ids = LUCKY_PRIZES.map((p) => p.id);
  assert.ok(ids.includes("ff-weekly"), "Must include Free Fire Weekly Membership");
  assert.ok(ids.includes("mlbb-weekly"), "Must include MLBB Weekly Diamond Pass");
  assert.ok(ids.includes("ff-dia-50"), "Must include 50 FF Diamonds");
  assert.ok(ids.includes("mlbb-dia-50"), "Must include 50 MLBB Diamonds");
  assert.ok(ids.includes("ff-dia-20"), "Must include 20 FF Diamonds");
  assert.ok(ids.includes("mlbb-dia-15"), "Must include 15 MLBB Diamonds");
  assert.ok(ids.includes("disc-50-weekly"), "Must include $0.50 Weekly Pass discount");
  assert.ok(ids.includes("disc-20-topup"), "Must include $0.20 top-up discount");

  // Verify weights total 100
  const totalWeight = LUCKY_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  assert.strictEqual(totalWeight, 100, "Total weight of all slices must be 100");

  for (const prize of LUCKY_PRIZES) {
    assert.ok(prize.name.length > 0 && prize.name.length <= 15, `Prize name "${prize.name}" should fit wheel`);
    assert.ok(prize.icon.length > 0, `Prize "${prize.id}" must have an icon`);
    assert.ok(prize.color.startsWith("#"), `Prize "${prize.id}" must have a valid hex color`);
    assert.ok(prize.value > 0, `Prize "${prize.id}" must have a positive value`);
    assert.ok(prize.weight > 0, `Prize "${prize.id}" must have a positive weight`);
  }
});
