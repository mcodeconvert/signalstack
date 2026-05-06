/**
 * SourceExtractor contract.
 *
 * Each concrete extractor exports a default object implementing this shape.
 * The runner orchestrates fetch → parse → enrich → emit; the extractor is
 * responsible only for the source-specific bits.
 *
 * @typedef {object} SourceExtractor
 * @property {string} id                              source identifier (matches SOURCE_META key)
 * @property {number} nativeArchiveMonths             how far back the source exposes
 * @property {(since: Date|null, signal?: AbortSignal) => AsyncIterable<import('@signalstack/core/types').RawDoc>} fetch
 * @property {(raw: import('@signalstack/core/types').RawDoc) => Promise<import('@signalstack/core/types').ParseResult|import('@signalstack/core/types').ParseError>} parse
 * @property {(parsed: import('@signalstack/core/types').ParsedListing) => Promise<import('@signalstack/core/types').ParsedListing>} enrich
 */

import { contentHash } from '@signalstack/core/fingerprint';

/**
 * Helper: build a RawDoc from a fetched HTTP response body.
 * @param {string} sourceId
 * @param {string} url
 * @param {Buffer|string} body
 * @param {number} httpStatus
 * @returns {import('@signalstack/core/types').RawDoc}
 */
export function makeRaw(sourceId, url, body, httpStatus = 200) {
  return {
    sourceId,
    url,
    body,
    httpStatus,
    fetchedAt: new Date(),
    contentHash: contentHash(body)
  };
}

/**
 * Default no-op enrich — concrete extractors override.
 * @param {import('@signalstack/core/types').ParsedListing} parsed
 */
export async function defaultEnrich(parsed) {
  return parsed;
}
