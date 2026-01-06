/**
 * Character-level data builder
 * Converts segments with word-level timestamps into character/token units
 */

import type { Segment, CharUnit } from '../types/asr';
import { tokenizeText, getNonSpaceTokens } from './tokenizer';

/**
 * Minimum duration for a token when timing data is incomplete (in milliseconds)
 */
const MIN_TOKEN_DURATION = 100;

/**
 * Builds character-level data from segments
 *
 * This function converts segment-level ASR results into token-level units,
 * where each unit represents a word, number, or character with precise timing.
 *
 * Algorithm:
 * 1. Tokenize segment text into words/numbers/characters
 * 2. Filter out space tokens (they don't have timestamps)
 * 3. Match tokens with timestamp array from FunASR
 * 4. For tokens beyond timestamp array, distribute remaining time evenly
 * 5. If no timestamps, distribute segment duration evenly
 *
 * @param segments - Array of ASR segments with optional word-level timestamps
 * @returns Array of character units for character-level editing
 *
 * @example
 * const segments = [{
 *   text: "Hello 你好",
 *   start: 0,
 *   end: 2000,
 *   spk: 0,
 *   timestamp: [[0, 800], [800, 1200], [1200, 2000]]
 * }];
 * const units = buildCharLevelData(segments);
 * // units[0]: { char: "Hello", start: 0, end: 800, ... }
 * // units[1]: { char: "你", start: 800, end: 1200, ... }
 * // units[2]: { char: "好", start: 1200, end: 2000, ... }
 */
export function buildCharLevelData(segments: Segment[]): CharUnit[] {
  const units: CharUnit[] = [];

  segments.forEach((seg, segIndex) => {
    const text = seg.text || '';
    const timestamps = seg.timestamp || [];
    const segStart = seg.start || 0;
    const segEnd = seg.end || segStart;
    const spk = seg.spk;

    // Tokenize the text into words/numbers/characters
    const tokens = tokenizeText(text);

    // Filter out space tokens (spaces don't have corresponding timestamps)
    const nonSpaceTokens = getNonSpaceTokens(tokens);

    // If we have timestamp array, use it
    if (Array.isArray(timestamps) && timestamps.length > 0) {
      nonSpaceTokens.forEach((token, tokenIndex) => {
        let start: number;
        let end: number;

        if (tokenIndex < timestamps.length) {
          // Use corresponding timestamp
          const ts = timestamps[tokenIndex];
          start = Array.isArray(ts) && ts.length >= 1 ? ts[0] : segStart;
          end = Array.isArray(ts) && ts.length >= 2 ? ts[1] : start;
        } else {
          // Beyond timestamp array - distribute remaining time
          const lastTs = timestamps[timestamps.length - 1];
          const lastEnd = Array.isArray(lastTs) && lastTs.length >= 2 ? lastTs[1] : segStart;
          const remainingTokens = nonSpaceTokens.length - timestamps.length;
          const remainingTime = Math.max(segEnd - lastEnd, 0);

          let tokenDuration: number;
          if (remainingTime > 0 && remainingTokens > 0) {
            tokenDuration = remainingTime / remainingTokens;
          } else {
            tokenDuration = MIN_TOKEN_DURATION;
          }

          const offset = tokenIndex - timestamps.length;
          start = lastEnd + offset * tokenDuration;
          end = start + tokenDuration;
        }

        units.push({
          char: token.text,
          start: start,
          end: end,
          segmentIndex: segIndex,
          charIndex: token.startIdx,
          spk: spk,
          previewable: true,
          type: token.type
        });
      });
    } else {
      // No timestamps - distribute segment duration evenly
      const duration = segEnd - segStart;
      const tokenDuration = nonSpaceTokens.length > 0 ? duration / nonSpaceTokens.length : 0;
      let currentTime = segStart;

      nonSpaceTokens.forEach((token) => {
        const start = currentTime;
        const end = currentTime + tokenDuration;

        units.push({
          char: token.text,
          start: start,
          end: end,
          segmentIndex: segIndex,
          charIndex: token.startIdx,
          spk: spk,
          previewable: true,
          type: token.type
        });

        currentTime = end;
      });
    }
  });

  return units;
}
