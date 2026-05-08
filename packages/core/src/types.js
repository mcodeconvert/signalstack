/**
 * @typedef {object} RawDoc
 * @property {string} sourceId
 * @property {string} url
 * @property {Buffer|string} body
 * @property {number} httpStatus
 * @property {Date} fetchedAt
 * @property {string} contentHash
 */

/**
 * @typedef {object} ParsedListing
 * @property {string} sourceId
 * @property {string} sourceUrl
 * @property {string} title
 * @property {string} description
 * @property {Date} postedAt
 * @property {string} [language]
 * @property {string} [category]
 * @property {string} [cpvCode]
 * @property {number} [budgetEur]
 * @property {'day'|'hour'|'project'|'monthly'} [budgetKind]
 * @property {number} [durationDays]
 * @property {string} [city]
 * @property {string} [bundesland]
 * @property {boolean} [remote]
 * @property {string} [clientHash]
 * @property {string} [subtype] W3: per-source subtype (hn 'show'/'ask'/'discuss', bund 'rfp'/'stelle', etc.)
 * @property {string} [topicCluster] W3: github topic-or-query cluster id
 * @property {string} [canonicalRole] W3: normalized role slug for repost detection
 * @property {string} [canonicalEmployer] W3: normalized employer slug
 * @property {string[]} [techStack] W3: detected tech tags (D1 Tools dictionary matches)
 * @property {string} [cpvCluster] W3: TED CPV-code 2-digit prefix
 * @property {object} [_velocity] W3: github-only — { stars, forks, lastCommit } for stars_velocity table
 */

/**
 * @typedef {object} TermHit
 * @property {string} listingId
 * @property {string} dictKey
 * @property {string} term
 * @property {number} hitCount
 * @property {number} confidence
 * @property {boolean} inTitle
 * @property {string} context
 * @property {number} dictVersion
 */

/**
 * @typedef {object} Listing
 * @property {string} id
 * @property {string} sourceId
 * @property {string} sourceUrl
 * @property {Date} postedAt
 * @property {Date} ingestedAt
 * @property {string|null} language
 * @property {string} title
 * @property {string} description
 * @property {string|null} category
 * @property {string|null} cpvCode
 * @property {number|null} budgetEur
 * @property {string|null} budgetKind
 * @property {number|null} durationDays
 * @property {string|null} city
 * @property {string|null} bundesland
 * @property {boolean|null} remote
 * @property {string|null} clientHash
 * @property {number} schemaVersion
 * @property {boolean} isCanonical
 */

/**
 * @typedef {object} Dictionary
 * @property {string} key
 * @property {string} name
 * @property {Array<{ term: string, aliases: string[] }>} terms
 * @property {number} version
 */

/**
 * @typedef {object} ParseResult
 * @property {'ok'} status
 * @property {ParsedListing} listing
 */
/**
 * @typedef {object} ParseError
 * @property {'error'} status
 * @property {string} message
 * @property {string} [stack]
 */

export const SCHEMA_VERSION = 1;
export const DICT_VERSION = 1;

/** @type {readonly string[]} */
export const SOURCE_IDS = Object.freeze([
  'ted', 'bund', 'hn', 'github',
  'junico', 'freelancermap', 'remoteok', 'wwr',
  'arbeitnow', 'nofluffjobs'
]);

/** @type {Record<string, { id: string, name: string, color: string, archiveMonths: number, weeklyRate: number, lang: string }>} */
export const SOURCE_META = Object.freeze({
  // Public procurement + market signal
  ted:           { id: 'ted',           name: 'TED · EU',         color: '#1a1a1a', archiveMonths: 60, weeklyRate: 600, lang: 'DE' },
  bund:          { id: 'bund',          name: 'service.bund.de',  color: '#5a7355', archiveMonths: 1,  weeklyRate: 80,  lang: 'DE' },
  hn:            { id: 'hn',            name: 'Hacker News',      color: '#c4423b', archiveMonths: 60, weeklyRate: 50,  lang: 'EN' },
  github:        { id: 'github',        name: 'GitHub',           color: '#3d5a80', archiveMonths: 60, weeklyRate: 60,  lang: 'EN' },
  // Freelance / remote-project sources
  junico:        { id: 'junico',        name: 'Junico.de',        color: '#9d6b53', archiveMonths: 6,  weeklyRate: 5,   lang: 'DE' },
  freelancermap: { id: 'freelancermap', name: 'freelancermap.de', color: '#e3a23c', archiveMonths: 6,  weeklyRate: 80,  lang: 'DE' },
  remoteok:      { id: 'remoteok',      name: 'RemoteOK',         color: '#3d5a80', archiveMonths: 1,  weeklyRate: 90,  lang: 'EN' },
  wwr:           { id: 'wwr',           name: 'WeWorkRemotely',   color: '#5a7355', archiveMonths: 1,  weeklyRate: 70,  lang: 'EN' },
  arbeitnow:     { id: 'arbeitnow',     name: 'arbeitnow',        color: '#5a7355', archiveMonths: 3,  weeklyRate: 500, lang: 'DE' },
  nofluffjobs:   { id: 'nofluffjobs',   name: 'NoFluffJobs',      color: '#9d6b53', archiveMonths: 1,  weeklyRate: 200, lang: 'EN' }
  // W1 dropped (low DACH-SaaS-mining ROI): jobicy, remotive, workingnomads, himalayas
});
