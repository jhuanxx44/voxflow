/**
 * Smart paragraph grouping utilities
 * Groups segments into paragraphs based on speaker changes, pauses, and length
 */

import type { Segment, ParagraphGroup } from '../types/asr';

/**
 * Time threshold for pause-based paragraph breaks (milliseconds)
 * Pauses longer than 5 seconds will trigger a new paragraph
 */
const PAUSE_THRESHOLD = 5000;

/**
 * Minimum paragraph length in characters
 * Paragraphs should have at least 20 characters before considering a break
 */
const MIN_PARAGRAPH_LENGTH = 20;

/**
 * Maximum paragraph length in characters
 * Paragraphs longer than 500 characters will be forcibly split
 */
const MAX_PARAGRAPH_LENGTH = 500;

/**
 * Ideal number of sentences per paragraph
 * When reaching 15 sentences and minimum length, prefer to start a new paragraph
 */
const IDEAL_SENTENCES = 15;

/**
 * Groups segments into smart paragraphs
 *
 * Grouping rules (in priority order):
 * 1. Speaker change - always start new paragraph
 * 2. Long pause (>5s) - start new paragraph
 * 3. Reached ideal length (15+ sentences, 20+ chars) - prefer new paragraph
 * 4. Maximum length exceeded (>500 chars) - force new paragraph
 *
 * @param segments - Array of segments to group
 * @param composition - Array of segment indices in display order (after user edits)
 * @returns Array of paragraph groups, each containing segment indices
 *
 * @example
 * const segments = [
 *   { text: "Hello", start: 0, end: 1000, spk: 0 },
 *   { text: "World", start: 1200, end: 2000, spk: 0 },
 *   { text: "Goodbye", start: 8000, end: 9000, spk: 1 }
 * ];
 * const composition = [0, 1, 2];
 * const groups = groupSegmentsToParagraphs(segments, composition);
 * // Returns: [[0, 1], [2]]
 * // First paragraph: segments 0-1 (same speaker, short pause)
 * // Second paragraph: segment 2 (different speaker)
 */
export function groupSegmentsToParagraphs(
  segments: Segment[],
  composition: number[]
): number[][] {
  // Map composition indices to actual segments
  const list = composition.map(i => segments[i]).filter(Boolean);

  if (!list || list.length === 0) return [];

  const paragraphGroups: number[][] = [];
  let currentGroup: number[] = [];
  let currentParagraph: ParagraphGroup = {
    segments: [],
    text: '',
    start: null,
    end: null,
    spk: null
  };

  for (let i = 0; i < list.length; i++) {
    const seg = list[i];
    const prevSeg = i > 0 ? list[i - 1] : null;
    const originalIndex = composition[i]; // Track original segment index

    // Decide whether to break paragraph
    let shouldBreak = false;

    if (currentParagraph.segments.length > 0) {
      // Rule 1: Speaker change - always break
      if (typeof seg.spk === 'number' && typeof currentParagraph.spk === 'number' &&
          seg.spk !== currentParagraph.spk) {
        shouldBreak = true;
      }

      // Rule 2: Long pause - break
      if (prevSeg && seg.start && prevSeg.end) {
        const pause = seg.start - prevSeg.end;
        if (pause > PAUSE_THRESHOLD) {
          shouldBreak = true;
        }
      }

      // Rule 3: Reached ideal length - prefer break
      if (currentParagraph.segments.length >= IDEAL_SENTENCES &&
          currentParagraph.text.length >= MIN_PARAGRAPH_LENGTH) {
        shouldBreak = true;
      }

      // Rule 4: Maximum length exceeded - force break
      if (currentParagraph.text.length + seg.text.length > MAX_PARAGRAPH_LENGTH) {
        shouldBreak = true;
      }
    }

    if (shouldBreak) {
      // Save current paragraph group
      paragraphGroups.push([...currentGroup]);

      // Start new paragraph
      currentGroup = [originalIndex];
      currentParagraph = {
        segments: [seg],
        text: seg.text,
        start: seg.start,
        end: seg.end,
        spk: seg.spk
      };
    } else {
      // Add to current paragraph
      currentGroup.push(originalIndex);
      currentParagraph.segments.push(seg);
      currentParagraph.text += seg.text;

      if (currentParagraph.start === null) {
        currentParagraph.start = seg.start;
      }
      currentParagraph.end = seg.end;

      if (currentParagraph.spk === null) {
        currentParagraph.spk = seg.spk;
      }
    }
  }

  // Add final paragraph group
  if (currentGroup.length > 0) {
    paragraphGroups.push(currentGroup);
  }

  return paragraphGroups;
}

/**
 * Converts paragraph groups back to ParagraphGroup objects
 * Useful for rendering and display purposes
 *
 * @param segments - Original segments array
 * @param paragraphGroups - Array of segment index groups
 * @returns Array of ParagraphGroup objects with full data
 */
export function toParagraphObjects(
  segments: Segment[],
  paragraphGroups: number[][]
): ParagraphGroup[] {
  return paragraphGroups.map(group => {
    const groupSegments = group.map(i => segments[i]).filter(Boolean);

    if (groupSegments.length === 0) {
      return {
        segments: [],
        text: '',
        start: null,
        end: null,
        spk: null
      };
    }

    return {
      segments: groupSegments,
      text: groupSegments.map(s => s.text).join(''),
      start: groupSegments[0].start,
      end: groupSegments[groupSegments.length - 1].end,
      spk: groupSegments[0].spk
    };
  });
}
