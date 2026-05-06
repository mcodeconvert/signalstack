/**
 * Free-text word frequency analysis across listing titles + descriptions.
 *
 * Strips stopwords (DE + EN), pure numbers, very short tokens, and common
 * boilerplate. Returns ranked [word, count] pairs.
 */

/** German stopwords — articles, pronouns, prepositions, common verbs/aux. */
const STOPWORDS_DE = new Set([
  // Articles
  'der','die','das','den','dem','des','ein','eine','einen','einem','einer','eines',
  // Pronouns
  'ich','du','er','sie','es','wir','ihr','mich','dich','sich','mir','dir','ihn','ihm','ihnen','uns','euch',
  'mein','meine','meinen','meinem','meiner','meines','dein','deine','deinen','sein','seine','seinen',
  'unser','unsere','euer','eure','ihre','ihren','ihrem','ihrer',
  // Conjunctions
  'und','oder','aber','doch','sondern','denn','weil','da','dass','daß','ob','wenn','falls','als','wie',
  'sowie','sowohl','entweder','weder','noch',
  // Prepositions
  'mit','ohne','für','gegen','durch','um','bei','von','zu','vor','nach','über','unter','zwischen',
  'in','an','auf','im','am','beim','vom','zum','zur','ans','ins','aus','seit','während',
  // Verbs (sein, haben, werden, modalverben)
  'bin','bist','ist','sind','seid','war','waren','warst','sein','gewesen','wäre','wären','sei',
  'habe','hast','hat','haben','hatte','hatten','hätte','hätten','gehabt',
  'werde','wirst','wird','werden','wurde','wurden','würde','würden','geworden',
  'kann','kannst','könnt','können','konnte','konnten','könnte',
  'muss','musst','müsst','müssen','musste','mussten','müsste',
  'will','willst','wollt','wollen','wollte','wollten',
  'soll','sollst','sollt','sollen','sollte','sollten',
  'darf','darfst','dürft','dürfen','durfte','durften',
  'mag','magst','mögt','mögen','mochte','mochten','möchte','möchten',
  'tut','tun','tat','taten',
  // Negation / particles
  'nicht','kein','keine','keinen','keinem','keiner','keines','nichts','niemand','nie','niemals',
  // Common adverbs
  'auch','noch','nur','schon','sehr','mal','immer','heute','morgen','gestern','jetzt','damals',
  'hier','dort','oben','unten','vorne','hinten','rechts','links','dabei','dadurch','daher','darum','deshalb','deswegen',
  'also','sogar','etwa','etwas','irgendwie','irgendwo','irgendwann','irgendeine','irgendein',
  // Quantifiers
  'alle','alles','viele','vielen','vieles','einige','einigen','manche','wenige','jeder','jede','jedes','jeden','jedem',
  // Misc filler
  'man','jemand','jeder','dies','dieser','diese','dieses','diesen','diesem',
  'um','weiter','ggf','bzw','usw','z.b','zb','d.h','dh','ca',
  // Numbers as words
  'eins','zwei','drei','vier','fünf','sechs','sieben','acht','neun','zehn','hundert','tausend',
  // Months / weekdays
  'januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember',
  'montag','dienstag','mittwoch','donnerstag','freitag','samstag','sonntag',
  // Common noisy words from titles
  'gesucht','suchen','sucht','bietet','bieten','anbieten','angebot','angebote',
  'erstellen','erstellung','machen','helfen','hilfe','unterstützung'
]);

