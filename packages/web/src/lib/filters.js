/**
 * Filter encode/decode shared between server and client.
 */
export function defaultFilter() {
  return { time: '5y', sources: ['ted','bund','hn','github'], lang: 'all', dict: 'D1', terms: [], mode: 'any', search: '' };
}

export function parseFilter(searchParams) {
  const f = defaultFilter();
  if (searchParams.has('t')) f.time = searchParams.get('t');
  if (searchParams.has('s')) f.sources = searchParams.get('s').split(',').filter(Boolean);
  if (searchParams.has('l')) f.lang = searchParams.get('l');
  if (searchParams.has('d')) f.dict = searchParams.get('d');
  if (searchParams.has('terms')) f.terms = searchParams.get('terms').split(',').filter(Boolean);
  if (searchParams.has('m')) f.mode = searchParams.get('m') === 'all' ? 'all' : 'any';
  if (searchParams.has('q')) f.search = searchParams.get('q');
  if (searchParams.has('v')) f.vertical = searchParams.get('v');
  return f;
}

export function encodeFilter(f) {
  const u = new URLSearchParams();
  if (f.time && f.time !== '5y') u.set('t', f.time);
  if (f.sources && f.sources.length < 4) u.set('s', f.sources.join(','));
  if (f.lang && f.lang !== 'all') u.set('l', f.lang);
  if (f.dict && f.dict !== 'D1') u.set('d', f.dict);
  if (f.terms?.length) u.set('terms', f.terms.join(','));
  if (f.mode && f.mode !== 'any') u.set('m', f.mode);
  if (f.search) u.set('q', f.search);
  if (f.vertical) u.set('v', f.vertical);
  return u.toString();
}

/** Build a /records URL with given filter overrides applied to the base. */
export function recordsUrl(base, overrides = {}) {
  const f = { ...base, ...overrides };
  const qs = encodeFilter(f);
  return `/records${qs ? '?' + qs : ''}`;
}
