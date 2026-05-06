/**
 * GULP.de extractor — Playwright (JS-rendered listings).
 * Stub: same contract as freelance, fetch is unimplemented.
 * Phase 4 plug-in target.
 */
import { defaultEnrich } from './_base.js';

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'gulp',
  nativeArchiveMonths: 18,

  async *fetch(since, signal) {
    // TODO Phase 4: Playwright pool, list-page pagination, detail pages.
    // For now: silent no-op so the runner can include this source without crashing.
    if (false) yield null;
  },

  async parse(raw) {
    return { status: 'error', message: 'gulp.parse not implemented (Phase 4)' };
  },

  enrich: defaultEnrich
};
export default extractor;
