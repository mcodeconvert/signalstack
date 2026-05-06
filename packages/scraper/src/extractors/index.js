import ted from './ted.js';
import bund from './bund.js';
import hn from './hn.js';
import github from './github.js';
import junico from './junico.js';
import freelancermap from './freelancermap.js';
import remoteok from './remoteok.js';
import wwr from './wwr.js';
import freelance from './freelance.js';
import gulp from './gulp.js';
import twago from './twago.js';
import evergabe from './evergabe.js';

/** @type {Record<string, import('./_base.js').SourceExtractor>} */
export const EXTRACTORS = {
  ted, bund, hn, github, junico,
  freelancermap, remoteok, wwr,
  // stubs:
  freelance, gulp, twago, evergabe
};

/** Sources we actively scrape. */
export const ACTIVE_SOURCE_IDS = ['ted', 'bund', 'hn', 'github', 'junico', 'freelancermap', 'remoteok', 'wwr'];
