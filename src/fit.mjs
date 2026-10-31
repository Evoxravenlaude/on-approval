// Fit confidence: compares a shopper's measure card with an item's size chart.
// Every number shown to the shopper is traceable to this function; nothing is invented.

const DIMS = ["chest", "waist", "hips", "inseam"];

/**
 * card:  { chest, waist, hips, inseam } in cm (any may be missing)
 * chart: { S: { chest:[min,max], waist:[min,max], ... }, M: {...} }
 * returns { best, confidence (0-100), perSize: [{size, score, misses:[...] }], used: [dims] }
 */
export function fitFor(card, chart) {
  const sizes = Object.keys(chart || {});
  if (!sizes.length) return { best: null, confidence: null, perSize: [], used: [] };
  const used = DIMS.filter((d) => Number(card?.[d]) > 0 && sizes.some((s) => chart[s][d]));
  if (!used.length) return { best: null, confidence: null, perSize: [], used };

  const perSize = sizes.map((size) => {
    let penalty = 0;
    const misses = [];
    for (const d of used) {
      const range = chart[size][d];
      if (!range) continue;
      const v = Number(card[d]);
      const [lo, hi] = range;
      const width = Math.max(hi - lo, 1);
      if (v < lo) { const p = (lo - v) / width; penalty += p; misses.push({ dim: d, way: "loose", cm: round(lo - v) }); }
      else if (v > hi) { const p = (v - hi) / width; penalty += p; misses.push({ dim: d, way: "tight", cm: round(v - hi) }); }
      else {
        // inside the range: small penalty for sitting at the very edge
        const mid = (lo + hi) / 2;
        penalty += (Math.abs(v - mid) / (width / 2)) * 0.15;
      }
    }
    const score = Math.max(0, Math.round(100 - (penalty / used.length) * 100));
    return { size, score, misses };
  });
  perSize.sort((a, b) => b.score - a.score);
  // Confidence drops when two sizes are nearly tied (the shopper is between sizes).
  const [a, b] = perSize;
  let confidence = a.score;
  if (b && a.score - b.score < 10) confidence = Math.round(confidence - (10 - (a.score - b.score)) * 1.5);
  // Fewer measurements = less certainty.
  confidence = Math.round(confidence * (0.7 + 0.3 * (used.length / DIMS.filter((d) => sizes.some((s) => chart[s][d])).length)));
  return { best: a.size, confidence: Math.max(0, Math.min(100, confidence)), perSize, used };
}

/**
 * Expected chance this line comes back, from the merchant's own base return rate.
 * baseRate: merchant-set (0-1). Confidence and a seen try-on pull it down; a "looks off" vote pushes it up.
 * This is a planning estimate, labelled as such in the UI.
 */
export function returnRisk({ baseRate, confidence, triedOn, looksRight }) {
  let r = baseRate;
  if (confidence != null) r *= 1.5 - confidence / 100; // 100% confidence halves it; 0% raises it 50%
  if (triedOn) r *= looksRight === false ? 1.4 : 0.8;
  return Math.max(0.01, Math.min(0.95, r));
}

const round = (n) => Math.round(n * 10) / 10;
