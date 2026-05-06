/**
 * Normalization helpers — geo, currency, language, dates.
 * Vanilla JS, no deps.
 */

/** German cities → Bundesland ISO code (subset, expand as needed). */
const CITY_TO_BL = {
  'München': 'BY', 'Nürnberg': 'BY', 'Augsburg': 'BY', 'Würzburg': 'BY', 'Regensburg': 'BY',
  'Stuttgart': 'BW', 'Karlsruhe': 'BW', 'Mannheim': 'BW', 'Freiburg': 'BW', 'Heidelberg': 'BW',
  'Berlin': 'BE',
  'Hamburg': 'HH',
  'Bremen': 'HB',
  'Frankfurt': 'HE', 'Frankfurt am Main': 'HE', 'Wiesbaden': 'HE', 'Kassel': 'HE',
  'Köln': 'NW', 'Düsseldorf': 'NW', 'Dortmund': 'NW', 'Essen': 'NW', 'Bonn': 'NW',
  'Wuppertal': 'NW', 'Aachen': 'NW', 'Münster': 'NW', 'Bochum': 'NW',
  'Hannover': 'NI', 'Braunschweig': 'NI', 'Osnabrück': 'NI',
  'Dresden': 'SN', 'Leipzig': 'SN', 'Chemnitz': 'SN',
  'Magdeburg': 'ST', 'Halle': 'ST',
  'Erfurt': 'TH', 'Jena': 'TH',
  'Mainz': 'RP', 'Koblenz': 'RP', 'Trier': 'RP',
  'Saarbrücken': 'SL',
  'Schwerin': 'MV', 'Rostock': 'MV',
  'Kiel': 'SH', 'Lübeck': 'SH',
  'Potsdam': 'BB'
};

/**
 * @param {string|null|undefined} raw
 * @returns {{ city: string|null, bundesland: string|null }}
 */
export function normalizeGeo(raw) {
  if (!raw) return { city: null, bundesland: null };
  const trimmed = raw.trim();
  // exact
  if (CITY_TO_BL[trimmed]) return { city: trimmed, bundesland: CITY_TO_BL[trimmed] };
  // case-insensitive lookup
  const ci = Object.keys(CITY_TO_BL).find(k => k.toLowerCase() === trimmed.toLowerCase());
  if (ci) return { city: ci, bundesland: CITY_TO_BL[ci] };
  // first-token try
  const first = trimmed.split(/[,/;]/)[0].trim();
  if (CITY_TO_BL[first]) return { city: first, bundesland: CITY_TO_BL[first] };
  return { city: trimmed, bundesland: null };
}

/**
 * Detect language with a tiny heuristic — sufficient for DACH freelance content.
 * Returns 'DE' or 'EN' or null.
 * @param {string} text
 */
export function detectLang(text) {
  if (!text || text.length < 20) return null;
  const t = text.toLowerCase();
  let de = 0, en = 0;
  // common stopwords
  for (const w of ['der ', 'die ', 'das ', 'und ', 'für ', 'mit ', 'von ', 'wir ', 'sind ', 'eine ']) if (t.includes(w)) de += 2;
  for (const w of ['the ', ' and ', ' for ', ' with ', ' from ', ' we ', ' are ', ' is ']) if (t.includes(w)) en += 2;
  // umlauts
  if (/[äöüß]/.test(t)) de += 3;
  if (de === 0 && en === 0) return null;
  return de >= en ? 'DE' : 'EN';
}

/**
 * Parse budget hints from a string like "€800/Tag", "ab 1500 EUR/Tag", "80€/h", "500.000 €".
 * @param {string} raw
 * @returns {{ budgetEur: number|null, budgetKind: 'day'|'hour'|'project'|'monthly'|null }}
 */
export function parseBudget(raw) {
  if (!raw) return { budgetEur: null, budgetKind: null };
  const s = raw.replace(/ /g, ' ').trim();
  // numeric extraction
  const numMatch = s.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?)\s*(?:€|EUR)/i)
    ?? s.match(/(\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?)/);
  if (!numMatch) return { budgetEur: null, budgetKind: null };
  let num = numMatch[1].replace(/[.\s](?=\d{3}\b)/g, '').replace(',', '.');
  const value = Number(num);
  if (!isFinite(value) || value <= 0) return { budgetEur: null, budgetKind: null };

  /** @type {'day'|'hour'|'project'|'monthly'} */
  let kind = 'project';
  if (/\b(pro\s+)?Tag\b|\/\s*Tag|\/d|\/day/i.test(s)) kind = 'day';
  else if (/\b(pro\s+)?Stunde\b|\/\s*h\b|\/hr|\/hour/i.test(s)) kind = 'hour';
  else if (/\bMonat\b|\/\s*Monat|\/mo/i.test(s)) kind = 'monthly';
  return { budgetEur: Math.round(value), budgetKind: kind };
}

/**
 * Parse a German or ISO date hint into a Date.
 * Returns null on failure.
 * @param {string} raw
 */
export function parseDate(raw) {
  if (!raw) return null;
  const s = raw.trim();
  // ISO
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }
  // German DD.MM.YYYY (UTC to avoid TZ shifts on .toISOString())
  const de = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) {
    const d = new Date(Date.UTC(Number(de[3]), Number(de[2]) - 1, Number(de[1])));
    if (!isNaN(d.getTime())) return d;
  }
  // RFC 2822 / native fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** ISO Monday-week of the date. e.g. "2026-W18". */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Monday-of-ISO-week as a Date (UTC). */
export function isoWeekStart(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
