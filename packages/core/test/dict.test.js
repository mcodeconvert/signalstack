import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICTS, dictKeys, termsOf } from '../src/dict.js';

test('all 7 dictionaries are loaded', () => {
  assert.deepEqual(dictKeys().sort(), ['D1','D2','D3','D4','D5','D6','D7']);
});

test('D1 contains canonical "SAP"', () => {
  assert.ok(termsOf('D1').includes('SAP'));
});

test('D1 "Power BI" pattern matches "Power BI" and alias "PowerBI"', () => {
  const t = DICTS.D1.terms.find(x => x.canonical === 'Power BI');
  assert.ok(t);
  t.pattern.lastIndex = 0;
  assert.match('We use Power BI daily', t.pattern);
  t.pattern.lastIndex = 0;
  assert.match('PowerBI dashboards', t.pattern);
  t.pattern.lastIndex = 0;
  // negative — should NOT match a substring
  assert.doesNotMatch('superpowerbie', t.pattern);
});

test('word boundaries respect umlauts and dashes', () => {
  const t = DICTS.D4.terms.find(x => x.canonical === 'XRechnung');
  t.pattern.lastIndex = 0;
  assert.match('XRechnung Einführung', t.pattern);
  t.pattern.lastIndex = 0;
  assert.doesNotMatch('XRechnungAB', t.pattern); // no boundary
});
