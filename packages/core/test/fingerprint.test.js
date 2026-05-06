import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingId, contentHash, dedupeFingerprint, normalizeTitle } from '../src/fingerprint.js';

test('listingId is deterministic for same inputs', () => {
  const d = new Date('2026-04-18');
  const a = listingId('gulp', 'https://example.com/x/123', d);
  const b = listingId('gulp', 'https://example.com/x/123', d);
  assert.equal(a, b);
  assert.match(a, /^l_[a-f0-9]{20}$/);
});

test('listingId differs across sources/urls', () => {
  const d = new Date('2026-04-18');
  assert.notEqual(
    listingId('gulp', 'https://x', d),
    listingId('freelance', 'https://x', d)
  );
});

test('contentHash is stable hex SHA-256', () => {
  const a = contentHash('hello');
  const b = contentHash(Buffer.from('hello'));
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('dedupeFingerprint groups equivalent listings', () => {
  const a = { title: 'Datenmigration SAP S/4 HANA Mittelstand 2026',
              budgetEur: 850, postedAt: new Date('2026-04-21') };
  const b = { title: 'Datenmigration SAP S/4 HANA Mittelstand 2025',
              budgetEur: 800, postedAt: new Date('2026-04-22') };
  // Different budgets if they cross a bucket → may differ. Both <800 vs >=800.
  // Force same bucket.
  const c = { ...b, budgetEur: 850 };
  assert.equal(dedupeFingerprint(a), dedupeFingerprint(c));
});

test('normalizeTitle folds umlauts and lowercases', () => {
  assert.equal(normalizeTitle('Schnittstelle für DATEV-Lohnbuchhaltung'),
                              'schnittstelle fur datev lohnbuchhaltung');
});
