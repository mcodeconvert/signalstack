import ted from './ted.js';
import bund from './bund.js';
import hn from './hn.js';
import github from './github.js';
import freelance from './freelance.js';
import gulp from './gulp.js';
import twago from './twago.js';
import junico from './junico.js';
import evergabe from './evergabe.js';

/** @type {Record<string, import('./_base.js').SourceExtractor>} */
export const EXTRACTORS = {
  ted, bund, hn, github,
  // legacy stubs (kept so pipeline can iterate but they no-op):
  freelance, gulp, twago, junico, evergabe
};

/** Sources we actively scrape. */
export const ACTIVE_SOURCE_IDS = ['ted', 'bund', 'hn', 'github'];
