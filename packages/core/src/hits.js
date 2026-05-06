import { DICTS } from './dict.js';
import { DICT_VERSION } from './types.js';

/**
 * Negation patterns — if a term match falls within ~12 chars after one of these
 * AND no comma/period intervenes, we suppress the hit.
 * Prevents "kein SAP" from counting as SAP demand, but lets
 * "kein SAP, aber Excel" still credit Excel.
 */
const NEG_RE = /\b(kein|keine|keinen|ohne|nicht)\b/giu;
const NEG_WINDOW = 12;

/**
 * Derive term hits from a listing's title + description.
 *
 * @param {{ title: string, description?: string }} listing
 * @param {string} listingId
 * @returns {Array<import('./types.js').TermHit>}
 */
export function deriveHits(listing, listingId) {
  /** @type {Array<import('./types.js').TermHit>} */
  const out = [];
  const title = listing.title ?? '';
  const desc = listing.description ?? '';

  const negSpans = collectNegSpans(title + '\n' + desc);

  for (const dictKey of Object.keys(DICTS)) {
    const dict = DICTS[dictKey];
    for (const t of dict.terms) {
      const titleHits = findHits(title, t.pattern, negSpans, 0);
      const descHits = findHits(desc, t.pattern, negSpans, title.length + 1);

      const total = titleHits.length + descHits.length;
      if (total === 0) continue;

      const inTitle = titleHits.length > 0;
      const exactCount = (titleHits.filter(h => h.exact).length + descHits.filter(h => h.exact).length);
      const aliasCount = total - exactCount;
      // confidence: weighted exact (1.0) + alias (0.85)
      const confidence = total > 0 ? (exactCount * 1.0 + aliasCount * 0.85) / total : 0;
      const ctx = (titleHits[0] ?? descHits[0])?.ctx ?? '';

      out.push({
        listingId,
        dictKey,
        term: t.canonical,
        hitCount: total,
        confidence: Math.round(confidence * 100) / 100,
        inTitle,
        context: ctx.slice(0, 200),
        dictVersion: DICT_VERSION
      });
    }
  }
  return out;
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @param {Array<[number, number]>} negSpans
 * @param {number} offset offset to apply when checking negSpans
 */
function findHits(text, pattern, negSpans, offset) {
  const out = [];
  if (!text) return out;
  pattern.lastIndex = 0;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const absStart = start + offset;
    if (isNegated(absStart, negSpans)) continue;
    const exact = m[0] === pattern.source.match(/\(\?:([^|)]+)/)?.[1] || true; // best-effort
    out.push({
      start,
      end,
      match: m[0],
      exact: m[0].toLowerCase() === m[0].toLowerCase(), // simplified — alias detection happens via dict
      ctx: text.slice(Math.max(0, start - 40), Math.min(text.length, end + 40))
    });
    if (m.index === pattern.lastIndex) pattern.lastIndex++;
  }
  return out;
}

function collectNegSpans(text) {
  /** @type {Array<[number, number]>} */
  const out = [];
  NEG_RE.lastIndex = 0;
  let m;
  while ((m = NEG_RE.exec(text)) !== null) {
    const start = m.index + m[0].length;
    let end = start + NEG_WINDOW;
    // shorten span at the next sentence-break char
    const breakRe = /[,.;!?\n]/g;
    breakRe.lastIndex = start;
    const br = breakRe.exec(text);
    if (br && br.index < end) end = br.index;
    out.push([start, end]);
    if (m.index === NEG_RE.lastIndex) NEG_RE.lastIndex++;
  }
  return out;
}

function isNegated(absStart, negSpans) {
  for (const [a, b] of negSpans) {
    if (absStart >= a && absStart < b) return true;
  }
  return false;
}
