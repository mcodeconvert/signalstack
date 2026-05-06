import { createHash } from 'node:crypto';

/**
 * Deterministic listing id from (sourceId, sourceUrl, postedAt).
 * Stable across re-runs → enables idempotent ingest.
 *
 * @param {string} sourceId
 * @param {string} sourceUrl
 * @param {Date|string} postedAt
 */
export function listingId(sourceId, sourceUrl, postedAt) {
  const stamp = typeof postedAt === 'string' ? postedAt : postedAt.toISOString().slice(0, 10);
  const hash = sha256(`${sourceId}|${sourceUrl}|${stamp}`).slice(0, 20);
  return `l_${hash}`;
}

/** SHA-256 of arbitrary content for raw_blob.content_hash. */
export function contentHash(buf) {
  return sha256(buf instanceof Buffer ? buf : Buffer.from(String(buf), 'utf8'));
}

/**
 * Cross-source dedup fingerprint.
 * (normalized title, budget bin, ISO week of posted_at)
 *
 * @param {{ title: string, budgetEur?: number|null, postedAt: Date }} listing
 */
export function dedupeFingerprint(listing) {
  const titleNorm = normalizeTitle(listing.title);
  const budgetBin = bucketBudget(listing.budgetEur);
  const week = weekKey(listing.postedAt);
  return sha256(`${titleNorm}|${budgetBin}|${week}`).slice(0, 24);
}

/**
 * Title normalizer — strip numbers, brackets, lowercase, fold umlauts, keep words.
 */
export function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[äÄ]/g, 'a').replace(/[öÖ]/g, 'o').replace(/[üÜ]/g, 'u').replace(/[ß]/g, 'ss')
    .replace(/[\d]/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bucketBudget(eur) {
  if (eur == null) return 'NA';
  if (eur < 200) return '<200';
  if (eur < 800) return '<800';
  if (eur < 3000) return '<3k';
  if (eur < 10000) return '<10k';
  if (eur < 100000) return '<100k';
  return '100k+';
}

function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const w = Math.ceil((((d - start) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}W${w}`;
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}
