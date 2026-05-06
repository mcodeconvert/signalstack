#!/usr/bin/env node
/**
 * Generate a deterministic 5-year synthetic corpus and write a single JSON file
 * the web app can read when DATABASE_URL is absent. Same shape as the API
 * endpoints would return, so swapping to real Postgres is a one-line change.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_META } from '@signalstack/core/types';
import { DICTS, dictKeys } from '@signalstack/core/dict';
import { listingId } from '@signalstack/core/fingerprint';

const WEEKS = 260;
const NOW = new Date('2026-05-04T00:00:00Z');

const CITIES = [
  ['München','BY'], ['Berlin','BE'], ['Hamburg','HH'], ['Frankfurt','HE'], ['Stuttgart','BW'],
  ['Köln','NW'], ['Düsseldorf','NW'], ['Hannover','NI'], ['Nürnberg','BY'], ['Leipzig','SN'],
  ['Dortmund','NW'], ['Bremen','HB'], ['Dresden','SN'], ['Essen','NW'], ['Karlsruhe','BW'],
  ['Mannheim','BW'], ['Augsburg','BY'], ['Wiesbaden','HE'], ['Bonn','NW'], ['Wuppertal','NW']
];

const TITLES = [
  'Datenmigration SAP S/4 HANA Mittelstand',
  'DATEV-Schnittstelle Lohnbuchhaltung gesucht',
  'Excel Reporting Automatisierung',
  'XRechnung Einführung Steuerberater',
  'Power BI Dashboard Produktion',
  'Werkstudent Excel Datenpflege',
  'CSRD Reporting System Aufbau',
  'Schnittstelle SAP zu Salesforce',
  'Heizkostenabrechnung Tool für Vermieter',
  'CRM-Migration HubSpot zu Salesforce',
  'Mittelstand Reporting Konsolidierung',
  'ZATCA E-Invoicing Integration',
  'Maschinenbau RFQ-Workflow',
  'Lexware zu DATEV Datenmigration',
  'IT-Modernisierung Legacy ERP',
  'Datenbereinigung Stammdaten SAP',
  'Power BI Werkstudent Reporting',
  'sevdesk Schnittstelle DATEV',
  'OT-Daten Anbindung Shop Floor',
  'Konsolidierung Excel Berichte',
  'Schnittstelle DATEV-Lexware Mittelstand',
  'Reporting-Pipeline für Geschäftsführer',
  'API-Anbindung ERP an HubSpot',
  'Manuelle Datenpflege Excel ablösen',
  'Tableau Dashboard Mittelstand'
];

const CPV = [
  ['72000000','IT services'], ['72200000','Software development'],
  ['72260000','Software-related'], ['72300000','Data services'],
  ['72500000','Computer services'], ['79410000','Business consulting'],
  ['72600000','Computer support'], ['72100000','Hardware consultancy'],
  ['48000000','Software packages'], ['71600000','Technical testing']
];

const SOURCE_BUDGET = {
  gulp:      { mean: 780, sd: 220, kind: 'day',     hasBudget: 0.85 },
  freelance: { mean: 620, sd: 180, kind: 'day',     hasBudget: 0.78 },
  twago:     { mean: 480, sd: 160, kind: 'day',     hasBudget: 0.72 },
  junico:    { mean: 25,  sd: 7,   kind: 'hour',    hasBudget: 0.94 },
  evergabe:  { mean: 80000, sd: 35000, kind: 'project', hasBudget: 0.92 }
};

function lcg(seed){ let s=seed>>>0||1; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function noise(rnd, mean, sd){ const u=Math.max(rnd(),1e-9), v=rnd(); return mean + sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function srcSeed(id){ let h=0; for(let i=0;i<id.length;i++) h=((h<<5)-h+id.charCodeAt(i))|0; return h; }

function weekDate(idx){
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - (WEEKS-1-idx)*7);
  d.setUTCHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}
function isoWeekStr(d){
  const dt = new Date(d);
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const w = Math.ceil((((dt - start)/86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
}

function makeListing(seq, src, w, rnd){
  const t = w / WEEKS;
  const lang = rnd() < 0.96 ? 'DE' : 'EN';
  const cIdx = Math.min(CITIES.length-1, Math.floor(-Math.log(Math.max(rnd(),1e-6))*4));
  const [city, bundesland] = CITIES[cIdx] || CITIES[0];
  const titleIdx = Math.floor(rnd() * TITLES.length);
  const title = TITLES[titleIdx];

  // term hits
  const hits = [];
  for (const dk of Object.keys(DICTS)) {
    const terms = DICTS[dk].terms;
    for (let ti=0; ti<terms.length; ti++) {
      const baseP = 0.18 / Math.pow(ti+1, 0.55);
      const phase = (ti + dk.charCodeAt(1)) % 4;
      let mod = 1;
      if(phase===0) mod = 0.5 + 1.2*t;
      else if(phase===1) mod = 0.9 + 0.2*Math.sin(t*Math.PI);
      else if(phase===2) mod = 1.55 - 1.0*t;
      else mod = (t > 0.55 ? 1.1 + 1.2*(t-0.55) : 0.6);
      const srcMod = src === 'evergabe' ? 0.55 : src === 'junico' ? 0.65 : 1;
      const p = Math.min(0.85, baseP * mod * srcMod);
      if (rnd() < p) hits.push(`${dk}:${terms[ti].canonical}`);
    }
  }

  const bs = SOURCE_BUDGET[src];
  const hasB = rnd() < bs.hasBudget;
  const budget = hasB ? Math.max(0, Math.round(noise(rnd, bs.mean, bs.sd))) : null;
  const cpv = src === 'evergabe' ? CPV[Math.floor(rnd() * CPV.length)][0] : null;
  const remote = rnd() < 0.45;
  const dur = Math.round(20 + 100*rnd());
  const url = `https://${src}.example/listing/${seq}`;
  return {
    id: 'l_' + String(seq).padStart(7, '0'),
    src, ts: w, postedAt: weekDate(w),
    week: isoWeekStr(weekDate(w)),
    sourceUrl: url,
    lang, title, city, bundesland,
    cat: ['Reporting','Migration','Integration','Modernization','Automation','Compliance'][Math.floor(rnd()*6)],
    cpv, budget, budgetKind: bs.kind, dur, remote, hits
  };
}

function generate() {
  const listings = [];
  let seq = 1;
  for (const src of Object.keys(SOURCE_META)) {
    const meta = SOURCE_META[src];
    const rnd = lcg(srcSeed(src));
    for (let w=0; w<WEEKS; w++) {
      const t = w/WEEKS;
      const trend = src==='evergabe' ? 1 + 0.4*t : 1 + 0.7*t;
      const season = 1 + 0.18*Math.sin(2*Math.PI*((w%52)/52));
      const dip = (w%52===51)?0.55:1;
      const expect = meta.weeklyRate * trend * season * dip;
      const count = Math.max(0, Math.round(expect + noise(rnd, 0, expect*0.15)));
      for (let i=0; i<count; i++) listings.push(makeListing(seq++, src, w, rnd));
    }
  }
  return listings;
}

function main(){
  console.log('[demo-gen] generating 5y corpus...');
  const listings = generate();
  console.log(`[demo-gen] ${listings.length} listings`);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(__dirname, '../../web/data');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'demo.json');
  writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    weeks: WEEKS,
    nowDate: NOW.toISOString().slice(0,10),
    sources: SOURCE_META,
    dicts: Object.fromEntries(Object.entries(DICTS).map(([k,d]) => [k, { name: d.name, terms: d.terms.map(t => t.canonical) }])),
    listings
  }), 'utf8');
  console.log(`[demo-gen] wrote ${outFile} (${(JSON.stringify(listings).length/1e6).toFixed(1)} MB)`);
}

main();
