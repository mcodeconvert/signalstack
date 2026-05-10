import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probe } from '../src/probe.js';

const sample = [
  { id: 'a', title: 'SAP S/4HANA Migration', description: 'Wir migrieren SAP nach HANA. SAP-Erfahrung gefragt.' },
  { id: 'b', title: 'DATEV Integration',     description: 'Schnittstelle zwischen DATEV und SAP.' },
  { id: 'c', title: 'Frontend React Dev',    description: 'Pure React project — no SAP, no HANA.' },
  { id: 'd', title: 'SAP nur im Titel',      description: 'irrelevant body' },
  { id: 'e', title: 'no match here',         description: '' },
  { id: 'f', title: 'HTML test',             description: '<p>SAP &amp; ABAP</p> http://example.com/sap' }
];

test('probe split is correct on hand-counted sample', () => {
  const data = [
    { id: '1', title: 'SAP only here', description: 'no match' },
    { id: '2', title: 'no match', description: 'desc has SAP' },
    { id: '3', title: 'SAP both', description: 'and SAP again' },
    { id: '4', title: 'nothing',  description: 'nothing either' }
  ];
  const r = probe(data, 'sap');
  assert.equal(r.ok, true);
  assert.equal(r.title.records, 2, 'records 1 and 3 match in title');
  assert.equal(r.title.citations, 2);
  assert.equal(r.description.records, 2, 'records 2 and 3 match in desc');
  assert.equal(r.description.citations, 2);
  assert.equal(r.both, 1, 'only record 3 matches both');
  assert.equal(r.either, 3, 'records 1, 2, 3');
  assert.equal(r.scanned, 4);
  assert.equal(r.total, 4);
  assert.equal(r.truncated, false);
});

test('probe handles regex syntax (word boundary)', () => {
  const data = [
    { id: '1', title: 'SAP project', description: '' },
    { id: '2', title: 'SAPHana migration', description: '' },
    { id: '3', title: 'asap response', description: '' }
  ];
  const r = probe(data, '\\bsap\\b');
  assert.equal(r.ok, true);
  assert.equal(r.title.records, 1, 'only "SAP project" matches \\bsap\\b');
});

test('probe handles invalid regex gracefully', () => {
  const r = probe(sample, '[unclosed');
  assert.equal(r.ok, false);
  assert.match(r.error, /invalid regex/);
});

test('probe rejects empty pattern', () => {
  assert.equal(probe(sample, '').ok, false);
  assert.equal(probe(sample, '   ').ok, false);
  assert.equal(probe(sample, null).ok, false);
});

test('probe rejects pattern over 200 chars', () => {
  const long = 'a'.repeat(201);
  const r = probe(sample, long);
  assert.equal(r.ok, false);
  assert.match(r.error, /too long/);
});

test('probe strips HTML tags, entities, and URLs before matching', () => {
  const data = [{
    id: '1',
    title: 'plain',
    description: '<a href="http://example.com/sap">click</a> &amp; SAP-text'
  }];
  // 'sap' in href URL should be stripped; 'SAP-text' should match
  const r = probe(data, 'sap');
  assert.equal(r.ok, true);
  assert.equal(r.description.citations, 1, 'URL stripped, only SAP-text counts');
});

test('probe handles missing description / title fields', () => {
  const data = [
    { id: '1', title: 'SAP' },
    { id: '2', description: 'SAP only desc' },
    { id: '3' }
  ];
  const r = probe(data, 'sap');
  assert.equal(r.ok, true);
  assert.equal(r.title.records, 1);
  assert.equal(r.description.records, 1);
});

test('probe is case-insensitive by default', () => {
  const data = [{ id: '1', title: 'sap', description: 'SAP' }];
  const r = probe(data, 'SAP');
  assert.equal(r.title.citations, 1);
  assert.equal(r.description.citations, 1);
});

test('probe survives zero-width match patterns without infinite loop', () => {
  const data = [{ id: '1', title: 'abc', description: 'def' }];
  const r = probe(data, 'a*');
  assert.equal(r.ok, true);
  // no infinite loop is the test; counts not asserted (engine-specific)
});

test('probe samples up to 25 matches', () => {
  const data = [];
  for (let i = 0; i < 50; i++) data.push({ id: `r${i}`, title: 'SAP item', description: '' });
  const r = probe(data, 'sap');
  assert.equal(r.matches.length, 25);
  assert.equal(r.title.records, 50);
});

test('probe returns empty arrays / zeros on empty input', () => {
  const r = probe([], 'sap');
  assert.equal(r.ok, true);
  assert.equal(r.title.records, 0);
  assert.equal(r.description.records, 0);
  assert.equal(r.either, 0);
  assert.equal(r.both, 0);
  assert.equal(r.matches.length, 0);
});
