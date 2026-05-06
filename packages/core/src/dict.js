import { DICT_VERSION } from './types.js';

/**
 * D1-D7 dictionaries. Each term may have aliases for matching.
 * Stored as arrays of [term, ...aliases] for compactness.
 * @type {Record<string, { name: string, terms: Array<string[]> }>}
 */
const RAW = {
  D1: {
    name: 'Tools',
    terms: [
      ['SAP'], ['DATEV'], ['Excel'], ['Power BI', 'PowerBI', 'MS Power BI'], ['Tableau'],
      ['Salesforce'], ['HubSpot'], ['Lexware'], ['sevdesk'], ['Lexoffice', 'lexoffice'],
      ['MS Dynamics', 'Microsoft Dynamics', 'Dynamics 365'], ['Jira'], ['Confluence'],
      ['Snowflake'], ['BigQuery'], ['Postgres', 'PostgreSQL'], ['Looker'], ['Metabase'],
      ['Talend'], ['Alteryx']
    ]
  },
  D2: {
    name: 'Verbs',
    terms: [
      ['automatisieren', 'automatisiert', 'Automatisierung'],
      ['migrieren', 'Migration', 'migriert', 'Datenmigration'],
      ['integrieren', 'Integration', 'integriert'],
      ['synchronisieren', 'sync', 'Sync'],
      ['konsolidieren', 'Konsolidierung'],
      ['anbinden', 'Anbindung', 'anbindet', 'angebunden'],
      ['ablösen', 'Ablösung'],
      ['reporten', 'Reporting'], ['auswerten', 'Auswertung'], ['analysieren', 'Analyse'],
      ['bereinigen', 'Bereinigung'], ['normalisieren', 'Normalisierung'],
      ['importieren', 'Import'], ['exportieren', 'Export'],
      ['automate'], ['migrate'], ['integrate'], ['ETL'], ['pipeline']
    ]
  },
  D3: {
    name: 'Pain',
    terms: [
      ['manuell', 'manuelle Pflege'], ['händisch'], ['Excel-Hölle', 'Excel Hölle'],
      ['nervt'], ['umständlich'], ['redundant'], ['doppelt erfasst'],
      ['Medienbruch'], ['Insellösung'], ['Workaround'], ['fehleranfällig'],
      ['Zeitfresser'], ['painful'], ['error-prone']
    ]
  },
  D4: {
    name: 'Interface',
    terms: [
      ['Schnittstelle'], ['API'], ['REST'], ['SOAP'], ['IDoc'], ['EDI'],
      ['XRechnung'], ['ZUGFeRD'], ['DATEV-Schnittstelle'], ['SAP-Schnittstelle'],
      ['CSV-Import'], ['Webhook'], ['Konnektor'], ['ODBC'], ['OData']
    ]
  },
  D5: {
    name: 'Reg',
    terms: [
      ['DSGVO', 'GDPR'], ['GoBD'], ['CSRD'], ['CBAM'], ['EUDR'], ['LkSG', 'Lieferkettengesetz'],
      ['NIS2'], ['e-Rechnung', 'eRechnung', 'E-Rechnung'], ['XRechnung'], ['ZUGFeRD'],
      ['ZATCA'], ['Mietpreisbremse'], ['Heizkostenverordnung']
    ]
  },
  D6: {
    name: 'Industry',
    terms: [
      ['Mittelstand'], ['Handwerk'], ['Gastronomie'], ['Maschinenbau'],
      ['Metallverarbeitung'], ['Automotive'], ['Logistik'], ['Hausverwaltung'],
      ['Steuerberater'], ['Gesundheitswesen'], ['Pflege'], ['Einzelhandel'],
      ['Großhandel'], ['Bauwesen'], ['Chemie'], ['Pharma'], ['Energie']
    ]
  },
  D7: {
    name: 'Roles',
    terms: [
      ['Geschäftsführer', 'GF'], ['Inhaber'], ['Produktionsleiter'], ['Werksleiter'],
      ['Controller'], ['kaufmännischer Leiter', 'kaufm. Leiter'], ['IT-Leiter'],
      ['CFO'], ['Buchhalter'], ['Bilanzbuchhalter'], ['Steuerfachangestellte', 'Steuerfachangest.'],
      ['Hausverwalter'], ['Vermieter']
    ]
  }
};

/**
 * Loaded dictionaries with computed match data.
 * @type {Record<string, { key: string, name: string, version: number, terms: Array<{ canonical: string, aliases: string[], pattern: RegExp }> }>}
 */
export const DICTS = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW).map(([key, d]) => [
      key,
      {
        key,
        name: d.name,
        version: DICT_VERSION,
        terms: d.terms.map(forms => ({
          canonical: forms[0],
          aliases: forms.slice(1),
          pattern: buildPattern(forms)
        }))
      }
    ])
  )
);

/** @returns {string[]} list of dict keys */
export function dictKeys() {
  return Object.keys(DICTS);
}

/** @returns {string[]} canonical terms in a dictionary */
export function termsOf(dictKey) {
  return DICTS[dictKey].terms.map(t => t.canonical);
}

/** Build a single regex with word boundaries for all forms */
function buildPattern(forms) {
  const escaped = forms.map(escapeRegex).sort((a, b) => b.length - a.length);
  // German word boundary: \b doesn't handle umlauts perfectly, but for term matching inside content
  // we use lookarounds for non-word chars or string boundaries.
  const body = escaped.join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${body})(?![\\p{L}\\p{N}_-])`, 'giu');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
