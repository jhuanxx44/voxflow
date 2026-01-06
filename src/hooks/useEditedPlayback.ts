/**
 * useEditedPlayback hook - Handles playback of edited content
 *
 * This hook manages the RAF (requestAnimationFrame) loop that monitors
 * audio playback and automatically seeks to the next non-deleted segment.
 *
 * Key features:
 * - Skips deleted segments during playback
 * - Handles continuous audio (doesn't seek if segments are close together)
 * - Uses RAF for smooth monitoring
 * - Works with both segment-level and char-level editing modes
 *
 * CRITICAL CONSTANT:
 * - CONTINUOUS_THRESHOLD = 0.15 (150ms) - segments closer than this are considered continuous
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';

// 150ms threshold - if next segment starts within this time, don't seek
const CONTINUOUS_THRESHOLD = 0.15;

interface UseEditedPlaybackOptions {
  audioRef: React.RefObject<HTMLAudioElement>;
  onHighlight?: () => void;
}

export function useEditedPlayback({ audioRef, onHighlight }: UseEditedPlaybackOptions) {
  const {
    composition,
    charComposition,
    lastSegments,
    charLevelData,
    isCharEditMode,
    editedPlaying,
    setEditedPlaying,
    setEditedPlayPos,
  } = useEditorStore();

  const rafRef = useRef<number | null>(null);
  // Use refs to avoid closure issues in RAF loop
  const editedPlayingRef = useRef(false);
  const editedPlayPosRef = useRef(0);
  const compositionRef = useRef(composition);
  const charCompositionRef = useRef(charComposition);
  const isCharEditModeRef = useRef(isCharEditMode);

  // Keep refs in sync with state
  useEffect(() => {
    compositionRef.current = composition;
  }, [composition]);

  useEffect(() => {
    charCompositionRef.current = charComposition;
  }, [charComposition]);

  useEffect(() => {
    isCharEditModeRef.current = isCharEditMode;
  }, [isCharEditMode]);

  /**
   * Stop edited playback
   */
  const stopEditedPlayback = useCallback(() => {
    editedPlayingRef.current = false;
    setEditedPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [setEditedPlaying]);

  /**
   * Start edited playback from a specific position
   */
  const startEditedPlayback = useCallback(
    (fromPos: number = 0) => {
      if (!audioRef.current) return;

      const player = audioRef.current;

      // Stop any existing playback
      if (editedPlayingRef.current) {
        stopEditedPlayback();
      }

      // Get current composition based on mode
      const activeComposition = isCharEditModeRef.current
        ? charCompositionRef.current
        : compositionRef.current;

      if (!activeComposition.length || isNaN(player.duration)) return;

      // Set playing state
      editedPlayingRef.current = true;
      editedPlayPosRef.current = fromPos;
      setEditedPlaying(true);
      setEditedPlayPos(fromPos);

      // Get first segment/char to play
      const firstIdx = activeComposition[fromPos];
      const firstItem = isCharEditModeRef.current
        ? charLevelData[firstIdx]
        : lastSegments[firstIdx];

      if (firstItem) {
        // Seek to the start of the first item
        player.currentTime = (firstItem.start || 0) / 1000;

        // Trigger initial highlight
        if (onHighlight) {
          onHighlight();
        }

        // Start playing
        player.play().catch((e) => {
          console.error('Play error:', e);
          stopEditedPlayback();
        });
      }

      // Start monitoring loop
      const monitor = () => {
        if (!editedPlayingRef.current) return;

        const player = audioRef.current;
        if (!player || player.paused) {
          // Paused - don't continue loop
          return;
        }

        // Always get current composition from ref (handles reordering)
        const activeComposition = isCharEditModeRef.current
          ? charCompositionRef.current
          : compositionRef.current;
        const currentPos = editedPlayPosRef.current;
        const currentIdx = activeComposition[currentPos];
        const currentItem = isCharEditModeRef.current
          ? charLevelData[currentIdx]
          : lastSegments[currentIdx];

        if (!currentItem) {
          stopEditedPlayback();
          return;
        }

        const endTime = (currentItem.end || currentItem.start) / 1000;

        // Check if we've reached the end of the current segment
        if (player.currentTime >= endTime) {
          // Move to next position
          const nextPos = currentPos + 1;
          editedPlayPosRef.current = nextPos;
          setEditedPlayPos(nextPos);

          if (nextPos >= activeComposition.length) {
            // End of playback
            player.pause();
            stopEditedPlayback();
            return;
          }

          // Get next segment/char based on composition order
          const nextIdx = activeComposition[nextPos];
          const nextItem = isCharEditModeRef.current
            ? charLevelData[nextIdx]
            : lastSegments[nextIdx];
          const nextStart = (nextItem.start || 0) / 1000;

          // CRITICAL LOGIC: Check if segments are continuous
          // If next segment starts very close to current time (< 150ms),
          // don't seek - let it play through smoothly
          if (Math.abs(player.currentTime - nextStart) > CONTINUOUS_THRESHOLD) {
            player.currentTime = nextStart;
          }

          // Trigger highlight update
          if (onHighlight) {
            onHighlight();
          }
        }

        // Continue monitoring
        rafRef.current = requestAnimationFrame(monitor);
      };

      // Start the monitoring loop
      rafRef.current = requestAnimationFrame(monitor);
    },
    [
      audioRef,
      lastSegments,
      charLevelData,
      setEditedPlaying,
      setEditedPlayPos,
      onHighlight,
      stopEditedPlayback,
    ]
  );

  /**
   * Cleanup RAF on unmount
   */
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    startEditedPlayback,
    stopEditedPlayback,
    isPlaying: editedPlaying,
  };
}
