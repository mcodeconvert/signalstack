import { defaultEnrich } from './_base.js';

/** @type {import('./_base.js').SourceExtractor} */
const extractor = {
  id: 'twago',
  nativeArchiveMonths: 12,
  async *fetch(since, signal) { if (false) yield null; },
  async parse() { return { status: 'error', message: 'twago.parse not implemented (Phase 4)' }; },
  enrich: defaultEnrich
};
export default extractor;
