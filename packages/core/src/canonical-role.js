/**
 * Canonical role + employer normalization.
 *
 * Pure deterministic functions, no deps. Designed to make
 * "Senior Backend Engineer", "Sr. Backend Eng", "Software Engineer Backend Senior"
 * all hash to the same canonical slug `engineer-backend-senior` so that
 * repost detection works.
 *
 * Output format: kebab-case, role-base first, then specializations,
 * then seniority. Always lowercase ASCII (umlauts converted).
 *
 * This is heuristic — won't catch every variation but should hit ~70-80%
 * of common DACH job-posting title patterns. Good enough as the foundation
 * of the Role-Recurrence Anomaly Alert (BP NEW-A iter-1 score 43/50).
 */

const SENIORITY = [
  ['junior', /\bjunior\b|\bjr\.?\b|\beinsteiger\b|\bberufseinsteiger\b/i],
  ['lead',   /\blead\b|\bteam ?lead\b|\bteamleiter\b|\bteamleitung\b/i],
  ['principal', /\bprincipal\b/i],
  ['staff',  /\bstaff\b/i],
  ['senior', /\bsenior\b|\bsr\.?\b|\berfahren\b/i],
  ['mid',    /\bmid[- ]?level\b|\bmittlere\b/i]
];

// Role-base — most general bucket.  Order matters: first match wins.
const ROLE_BASE = [
  ['engineer',   /\b(software\s+)?engineer\b|\beng\.?\b|\bentwickler\b|\bdeveloper\b|\bdev\.?\b|\bprogrammierer\b/i],
  ['consultant', /\bconsultant\b|\bberater\b|\bberaterin\b/i],
  ['architect',  /\barchitect\b|\barchitekt\b/i],
  ['manager',    /\bmanager\b|\bmanagerin\b|\bmanagement\b/i],
  ['lead',       /\blead\b|\bleiter\b|\bleiterin\b|\bleitung\b/i],
  ['analyst',    /\banalyst\b|\banalystin\b/i],
  ['designer',   /\bdesigner\b|\bdesignerin\b/i],
  ['scientist',  /\bscientist\b|\bwissenschaftler\b/i],
  ['admin',      /\badmin\b|\badministrator\b|\bsysadmin\b/i],
  ['operator',   /\boperator\b/i],
  ['pflegekraft',/\bpflegefachkraft\b|\bpflegekraft\b|\baltenpflegerin?\b|\bgesundheits-?\s*und\s+krankenpflegerin?\b/i],
  ['support',    /\bsupport\b|\bservice ?desk\b/i],
  ['recruiter',  /\brecruiter\b|\bpersonalbeschaffer\b/i],
  ['marketer',   /\bmarketing\b/i],
  ['sales',      /\bsales\b|\bvertrieb\b/i]
];

// Specializations — multiple may apply, output in matched order.
const SPEC = [
  ['backend',    /\bback[- ]?end\b/i],
  ['frontend',   /\bfront[- ]?end\b/i],
  ['fullstack',  /\bfull[- ]?stack\b/i],
  ['devops',     /\bdevops\b|\bsre\b|\bsite ?reliability\b/i],
  ['data',       /\bdata\b|\bdaten\b/i],
  ['ml',         /\bml\b|\bmachine[- ]?learning\b|\bai\b|\bki\b/i],
  ['cloud',      /\bcloud\b|\baws\b|\bazure\b|\bgcp\b/i],
  ['mobile',     /\bmobile\b|\bios\b|\bandroid\b/i],
  ['embedded',   /\bembedded\b|\bfirmware\b/i],
  ['security',   /\bsecurity\b|\bcyber\b|\binfo[- ]?sec\b/i],
  ['sap',        /\bsap\b/i],
  ['mm',         /\bmm\b(?!\s*\/)|\bmaterials\s+management\b/i],
  ['fi',         /\bfi\b(?!\s*\/)|\bfinance\b/i],
  ['hr',         /\bhr\b(?!\s*\/)|\bpersonalwesen\b/i],
  ['quereinsteiger', /\bquerein(?:steiger|stieg)\b|\bcareer ?changer\b/i],
  ['nrw',        /\bnrw\b|\bnordrhein-westfalen\b/i],
  ['bayern',     /\bbayern\b|\bbavaria\b/i],
  ['ambulant',   /\bambulant\b/i],
  ['stationaer', /\bstation(ä|ae)r\b/i]
];

const COMPANY_SUFFIXES = /\s*(GmbH(\s*&\s*Co\.?\s*KG)?|AG|SE|UG|KG|e\.? ?V\.?|Sp\.\s*z\s*o\.\s*o\.?|Inc\.?|Ltd\.?|LLC|S\.A\.|S\.R\.L\.|GbR|OHG|Stiftung|c\/o\s+.*)\s*$/i;

/** Normalize a job title to a canonical kebab-case slug. */
export function canonicalRole(title) {
  if (!title) return null;
  const s = String(title).trim();
  if (!s) return null;

  let seniority = null;
  for (const [tag, re] of SENIORITY) {
    if (re.test(s)) { seniority = tag; break; }
  }

  let role = null;
  for (const [tag, re] of ROLE_BASE) {
    if (re.test(s)) { role = tag; break; }
  }

  const specs = [];
  for (const [tag, re] of SPEC) {
    if (re.test(s)) specs.push(tag);
  }

  if (!role && specs.length === 0 && !seniority) {
    // No structure detected — fall back to slugified title (capped) to retain some signal.
    const slug = slugify(s).split('-').slice(0, 4).join('-');
    return slug || null;
  }

  const parts = [role, ...specs, seniority].filter(Boolean);
  return parts.join('-') || null;
}

/** Normalize an employer name to a canonical kebab-case slug. */
export function canonicalEmployer(name) {
  if (!name) return null;
  let s = String(name).trim();
  if (!s) return null;
  // Strip common company-form suffixes
  s = s.replace(COMPANY_SUFFIXES, '').trim();
  return slugify(s) || null;
}

function slugify(s) {
  // Order matters: replace German umlauts FIRST (so ü → ue), then strip
  // remaining diacritics (é → e, etc.), then collapse to kebab-case.
  return String(s)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/\p{M}/gu, '')   // strip remaining combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
