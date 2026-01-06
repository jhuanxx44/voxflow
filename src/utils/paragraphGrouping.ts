/**
 * Smart paragraph grouping utility
 *
 * Groups segments into paragraphs based on:
 * - Pause duration between segments (PAUSE_THRESHOLD)
 * - Speaker changes
 * - Paragraph length constraints
 * - Ideal sentence count per paragraph
 */

import type { Segment, ParagraphGroup } from '@/types';

const PAUSE_THRESHOLD = 5000; // 5 seconds pause triggers new paragraph
const MIN_PARAGRAPH_LENGTH = 20; // Minimum characters per paragraph
const MAX_PARAGRAPH_LENGTH = 500; // Maximum characters per paragraph
const IDEAL_SENTENCES = 15; // Ideal number of sentences per paragraph

/**
 * Group segments into smart paragraphs
 */
export function groupSegmentsToParagraphs(segments: Segment[]): ParagraphGroup[] {
  if (!segments || segments.length === 0) return [];

  const paragraphs: ParagraphGroup[] = [];
  let currentParagraph: ParagraphGroup = {
    segments: [],
    text: '',
    start: null,
    end: null,
    spk: null,
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevSeg = i > 0 ? segments[i - 1] : null;

    // Decide whether to break into new paragraph
    let shouldBreak = false;

    if (currentParagraph.segments.length > 0) {
      // 1. Speaker change - break into new paragraph
      if (
        typeof seg.spk === 'number' &&
        typeof currentParagraph.spk === 'number' &&
        seg.spk !== currentParagraph.spk
      ) {
        shouldBreak = true;
      }

      // 2. Long pause - break into new paragraph
      if (prevSeg && seg.start && prevSeg.end) {
        const pauseDuration = seg.start - prevSeg.end;
        if (pauseDuration > PAUSE_THRESHOLD) {
          shouldBreak = true;
        }
      }

      // 3. Reached ideal sentence count
      if (currentParagraph.segments.length >= IDEAL_SENTENCES) {
        shouldBreak = true;
      }

      // 4. Exceeding max length
      if (currentParagraph.text.length + seg.text.length > MAX_PARAGRAPH_LENGTH) {
        // Only break if current paragraph is long enough
        if (currentParagraph.text.length >= MIN_PARAGRAPH_LENGTH) {
          shouldBreak = true;
        }
      }
    }

    // Break into new paragraph if needed
    if (shouldBreak) {
      paragraphs.push(currentParagraph);
      currentParagraph = {
        segments: [],
        text: '',
        start: null,
        end: null,
        spk: null,
      };
    }

    // Add segment to current paragraph
    currentParagraph.segments.push(seg);
    currentParagraph.text += seg.text;
    if (currentParagraph.start === null) {
      currentParagraph.start = seg.start;
    }
    currentParagraph.end = seg.end;
    if (currentParagraph.spk === null && typeof seg.spk === 'number') {
      currentParagraph.spk = seg.spk;
    }
  }

  // Add the last paragraph if it has content
  if (currentParagraph.segments.length > 0) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs;
}
