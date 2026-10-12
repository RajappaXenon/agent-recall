/**
 * npm run calibrate -w backend
 *
 * Embeds the calibration question pairs (src/eval/calibration-pairs.ts) with the configured Voyage
 * model (input_type "query", as outcome questions and searches are both queries), prints cosine
 * similarity per pair and derives the contextual outcome-policy thresholds with a fixed rule:
 *   CONTEXT_LOW  = highest cosine among "different problem" pairs (no hard negative gets any boost)
 *   CONTEXT_HIGH = median cosine among "same problem" pairs (a typical paraphrase gets full weight)
 */
import { config } from '../config.js';
import { CALIBRATION_PAIRS } from '../eval/calibration-pairs.js';
import { cosine } from '../services/rrf.js';
import { embedQuery, isVoyageConfigured } from '../services/embeddings.js';
import { runScript } from './_util.js';

runScript('calibrate', async () => {
  if (!isVoyageConfigured()) throw new Error('VOYAGE_API_KEY is not set.');
  const rows: { same: boolean; cos: number; a: string; b: string }[] = [];
  for (const p of CALIBRATION_PAIRS) {
    const [a, b] = [(await embedQuery(p.a)).vector, (await embedQuery(p.b)).vector];
    rows.push({ same: p.same, cos: cosine(a, b), a: p.a, b: p.b });
  }
  const same = rows.filter((r) => r.same).map((r) => r.cos).sort((x, y) => x - y);
  const diff = rows.filter((r) => !r.same).map((r) => r.cos).sort((x, y) => x - y);
  const median = (v: number[]) => (v.length % 2 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2);
  for (const r of rows.sort((x, y) => y.cos - x.cos)) console.log(`  ${r.same ? 'same' : 'diff'}  ${r.cos.toFixed(3)}  ${r.a.slice(0, 50)} | ${r.b.slice(0, 50)}`);
  console.log(`\nmodel ${config.VOYAGE_MODEL} (${config.VOYAGE_DIMENSIONS} dims)`);
  console.log(`same-problem pairs:      min ${same[0]!.toFixed(3)} · median ${median(same).toFixed(3)} · max ${same.at(-1)!.toFixed(3)}`);
  console.log(`different-problem pairs: min ${diff[0]!.toFixed(3)} · median ${median(diff).toFixed(3)} · max ${diff.at(-1)!.toFixed(3)}`);
  const low = diff.at(-1)!;
  const high = median(same);
  console.log(high > low ? `\nCONTEXT_LOW = ${low.toFixed(2)} · CONTEXT_HIGH = ${high.toFixed(2)}` : `\nNo separation: max different (${low.toFixed(3)}) ≥ median same (${high.toFixed(3)}).`);
});
