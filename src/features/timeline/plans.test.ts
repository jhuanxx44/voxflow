import { describe, expect, it } from 'vitest';
import type { TimelineClipV1 } from '@/types/project';
import { buildTimelineLayout } from './layout';
import {
  createMoveOperation,
  createMoveOperationAtTimeline,
  createSplitOperation,
  createTrimOperation,
  hasExceededDragThreshold,
  moveByKeyboard,
  trimBoundsForClip,
} from './plans';

function clip(id: string, start: number, end: number, kind: 'source' | 'replacement' = 'source'): TimelineClipV1 {
  return {
    id,
    kind,
    source_segment_id: 'seg_a',
    source_in_ms: start,
    source_out_ms: end,
    transcript_text: id,
    speaker_id: null,
    token_ids: [],
    replacement_artifact_id: kind === 'replacement' ? `artifact_${id}` : null,
    replacement_duration_ms: kind === 'replacement' ? end - start : null,
    render_duration_ms: kind === 'replacement' ? end - start : null,
    duration_policy: kind === 'replacement' ? 'natural' : null,
    stretch_ratio: kind === 'replacement' ? 1 : null,
    replacement_warnings: [],
  };
}

describe('timeline operation plans', () => {
  it('activates dragging only after exceeding four pixels', () => {
    expect(hasExceededDragThreshold(4)).toBe(false);
    expect(hasExceededDragThreshold(-4)).toBe(false);
    expect(hasExceededDragThreshold(5)).toBe(true);
    expect(hasExceededDragThreshold(-5)).toBe(true);
  });

  it('creates stable-anchor moves and removes no-ops', () => {
    expect(createMoveOperation(['a', 'b', 'c'], 'a', 'c', 'after')).toEqual({
      operation: { op: 'move_clip', clip_id: 'a', anchor_clip_id: 'c', position: 'after' },
      orderedClipIds: ['b', 'c', 'a'],
    });
    expect(createMoveOperation(['a', 'b', 'c'], 'b', 'a', 'after')).toBeNull();
    expect(moveByKeyboard(['a', 'b', 'c'], 'b', -1)?.orderedClipIds).toEqual(['b', 'a', 'c']);
    expect(moveByKeyboard(['a', 'b', 'c'], 'b', 1)?.orderedClipIds).toEqual(['a', 'c', 'b']);
    expect(moveByKeyboard(['a', 'b', 'c'], 'a', -1)).toBeNull();
    expect(moveByKeyboard(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(createMoveOperation(['a', 'b', 'c'], 'c', 'a', 'before')?.orderedClipIds).toEqual(['c', 'a', 'b']);
    expect(createMoveOperation(['a', 'b', 'c'], 'a', 'c', 'after')?.orderedClipIds).toEqual(['b', 'c', 'a']);
  });

  it('uses provisional insertion slots for uneven clip durations', () => {
    const layout = buildTimelineLayout([
      clip('a', 0, 4_000),
      clip('b', 4_000, 4_500),
      clip('c', 4_500, 5_500),
    ]);
    expect(createMoveOperationAtTimeline(layout, 'a', 200)).toBeNull();
    expect(createMoveOperationAtTimeline(layout, 'a', 600)?.orderedClipIds).toEqual(['b', 'a', 'c']);
    expect(createMoveOperationAtTimeline(layout, 'a', 2_000)?.orderedClipIds).toEqual(['b', 'c', 'a']);
  });

  it('maps compact timeline time to source split time', () => {
    const first = clip('a', 1_000, 2_000);
    const second = clip('b', 5_000, 6_000);
    first.token_ids = ['tok_a'];
    second.token_ids = ['tok_b'];
    const layout = buildTimelineLayout([first, second]);
    expect(createSplitOperation(layout, 1_250)).toEqual({
      op: 'split_clip',
      clip_id: 'b',
      at_ms: 5_250,
    });
    expect(createSplitOperation(layout, 1_005)).toBeNull();
    expect(createSplitOperation(buildTimelineLayout([clip('r', 0, 100, 'replacement')]), 50)).toBeNull();
  });

  it('clamps trim to immutable bounds and minimum duration', () => {
    const item = buildTimelineLayout([clip('a', 100, 900)])[0];
    expect(createTrimOperation({ item, edge: 'in', requestedSourceMs: -50, bounds: { startMs: 0, endMs: 1_000 } })).toEqual({
      op: 'trim_clip',
      clip_id: 'a',
      source_in_ms: 0,
      source_out_ms: 900,
    });
    expect(createTrimOperation({ item, edge: 'out', requestedSourceMs: 105, bounds: { startMs: 0, endMs: 1_000 } })).toEqual({
      op: 'trim_clip',
      clip_id: 'a',
      source_in_ms: 100,
      source_out_ms: 120,
    });
    expect(createTrimOperation({ item, edge: 'out', requestedSourceMs: 2_000, bounds: { startMs: 0, endMs: 1_000 } })).toEqual({
      op: 'trim_clip',
      clip_id: 'a',
      source_in_ms: 100,
      source_out_ms: 1_000,
    });
    expect(createTrimOperation({ item, edge: 'in', requestedSourceMs: 880, bounds: { startMs: 0, endMs: 1_000 } })).toEqual({
      op: 'trim_clip',
      clip_id: 'a',
      source_in_ms: 880,
      source_out_ms: 900,
    });
    expect(createTrimOperation({ item, edge: 'in', requestedSourceMs: 100, bounds: { startMs: 0, endMs: 1_000 } })).toBeNull();
    expect(createTrimOperation({
      item: buildTimelineLayout([clip('r', 100, 900, 'replacement')])[0],
      edge: 'out',
      requestedSourceMs: 700,
      bounds: { startMs: 0, endMs: 1_000 },
    })).toBeNull();
  });

  it('bounds trim by siblings from the same segment regardless of timeline order', () => {
    const segment = { startMs: 0, endMs: 1000 };
    const left = clip('left', 0, 300);
    const right = clip('right', 600, 1000);
    const other = { ...clip('other', 0, 1000), source_segment_id: 'seg_b' };
    expect(trimBoundsForClip(left, [right, other, left], segment)).toEqual({ startMs: 0, endMs: 600 });
    expect(trimBoundsForClip(right, [left, right], segment)).toEqual({ startMs: 300, endMs: 1000 });
    expect(trimBoundsForClip(left, [left], segment)).toEqual(segment);
  });

  it('never narrows trim bounds inside the current clip range', () => {
    const segment = { startMs: 0, endMs: 1000 };
    const current = clip('current', 200, 700);
    const overlapping = clip('overlapping', 500, 900);
    expect(trimBoundsForClip(current, [current, overlapping], segment)).toEqual({ startMs: 0, endMs: 700 });
  });
});
