/**
 * useHighlight hook - Manages highlighting of active sentence spans
 *
 * This hook provides the highlightNow function that determines which
 * sentence span should be highlighted based on current playback time.
 *
 * CRITICAL CONSTANT:
 * - HIGHLIGHT_EPS = 30ms - tolerance for matching current time to segment time
 */

import { useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '@/stores/editorStore';

const HIGHLIGHT_EPS = 30; // 30ms tolerance for highlight matching

interface UseHighlightOptions {
  audioRef: React.RefObject<HTMLMediaElement>;
}

export function useHighlight({ audioRef }: UseHighlightOptions) {
  const {
    composition,
    charComposition,
    lastSegments,
    charLevelData,
    isCharEditMode,
  } = useEditorStore();

  const highlightRAFRef = useRef<number | null>(null);
  const activeIndexRef = useRef<number | null>(null);

  /**
   * Find which segment/char should be highlighted at current playback time
   * Returns the composition index (not the original segment index)
   */
  const findActiveIndex = useCallback((): number | null => {
    if (!audioRef.current) {
      return null;
    }
    const player = audioRef.current;

    if (isNaN(player.duration)) {
      return null;
    }

    const currentTime = player.currentTime * 1000; // Convert to milliseconds
    const activeComposition = isCharEditMode ? charComposition : composition;
    const activeData = isCharEditMode ? charLevelData : lastSegments;

    let active: number | null = null;
    let bestMatch: number | null = null;
    let bestScore = -1;

    // Iterate through composition to find active segment
    for (let i = 0; i < activeComposition.length; i++) {
      const dataIdx = activeComposition[i];
      const item = activeData[dataIdx];
      if (!item) continue;

      const start = item.start || 0;
      let end = item.end || start;

      // Ensure end is valid
      if (!Number.isFinite(end) || end <= start) {
        end = start + HIGHLIGHT_EPS;
      }

      // Exact match: within time range (with tolerance at start, no tolerance at end)
      if (currentTime >= start - HIGHLIGHT_EPS && currentTime < end) {
        active = i; // Return composition index
        break;
      }

      // Record closest match (fallback)
      if (currentTime >= start - HIGHLIGHT_EPS && currentTime < end + HIGHLIGHT_EPS) {
        // Calculate match score: prefer segments where current time is closer to midpoint
        const mid = (start + end) / 2;
        const score = 1000 - Math.abs(currentTime - mid); // Higher score = closer to midpoint
        if (score > bestScore) {
          bestScore = score;
          bestMatch = i;
        }
      }
    }

    // Use best match if no exact match
    if (active === null && bestMatch !== null) {
      active = bestMatch;
    }

    // If still no match, try to find the nearest segment
    if (active === null) {
      let nearest: number | null = null;
      let nearestDiff = Infinity;

      for (let i = 0; i < activeComposition.length; i++) {
        const dataIdx = activeComposition[i];
        const item = activeData[dataIdx];
        if (!item) continue;

        const start = item.start || 0;
        const diff = Math.abs(currentTime - start);

        if (diff < nearestDiff && diff <= HIGHLIGHT_EPS * 2) {
          nearest = i;
          nearestDiff = diff;
        }
      }

      active = nearest;
    }

    return active;
  }, [
    audioRef,
    composition,
    charComposition,
    lastSegments,
    charLevelData,
    isCharEditMode,
  ]);

  /**
   * Highlight the current active span
   * This is called during playback to update highlighting
   */
  const highlightNow = useCallback(() => {
    const activeIndex = findActiveIndex();
    activeIndexRef.current = activeIndex;
    return activeIndex;
  }, [findActiveIndex]);

  /**
   * Start highlight loop (called when audio starts playing)
   */
  const startHighlightLoop = useCallback(() => {
    if (highlightRAFRef.current) {
      cancelAnimationFrame(highlightRAFRef.current);
    }

    const loop = () => {
      if (audioRef.current && !audioRef.current.paused) {
        highlightNow();
        highlightRAFRef.current = requestAnimationFrame(loop);
      }
    };

    loop();
  }, [audioRef, highlightNow]);

  /**
   * Stop highlight loop
   */
  const stopHighlightLoop = useCallback(() => {
    if (highlightRAFRef.current) {
      cancelAnimationFrame(highlightRAFRef.current);
      highlightRAFRef.current = null;
    }
    activeIndexRef.current = null;
  }, []);

  /**
   * Clean up on unmount
   */
  useEffect(() => {
    return () => {
      if (highlightRAFRef.current) {
        cancelAnimationFrame(highlightRAFRef.current);
      }
    };
  }, []);

  return {
    highlightNow,
    startHighlightLoop,
    stopHighlightLoop,
    activeIndex: activeIndexRef.current,
    findActiveIndex,
  };
}
