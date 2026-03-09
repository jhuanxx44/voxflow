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
 * - Plays TTS audio for regenerated segments (voice cloning)
 *
 * CRITICAL CONSTANT:
 * - CONTINUOUS_THRESHOLD = 0.15 (150ms) - segments closer than this are considered continuous
 */

import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';

// 150ms threshold - if next segment starts within this time, don't seek
const CONTINUOUS_THRESHOLD = 0.15;

interface UseEditedPlaybackOptions {
  audioRef: React.RefObject<HTMLMediaElement | null>;
  ttsAudioRef?: React.RefObject<HTMLAudioElement | null>;
  onHighlight?: () => void;
}

export function useEditedPlayback({ audioRef, ttsAudioRef, onHighlight }: UseEditedPlaybackOptions) {
  const {
    composition,
    charComposition,
    lastSegments,
    charLevelData,
    isCharEditMode,
    editedPlaying,
    ttsAudioMap,
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
  const ttsAudioMapRef = useRef(ttsAudioMap);
  // Track whether TTS audio is currently playing
  const ttsPlayingRef = useRef(false);
  // Track current TTS ended handler for cleanup
  const ttsEndedHandlerRef = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    ttsAudioMapRef.current = ttsAudioMap;
  }, [ttsAudioMap]);

  /**
   * Helper: get segment data by original index
   */
  const getItemByIdx = useCallback(
    (idx: number) => {
      return isCharEditModeRef.current ? charLevelData[idx] : lastSegments[idx];
    },
    [charLevelData, lastSegments]
  );

  /**
   * Clean up any existing TTS ended handler
   */
  const cleanupTTSHandler = useCallback(() => {
    if (ttsEndedHandlerRef.current && ttsAudioRef?.current) {
      ttsAudioRef.current.removeEventListener('ended', ttsEndedHandlerRef.current);
      ttsEndedHandlerRef.current = null;
    }
  }, [ttsAudioRef]);

  /**
   * Stop edited playback
   */
  const stopEditedPlayback = useCallback(() => {
    editedPlayingRef.current = false;
    ttsPlayingRef.current = false;
    setEditedPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Clean up TTS handler and stop audio
    cleanupTTSHandler();
    if (ttsAudioRef?.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.src = '';
    }
  }, [setEditedPlaying, ttsAudioRef, cleanupTTSHandler]);

  /**
   * Monitor loop: checks if current segment has ended and advances to next.
   * Uses refs exclusively to avoid stale closures.
   * Defined as a plain function (not useCallback) and stored in a ref
   * to break the circular dependency with playTTSSegment.
   */
  const monitorRef = useRef<() => void>(() => {});
  const playTTSSegmentRef = useRef<(blobUrl: string, nextPos: number) => void>(() => {});

  // Define monitor function — reads everything from refs
  useEffect(() => {
    monitorRef.current = () => {
      if (!editedPlayingRef.current || ttsPlayingRef.current) return;

      const player = audioRef.current;
      if (!player || player.paused) return;

      const activeComposition = isCharEditModeRef.current
        ? charCompositionRef.current
        : compositionRef.current;
      const currentPos = editedPlayPosRef.current;
      const currentIdx = activeComposition[currentPos];
      const currentItem = getItemByIdx(currentIdx);

      if (!currentItem) {
        stopEditedPlayback();
        return;
      }

      const endTime = (currentItem.end || currentItem.start) / 1000;

      if (player.currentTime >= endTime) {
        const nextPos = currentPos + 1;
        editedPlayPosRef.current = nextPos;
        setEditedPlayPos(nextPos);

        if (nextPos >= activeComposition.length) {
          player.pause();
          stopEditedPlayback();
          return;
        }

        const nextIdx = activeComposition[nextPos];

        // Check if next segment has TTS audio
        const nextTTSUrl = ttsAudioMapRef.current[nextIdx];
        if (nextTTSUrl && ttsAudioRef?.current) {
          player.pause();
          playTTSSegmentRef.current(nextTTSUrl, nextPos + 1);
          return;
        }

        const nextItem = getItemByIdx(nextIdx);
        const nextStart = (nextItem?.start || 0) / 1000;

        if (Math.abs(player.currentTime - nextStart) > CONTINUOUS_THRESHOLD) {
          player.currentTime = nextStart;
        }

        if (onHighlight) onHighlight();
      }

      rafRef.current = requestAnimationFrame(monitorRef.current);
    };
  }, [audioRef, getItemByIdx, setEditedPlayPos, onHighlight, stopEditedPlayback, ttsAudioRef]);

  // Define playTTSSegment function — also uses refs to avoid circular deps
  useEffect(() => {
    playTTSSegmentRef.current = (blobUrl: string, nextPos: number) => {
      if (!ttsAudioRef?.current) return;

      const ttsPlayer = ttsAudioRef.current;

      // Clean up previous handler
      cleanupTTSHandler();

      ttsPlayingRef.current = true;

      // Pause the original audio
      audioRef.current?.pause();

      ttsPlayer.src = blobUrl;

      const handleEnded = () => {
        ttsPlayer.removeEventListener('ended', handleEnded);
        ttsEndedHandlerRef.current = null;
        ttsPlayingRef.current = false;

        if (!editedPlayingRef.current) return;

        const activeComposition = isCharEditModeRef.current
          ? charCompositionRef.current
          : compositionRef.current;

        if (nextPos >= activeComposition.length) {
          stopEditedPlayback();
          return;
        }

        editedPlayPosRef.current = nextPos;
        setEditedPlayPos(nextPos);

        // Check if next segment is also TTS
        const nextIdx = activeComposition[nextPos];
        const nextTTSUrl = ttsAudioMapRef.current[nextIdx];
        if (nextTTSUrl) {
          playTTSSegmentRef.current(nextTTSUrl, nextPos + 1);
        } else {
          // Resume original audio from next segment
          const nextItem = getItemByIdx(nextIdx);
          if (nextItem && audioRef.current) {
            audioRef.current.currentTime = (nextItem.start || 0) / 1000;
            audioRef.current.play().catch(() => {});
            rafRef.current = requestAnimationFrame(monitorRef.current);
          }
        }

        if (onHighlight) onHighlight();
      };

      ttsEndedHandlerRef.current = handleEnded;
      ttsPlayer.addEventListener('ended', handleEnded);
      ttsPlayer.play().catch((e) => {
        console.error('TTS play error:', e);
        ttsPlayingRef.current = false;
      });

      if (onHighlight) onHighlight();
    };
  }, [ttsAudioRef, audioRef, getItemByIdx, setEditedPlayPos, onHighlight, stopEditedPlayback, cleanupTTSHandler]);

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

      // Check if first segment has TTS audio
      const firstTTSUrl = ttsAudioMapRef.current[firstIdx];
      if (firstTTSUrl && ttsAudioRef?.current) {
        if (onHighlight) onHighlight();
        playTTSSegmentRef.current(firstTTSUrl, fromPos + 1);
        return;
      }

      const firstItem = getItemByIdx(firstIdx);

      if (firstItem) {
        player.currentTime = (firstItem.start || 0) / 1000;

        if (onHighlight) onHighlight();

        player.play().catch((e) => {
          console.error('Play error:', e);
          stopEditedPlayback();
        });
      }

      // Start the monitoring loop
      rafRef.current = requestAnimationFrame(monitorRef.current);
    },
    [
      audioRef,
      getItemByIdx,
      setEditedPlaying,
      setEditedPlayPos,
      onHighlight,
      stopEditedPlayback,
      ttsAudioRef,
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
