import { defaultEnrich } from './_base.js';

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'evergabe',
  nativeArchiveMonths: 60,
  async *fetch(since, signal) { if (false) yield null; },
  async parse() { return { status: 'error', message: 'evergabe.parse not implemented (Phase 4)' }; },
  enrich: defaultEnrich
};
export default extractor;
