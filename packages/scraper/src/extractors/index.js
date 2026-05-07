import ted from './ted.js';
import bund from './bund.js';
import hn from './hn.js';
import github from './github.js';
import junico from './junico.js';
import freelancermap from './freelancermap.js';
import remoteok from './remoteok.js';
import wwr from './wwr.js';
import remotive from './remotive.js';
import jobicy from './jobicy.js';
import arbeitnow from './arbeitnow.js';
import himalayas from './himalayas.js';
import jobspresso from './jobspresso.js';
import nofluffjobs from './nofluffjobs.js';
import workingnomads from './workingnomads.js';
import freelance from './freelance.js';
import gulp from './gulp.js';
import twago from './twago.js';
import evergabe from './evergabe.js';

/** @type {Record<string, import('./_base.js').SourceExtractor>} */
export const EXTRACTORS = {
  ted, bund, hn, github,
  junico, freelancermap, remoteok, wwr,
  remotive, jobicy, arbeitnow, himalayas, jobspresso, nofluffjobs, workingnomads,
  // stubs:
  freelance, gulp, twago, evergabe
};

/** Sources we actively scrape. Jobspresso kept registered but excluded — feed currently has 0 items. */
export const ACTIVE_SOURCE_IDS = [
  'ted', 'bund', 'hn', 'github',
  'junico', 'freelancermap', 'remoteok', 'wwr',
  'remotive', 'jobicy', 'arbeitnow', 'himalayas', 'nofluffjobs', 'workingnomads'
];

/** The 10 freelance / remote-project sources (subset of active). */
export const FREELANCE_SOURCE_IDS = [
  'junico', 'freelancermap', 'remoteok', 'wwr',
  'remotive', 'jobicy', 'arbeitnow', 'himalayas', 'nofluffjobs', 'workingnomads'
];
