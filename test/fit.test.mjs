import { test } from "node:test";
import assert from "node:assert/strict";
import { fitFor, returnRisk } from "../src/fit.mjs";

const chart = {
  S: { chest: [86, 94], waist: [72, 82] },
  M: { chest: [94, 102], waist: [80, 90] },
  L: { chest: [102, 110], waist: [88, 98] },
};

test("picks the size whose ranges contain the measurements", () => {
  const f = fitFor({ chest: 98, waist: 85 }, chart);
  assert.equal(f.best, "M");
  assert.ok(f.confidence >= 90, `confidence ${f.confidence}`);
});

test("says which way a size misses", () => {
  const f = fitFor({ chest: 98, waist: 85 }, chart);
  const s = f.perSize.find((p) => p.size === "S");
  assert.deepEqual(s.misses.map((m) => m.way), ["tight", "tight"]);
});

test("between sizes lowers confidence", () => {
  const clear = fitFor({ chest: 98, waist: 85 }, chart).confidence;
  const between = fitFor({ chest: 102, waist: 89 }, chart).confidence;
  assert.ok(between < clear, `${between} < ${clear}`);
});

test("no measurements, no guess", () => {
  const f = fitFor({}, chart);
  assert.equal(f.best, null);
  assert.equal(f.confidence, null);
});

test("fewer measurements, less confidence", () => {
  const both = fitFor({ chest: 98, waist: 85 }, chart).confidence;
  const one = fitFor({ chest: 98 }, chart).confidence;
  assert.ok(one < both);
});

test("return risk follows the shop's own base rate and the try-on vote", () => {
  const base = 0.25;
  const sure = returnRisk({ baseRate: base, confidence: 100, triedOn: true, looksRight: true });
  const unsure = returnRisk({ baseRate: base, confidence: 40, triedOn: false });
  const off = returnRisk({ baseRate: base, confidence: 100, triedOn: true, looksRight: false });
  assert.ok(sure < base && unsure > base && off > sure);
  assert.ok(sure >= 0.01 && unsure <= 0.95);
});
