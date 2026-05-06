import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapItem } from '../src/extractors/freelance.js';

test('mapItem returns ParsedListing with expected shape', () => {
  const item = {
    title: 'Datenmigration SAP S/4 HANA Mittelstand',
    link: 'https://www.freelance.de/projekte/123-x',
    contentSnippet: 'Wir suchen Unterstützung in München bei einer Migration. Tagessatz €800/Tag.',
    isoDate: '2026-04-18T08:30:00.000Z',
    categories: ['SAP']
  };
  const out = mapItem(item);
  assert.equal(out.sourceId, 'freelance');
  assert.equal(out.sourceUrl, 'https://www.freelance.de/projekte/123-x');
  assert.equal(out.title, 'Datenmigration SAP S/4 HANA Mittelstand');
  assert.equal(out.language, 'DE');
  assert.equal(out.city, 'München');
  assert.equal(out.bundesland, 'BY');
  assert.equal(out.budgetEur, 800);
  assert.equal(out.budgetKind, 'day');
  assert.equal(out.category, 'SAP');
  assert.ok(out.postedAt instanceof Date);
});

test('mapItem strips HTML from description', () => {
  const item = {
    title: 'Test',
    link: 'https://x',
    content: '<p>Hello <b>world</b></p>',
    isoDate: '2026-04-18T00:00:00Z'
  };
  const out = mapItem(item);
  assert.ok(!out.description.includes('<'), 'no html tags should remain');
  assert.match(out.description, /Hello world/);
});

test('mapItem handles missing fields gracefully', () => {
  const item = { title: 'X', link: 'https://x', isoDate: '2026-04-18T00:00:00Z' };
  const out = mapItem(item);
  assert.equal(out.title, 'X');
  assert.equal(out.budgetEur, null);
});
