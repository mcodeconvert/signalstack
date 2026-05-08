import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRole, canonicalEmployer } from '../src/canonical-role.js';

test('canonicalRole identifies Senior Backend Engineer variants', () => {
  // All three should hash to the same slug for repost detection.
  const a = canonicalRole('Senior Backend Engineer');
  const b = canonicalRole('Sr. Backend Eng');
  const c = canonicalRole('Software Engineer Backend Senior');
  assert.equal(a, 'engineer-backend-senior');
  assert.equal(b, 'engineer-backend-senior');
  assert.equal(c, 'engineer-backend-senior');
});

test('canonicalRole handles SAP MM Consultant', () => {
  assert.equal(canonicalRole('SAP MM Consultant'), 'consultant-sap-mm');
  assert.equal(canonicalRole('Senior SAP MM Consultant'), 'consultant-sap-mm-senior');
});

test('canonicalRole handles Quereinsteiger NRW (the Lens-3 finding)', () => {
  // Different source phrasings for the same chronic-shortage signal.
  const a = canonicalRole('Pflegefachkraft Quereinsteiger NRW');
  const b = canonicalRole('Pflegekraft (Quereinsteiger/in) Nordrhein-Westfalen');
  // Both must include 'pflegekraft' + 'quereinsteiger' + 'nrw' for the role-recurrence detector.
  assert.ok(a.includes('pflegekraft'));
  assert.ok(a.includes('quereinsteiger'));
  assert.ok(a.includes('nrw'));
  assert.ok(b.includes('pflegekraft'));
  assert.ok(b.includes('quereinsteiger'));
  assert.ok(b.includes('nrw'));
});

test('canonicalRole handles DevOps + Cloud + AWS', () => {
  const a = canonicalRole('Senior DevOps Engineer (AWS)');
  assert.ok(a.startsWith('engineer'));
  assert.ok(a.includes('devops'));
  assert.ok(a.includes('cloud'));
  assert.ok(a.includes('senior'));
});

test('canonicalRole returns null for empty input', () => {
  assert.equal(canonicalRole(''), null);
  assert.equal(canonicalRole(null), null);
  assert.equal(canonicalRole(undefined), null);
});

test('canonicalRole falls back to slug for un-structured titles', () => {
  // No role, no spec, no seniority → fall back to a slugified prefix.
  const r = canonicalRole('Looking for a great person to join our team');
  assert.ok(r);
  assert.ok(r.length > 0);
  assert.match(r, /^[a-z0-9-]+$/);
});

test('canonicalEmployer normalizes German company suffixes', () => {
  assert.equal(canonicalEmployer('Link Group GmbH'), 'link-group');
  assert.equal(canonicalEmployer('Link Group'), 'link-group');
  assert.equal(canonicalEmployer('LinkGroup'), 'linkgroup'); // CamelCase has no separator → not normalized further
  assert.equal(canonicalEmployer('Devire Sp. z o.o.'), 'devire');
  assert.equal(canonicalEmployer('Siemens AG'), 'siemens');
  assert.equal(canonicalEmployer('Bosch GmbH & Co. KG'), 'bosch');
});

test('canonicalEmployer handles umlauts via ASCII fold', () => {
  assert.equal(canonicalEmployer('Müller GmbH'), 'mueller');
  assert.equal(canonicalEmployer('Schäfer & Söhne GbR'), 'schaefer-soehne');
});

test('canonicalEmployer returns null for empty', () => {
  assert.equal(canonicalEmployer(''), null);
  assert.equal(canonicalEmployer(null), null);
});
