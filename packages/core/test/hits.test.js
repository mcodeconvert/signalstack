import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHits } from '../src/hits.js';

test('derives hits from title and description', () => {
  const hits = deriveHits({
    title: 'Datenmigration SAP S/4 HANA Mittelstand',
    description: 'Wir suchen jemanden, der unsere DATEV-Schnittstelle anbindet und manuell pflegt.'
  }, 'l_test');
  const map = Object.fromEntries(hits.map(h => [`${h.dictKey}:${h.term}`, h]));
  assert.ok(map['D1:SAP'], 'SAP detected');
  assert.ok(map['D1:SAP'].inTitle, 'SAP is in title');
  assert.ok(map['D6:Mittelstand'], 'Mittelstand detected');
  assert.ok(map['D4:DATEV-Schnittstelle'], 'DATEV-Schnittstelle detected');
  assert.ok(map['D3:manuell'], 'manuell pain detected');
  assert.ok(map['D2:migrieren'] || map['D2:Migration'], 'migration verb detected via alias');
});

test('negation suppresses hits', () => {
  const hits = deriveHits({
    title: 'Reporting Tool gesucht',
    description: 'Wir nutzen kein SAP, aber Excel-Hölle.'
  }, 'l_test');
  const dictTerms = hits.map(h => `${h.dictKey}:${h.term}`);
  assert.ok(!dictTerms.includes('D1:SAP'), 'SAP suppressed by "kein"');
  assert.ok(dictTerms.includes('D3:Excel-Hölle') || dictTerms.includes('D1:Excel'),
    'Excel pain still present');
});

test('returns empty when no terms match', () => {
  const hits = deriveHits({ title: 'Random nothing', description: 'truly nothing' }, 'l_x');
  assert.equal(hits.length, 0);
});

test('confidence is between 0 and 1', () => {
  const hits = deriveHits({
    title: 'SAP DATEV',
    description: 'Mittelstand'
  }, 'l_test');
  for (const h of hits) {
    assert.ok(h.confidence >= 0 && h.confidence <= 1, `bad confidence ${h.confidence}`);
  }
});
