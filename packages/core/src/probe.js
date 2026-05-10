/**
 * Free-text regex probe across listing titles + descriptions.
 *
 * Counts citations (total occurrences) and records (matching listings)
 * split by where the match landed (title vs description vs both). The
 * search field on the words page feeds this — it lets the operator
 * answer "how often does <word|phrase|regex> show up, and where?"
 * for any pattern, not just the pre-tokenized word list.
 */

const MAX_PATTERN_LEN = 200;
const MAX_DESC_CHARS = 50_000;
const MAX_MATCHES_SAMPLE = 25;
const TIME_BUDGET_MS = 1500;

const TAG_RE = /<[^>]+>/g;
const ENTITY_RE = /&[a-z]+;/gi;
const URL_RE = /https?:\/\/\S+/gi;

/** Strip HTML tags, entities, and URLs so the regex matches visible text. */
function clean(text, capChars) {
  if (!text) return '';
  let s = String(text);
  if (capChars && s.length > capChars) s = s.slice(0, capChars);
  return s.replace(TAG_RE, ' ').replace(ENTITY_RE, ' ').replace(URL_RE, ' ');
}

/** Count non-overlapping matches; safe against zero-width patterns. */
function countMatches(text, re) {
  if (!text) return 0;
  re.lastIndex = 0;
  let n = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    n++;
    if (m[0].length === 0) {
      re.lastIndex++;
      if (re.lastIndex > text.length) break;
    }
  }
  return n;
}

/** Find first match index for the snippet preview (separate non-global re). */
function firstSnippet(text, pattern) {
  if (!text) return null;
  let re;
  try { re = new RegExp(pattern, 'i'); }
  catch { return null; }
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 40);
  const end = Math.min(text.length, m.index + m[0].length + 60);
  return text.slice(start, end);
}

/**
 * Probe a regex pattern against a listing array.
 *
 * @param {Array<{ id: string, title?: string, description?: string }>} listings
 * @param {string} pattern  raw pattern, treated as case-insensitive regex
 * @returns {{
 *   ok: true,
 *   pattern: string,
 *   title:       { citations: number, records: number },
 *   description: { citations: number, records: number },
 *   either: number, both: number,
 *   scanned: number, total: number,
 *   matches: Array<{ id: string, title: string, tCount: number, dCount: number, snippet: string|null }>,
 *   truncated: boolean,
 *   elapsedMs: number
 * } | { ok: false, error: string }}
 */
export function probe(listings, pattern) {
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    return { ok: false, error: 'empty pattern' };
  }
  if (pattern.length > MAX_PATTERN_LEN) {
    return { ok: false, error: `pattern too long (max ${MAX_PATTERN_LEN} chars)` };
  }

  let re;
  try { re = new RegExp(pattern, 'gi'); }
  catch (e) {
    return { ok: false, error: `invalid regex: ${e.message}` };
  }

  const t0 = Date.now();
  let titleCit = 0, descCit = 0;
  let titleRec = 0, descRec = 0, bothRec = 0;
  /** @type {Array<{ id: string, title: string, tCount: number, dCount: number, snippet: string|null }>} */
  const matches = [];
  let scanned = 0;
  let truncated = false;

  for (const l of listings) {
    if (Date.now() - t0 > TIME_BUDGET_MS) { truncated = true; break; }
    scanned++;
    const tText = clean(l.title);
    const dText = clean(l.description, MAX_DESC_CHARS);
    const tCount = countMatches(tText, re);
    const dCount = countMatches(dText, re);

    if (tCount > 0) { titleRec++; titleCit += tCount; }
    if (dCount > 0) { descRec++;  descCit  += dCount; }
    if (tCount > 0 && dCount > 0) bothRec++;

    if ((tCount > 0 || dCount > 0) && matches.length < MAX_MATCHES_SAMPLE) {
      const snippet = firstSnippet(tCount ? tText : dText, pattern);
      matches.push({
        id: l.id,
        title: l.title ?? '',
        tCount,
        dCount,
        snippet
      });
    }
  }

  return {
    ok: true,
    pattern,
    title: { citations: titleCit, records: titleRec },
    description: { citations: descCit, records: descRec },
    either: titleRec + descRec - bothRec,
    both: bothRec,
    scanned,
    total: listings.length,
    matches,
    truncated,
    elapsedMs: Date.now() - t0
  };
}
