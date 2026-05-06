import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeo, detectLang, parseBudget, parseDate, isoWeek, isoWeekStart } from '../src/normalize.js';

test('normalizeGeo maps Hamburg → HH', () => {
  assert.deepEqual(normalizeGeo('Hamburg'), { city: 'Hamburg', bundesland: 'HH' });
});

test('normalizeGeo handles "München, Bayern"', () => {
  const r = normalizeGeo('München, Bayern');
  assert.equal(r.city, 'München');
  assert.equal(r.bundesland, 'BY');
});

test('normalizeGeo unknown city returns city, no Bundesland', () => {
  const r = normalizeGeo('Lüneburg');
  assert.equal(r.city, 'Lüneburg');
  assert.equal(r.bundesland, null);
});

test('detectLang identifies German with stopwords + umlauts', () => {
  assert.equal(detectLang('Wir suchen jemanden für unsere Buchhaltung mit Excel und DATEV.'), 'DE');
});

test('detectLang identifies English', () => {
  assert.equal(detectLang('We are looking for a freelancer with experience in BigQuery and Snowflake.'), 'EN');
});

test('parseBudget recognizes "€800/Tag"', () => {
  assert.deepEqual(parseBudget('€800/Tag'), { budgetEur: 800, budgetKind: 'day' });
});

test('parseBudget recognizes "ab 1.500 EUR/Tag"', () => {
  assert.deepEqual(parseBudget('ab 1.500 EUR/Tag'), { budgetEur: 1500, budgetKind: 'day' });
});

test('parseBudget recognizes "80€/h"', () => {
  assert.deepEqual(parseBudget('80€/h'), { budgetEur: 80, budgetKind: 'hour' });
});

test('parseBudget treats lone number as project', () => {
  const r = parseBudget('500.000 €');
  assert.equal(r.budgetEur, 500000);
  assert.equal(r.budgetKind, 'project');
});

test('parseDate parses ISO and German formats', () => {
  assert.equal(parseDate('2026-04-18').toISOString().slice(0,10), '2026-04-18');
  assert.equal(parseDate('18.04.2026').toISOString().slice(0,10), '2026-04-18');
});

test('isoWeek formats correctly', () => {
  // 2026-W18 — verify by example
  const d = new Date('2026-05-04T12:00:00Z');
  assert.equal(isoWeek(d), '2026-W19');
});

test('isoWeekStart returns Monday UTC', () => {
  const d = new Date('2026-05-08T12:00:00Z'); // Friday
  const m = isoWeekStart(d);
  assert.equal(m.getUTCDay(), 1);
});
