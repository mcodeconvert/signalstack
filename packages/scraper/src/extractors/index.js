import ted from './ted.js';
import bund from './bund.js';
import hn from './hn.js';
import github from './github.js';
import junico from './junico.js';
import freelancermap from './freelancermap.js';
import remoteok from './remoteok.js';
import wwr from './wwr.js';
import arbeitnow from './arbeitnow.js';
import nofluffjobs from './nofluffjobs.js';
import freelance from './freelance.js';
import gulp from './gulp.js';
import twago from './twago.js';
import evergabe from './evergabe.js';
// W1: dropped from active set due to low DACH-SaaS-mining ROI
//   jobicy, remotive, workingnomads, himalayas, jobspresso
// Files retained on disk for revert; not imported into the registry.

/** @type {Record<string, import('./_base.js').SourceExtractor>} */
export const EXTRACTORS = {
  ted, bund, hn, github,
  junico, freelancermap, remoteok, wwr,
  arbeitnow, nofluffjobs,
  // stubs:
  freelance, gulp, twago, evergabe
};

/** Sources we actively scrape (post-W1 rebalance — 10 active). */
export const ACTIVE_SOURCE_IDS = [
  'ted', 'bund', 'hn', 'github',
  'junico', 'freelancermap', 'remoteok', 'wwr',
  'arbeitnow', 'nofluffjobs'
];

/** The freelance / remote-project sources (subset of active). */
export const FREELANCE_SOURCE_IDS = [
  'junico', 'freelancermap', 'remoteok', 'wwr',
  'arbeitnow', 'nofluffjobs'
];
