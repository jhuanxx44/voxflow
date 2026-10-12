import { describe, expect, it } from 'vitest';
import type { TimelineClipV1 } from '@/types/project';
import {
  buildTimelineLayout,
  chooseRulerStepMs,
  clampPixelsPerMs,
  findLayoutItemAtTime,
  fitPixelsPerMs,
  pixelsToTime,
  sourceToTimelineMs,
  timeToPixels,
  timelineDurationMs,
  timelineToSourceMs,
  visibleRange,
  zoomViewport,
} from './layout';

function clip(id: string, start: number, end: number, renderDuration?: number): TimelineClipV1 {
  return {
    id,
    kind: renderDuration ? 'replacement' : 'source',
    source_segment_id: `seg_${id}`,
    source_in_ms: start,
    source_out_ms: end,
    transcript_text: id,
    speaker_id: null,
    token_ids: [],
    replacement_artifact_id: renderDuration ? `artifact_${id}` : null,
    replacement_duration_ms: renderDuration ?? null,
    render_duration_ms: renderDuration ?? null,
    duration_policy: renderDuration ? 'natural' : null,
    stretch_ratio: renderDuration ? 1 : null,
    replacement_warnings: [],
  };
}

describe('timeline layout', () => {
  it('builds a compact prefix layout and uses replacement render duration', () => {
    const layout = buildTimelineLayout([clip('a', 100, 1_100), clip('b', 2_000, 2_500, 750)]);
    expect(layout.map((item) => [item.timelineInMs, item.timelineOutMs])).toEqual([
      [0, 1_000],
      [1_000, 1_750],
    ]);
    expect(timelineDurationMs(layout)).toBe(1_750);
  });

  it('uses half-open clip boundaries', () => {
    const layout = buildTimelineLayout([clip('a', 0, 100), clip('b', 100, 200)]);
    expect(findLayoutItemAtTime(layout, 0)?.clipId).toBe('a');
    expect(findLayoutItemAtTime(layout, 99)?.clipId).toBe('a');
    expect(findLayoutItemAtTime(layout, 100)?.clipId).toBe('b');
    expect(findLayoutItemAtTime(layout, 200)).toBeNull();
  });

  it('maps source and replacement coordinates with clamping', () => {
    const [source, replacement] = buildTimelineLayout([
      clip('source', 1_000, 2_000),
      clip('replacement', 5_000, 7_000, 500),
    ]);
    expect(timelineToSourceMs(source, 250)).toBe(1_250);
    expect(sourceToTimelineMs(source, 1_250)).toBe(250);
    expect(timelineToSourceMs(source, -100)).toBe(1_000);
    expect(sourceToTimelineMs(source, 9_000)).toBe(1_000);
    expect(timelineToSourceMs(replacement, 1_250)).toBe(250);
    expect(sourceToTimelineMs(replacement, 250)).toBe(1_250);
    expect(sourceToTimelineMs(replacement, 2_000)).toBe(1_500);
  });

  it('round trips pixels and preserves a zoom anchor', () => {
    expect(pixelsToTime(timeToPixels(12_345, 0.04), 0.04)).toBeCloseTo(12_345);
    const next = zoomViewport(
      { pixelsPerMs: 0.02, scrollLeftPx: 100, viewportWidthPx: 800 },
      0.04,
      10_000
    );
    expect(10_000 * next.pixelsPerMs - next.scrollLeftPx).toBe(100);
    expect(fitPixelsPerMs(20_000, 800)).toBe(0.04);
    expect(fitPixelsPerMs(7_200_000, 720)).toBeCloseTo(0.0001);
    expect(clampPixelsPerMs(0)).toBe(0.002);
    expect(clampPixelsPerMs(2)).toBe(0.5);
    expect(chooseRulerStepMs(0.5)).toBe(250);
    expect(chooseRulerStepMs(0.002)).toBe(60_000);
  });

  it('returns a bounded visible range with overscan', () => {
    const layout = buildTimelineLayout(
      Array.from({ length: 1_000 }, (_, index) => clip(String(index), index * 100, index * 100 + 100))
    );
    const range = visibleRange(
      layout,
      { pixelsPerMs: 1, scrollLeftPx: 40_000, viewportWidthPx: 1_000 },
      100
    );
    expect(range.startIndex).toBe(399);
    expect(range.endIndex).toBe(411);
    expect(visibleRange([], { pixelsPerMs: 1, scrollLeftPx: 0, viewportWidthPx: 100 })).toEqual({ startIndex: 0, endIndex: 0 });
    expect(visibleRange(layout, { pixelsPerMs: 1, scrollLeftPx: 200_000, viewportWidthPx: 100 }, 0)).toEqual({ startIndex: 1_000, endIndex: 1_000 });
  });

  it('keeps 1000-clip layout and visible-range work below the 20ms budget', () => {
    const clips = Array.from({ length: 1_000 }, (_, index) =>
      clip(String(index), index * 7_200, (index + 1) * 7_200)
    );
    const iterations = 100;
    const startedAt = performance.now();
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const layout = buildTimelineLayout(clips);
      visibleRange(layout, {
        pixelsPerMs: 0.02,
        scrollLeftPx: iteration * 100,
        viewportWidthPx: 1_440,
      });
    }
    const averageMs = (performance.now() - startedAt) / iterations;
    expect(averageMs).toBeLessThan(20);
  });
});
