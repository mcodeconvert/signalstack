import ted from './ted.js';
import freelance from './freelance.js';
import gulp from './gulp.js';
import twago from './twago.js';
import junico from './junico.js';
import evergabe from './evergabe.js';

/** @type {Record<string, import('./_base.js').SourceExtractor>} */
export const EXTRACTORS = { ted, freelance, gulp, twago, junico, evergabe };