/** English stopwords. */
const STOPWORDS_EN = new Set([
  'the','a','an','and','or','but','if','then','so','because','as','than','though','although',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their','mine','yours','hers','ours','theirs',
  'this','that','these','those','here','there','where','when','why','how','what','who','whom','whose','which',
  'am','is','are','was','were','be','been','being',
  'have','has','had','having','do','does','did','done','doing',
  'will','would','shall','should','can','could','may','might','must','ought',
  'not','no','none','never','nothing','nobody','nowhere',
  'in','on','at','by','for','with','without','of','from','to','about','into','through','over','under',
  'between','among','before','after','during','since','until','while',
  'all','any','some','many','few','several','each','every','both','either','neither',
  'also','only','just','very','more','most','less','least','too','quite','rather','really',
  'now','today','tomorrow','yesterday','always','sometimes','often','usually','rarely',
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'http','https','www','com','org','net','de','en','co',
  'show','hn','ago','re','said','says','say','use','using','used',
  'looking','find','finding','found','need','needed','needs','wants','want','wanted',
  'good','great','best','better','make','making','made','get','getting','got'
]);

/** Source-specific filler words to suppress. */
const FILLER = new Set([
  'deutschland','germany','europe','euro','eu','de',
  'gmbh','ag','kg','co','ohg',
  'mwd','herr','frau',
  'bekanntmachung','vergabe','vergaben','vergabeverfahren',
  'auftrag','aufträge','aufträgen',
  'show','hn','self','hosted',
  'github','gitlab','repo','repository','readme','docs',
  'project','projekt','projekte','projekten',
  'service','services','dienst','dienste','dienstleistung','dienstleistungen',
  'vertrag','verträge','rahmenvertrag',
  'arbeit','arbeiten','arbeitnehmer','arbeitgeber'
]);

/** Strip HTML, lowercase, split on non-letter characters. */
export function tokenize(text) {
  if (!text) return [];
  const clean = String(text).toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
  // Keep umlauts and ß; allow words with internal hyphens.
  const tokens = clean.match(/[a-zäöüß][a-zäöüß0-9-]{2,}/g) ?? [];
  return tokens;
}

/** Whether a token is filler / stopword / pure number / too short. */
export function isStop(token, opts = {}) {
  if (token.length < 3) return true;
  if (token.length > 40) return true;
  if (/^[0-9]+$/.test(token)) return true;
  if (/^-+$/.test(token)) return true;
  if (token.startsWith('-') || token.endsWith('-')) return true;
  if (STOPWORDS_DE.has(token)) return true;
  if (STOPWORDS_EN.has(token)) return true;
  if (!opts.keepFiller && FILLER.has(token)) return true;
  return false;
}

/**
 * Count word frequencies across a listing array (title + description).
 * Returns array of [word, count, listingsHits] sorted by count desc.
 *
 * @param {Array<{title?: string, description?: string}>} listings
 * @param {object} [opts]
 * @param {boolean} [opts.keepFiller]   include FILLER (gmbh, project…)
 * @param {number}  [opts.minCount]     minimum count threshold (default 2)
 * @param {boolean} [opts.titleOnly]    score titles only (faster, sharper)
 */
export function wordFrequency(listings, opts = {}) {
  const minCount = opts.minCount ?? 2;
  /** @type {Map<string, { c: number, l: Set<number> }>} */
  const map = new Map();
  let i = 0;
  for (const l of listings) {
    const text = opts.titleOnly
      ? (l.title ?? '')
      : (l.title ?? '') + ' ' + (l.description ?? '');
    const tokens = tokenize(text);
    const seen = new Set();
    for (const t of tokens) {
      if (isStop(t, opts)) continue;
      if (seen.has(t)) {
        // already counted listingsHits for this word in this listing
        const e = map.get(t); e.c++;
      } else {
        seen.add(t);
        let e = map.get(t);
        if (!e) { e = { c: 0, l: new Set() }; map.set(t, e); }
        e.c++;
        e.l.add(i);
      }
    }
    i++;
  }
  /** @type {Array<[string, number, number]>} */
  const out = [];
  for (const [w, e] of map) {
    if (e.c < minCount) continue;
    out.push([w, e.c, e.l.size]);
  }
  out.sort((a, b) => b[1] - a[1]);
  return out;
}
