/**
 * useAudioPlayer Hook
 *
 * Manages audio playback, time tracking, and highlighting sync.
 * Preserves the original highlightNow logic with 30ms EPS for accurate highlighting.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useASRStore } from '@/stores/asrStore';
import { useEditorStore } from '@/stores/editorStore';

// Time matching epsilon (30ms tolerance)
const HIGHLIGHT_EPS = 30;

// Continuous playback threshold (150ms)
const CONTINUOUS_THRESHOLD = 0.15;

interface UseAudioPlayerOptions {
  onHighlight?: (segmentIndex: number | null) => void;
}

export const useAudioPlayer = (options: UseAudioPlayerOptions = {}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const highlightRAFRef = useRef<number | null>(null);
  const editedRAFRef = useRef<number | null>(null);

  const { audioUrl } = useASRStore();
  const {
    lastSegments,
    composition,
    charLevelData,
    charComposition,
    isCharEditMode,
    editedPlaying,
    editedPlayPos,
    setEditedPlaying,
    setEditedPlayPos,
  } = useEditorStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Get audio element reference
  const getAudioElement = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = document.getElementById('player') as HTMLAudioElement;
    }
    return audioRef.current;
  }, []);

  /**
   * Highlight logic (from original implementation)
   * Finds the best matching segment/character for current playback time
   */
  const highlightNow = useCallback(() => {
    const player = getAudioElement();
    if (!player || isNaN(player.duration)) return;

    const ct = player.currentTime * 1000; // Current time in ms

    if (isCharEditMode && charLevelData.length > 0) {
      // Character-level highlighting
      let bestMatch: number | null = null;
      let bestScore = -1;

      charComposition.forEach((charIdx, renderIdx) => {
        const unit = charLevelData[charIdx];
        if (!unit) return;

        const start = unit.start || 0;
        const end = unit.end || start;

        // Check if current time is within this character's range
        if (ct >= start - HIGHLIGHT_EPS && ct <= end + HIGHLIGHT_EPS) {
          // Calculate score (prefer earlier matches and closer times)
          const score = 1000 - Math.abs(ct - (start + end) / 2);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = renderIdx;
          }
        }
      });

      // Apply highlighting via DOM (preserved from original)
      const charSpans = document.querySelectorAll('.char-unit');
      charSpans.forEach((span, idx) => {
        if (idx === bestMatch) {
          span.classList.add('active');
        } else {
          span.classList.remove('active');
        }
      });

      options.onHighlight?.(bestMatch);
    } else {
      // Segment-level highlighting
      let active: number | null = null;
      let bestMatch: number | null = null;
      let bestScore = -1;

      const sentenceSpans = document.querySelectorAll('.sentence');

      sentenceSpans.forEach((sp) => {
        const span = sp as HTMLElement;
        const start = Number(span.dataset.start) || 0;
        const end = Number(span.dataset.end) || start;

        if (ct >= start - HIGHLIGHT_EPS && ct <= end + HIGHLIGHT_EPS) {
          const score = 1000 - Math.abs(ct - (start + end) / 2);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = Number(span.dataset.renderIndex);
            active = bestMatch;
          }
        }
      });

      // Apply highlighting
      sentenceSpans.forEach((sp, idx) => {
        if (idx === active) {
          sp.classList.add('active');
        } else {
          sp.classList.remove('active');
        }
      });

      options.onHighlight?.(bestMatch);
    }
  }, [
    getAudioElement,
    isCharEditMode,
    charLevelData,
    charComposition,
    options,
  ]);

  /**
   * Start edited playback (segment mode)
   */
  const startEditedPlayback = useCallback(
    (fromPos: number = 0) => {
      const player = getAudioElement();
      if (!player || !composition.length || isNaN(player.duration)) return;

      if (editedPlaying) {
        stopEditedPlayback();
      }

      setEditedPlaying(true);
      setEditedPlayPos(fromPos);

      // Jump to first segment
      const firstIdx = composition[fromPos];
      const firstSeg = lastSegments[firstIdx];
      if (firstSeg) {
        player.currentTime = (firstSeg.start || 0) / 1000;
        highlightNow();
        player.play().catch((e) => {
          console.error('Play error:', e);
          stopEditedPlayback();
        });
      }

      // Monitor loop
      const monitor = () => {
        if (!editedPlaying) return;
        if (player.paused) {
          stopEditedPlayback();
          return;
        }

        const currentPos = editedPlayPos;
        const currentIdx = composition[currentPos];
        const currentSeg = lastSegments[currentIdx];
        const currentTime = player.currentTime * 1000;

        if (!currentSeg) return;

        // Check if segment has ended
        const segEnd = currentSeg.end || currentSeg.start || 0;
        if (currentTime >= segEnd - HIGHLIGHT_EPS) {
          const nextPos = currentPos + 1;

          if (nextPos >= composition.length) {
            // End of composition
            stopEditedPlayback();
            return;
          }

          setEditedPlayPos(nextPos);

          // Jump to next segment if not continuous
          const nextIdx = composition[nextPos];
          const nextSeg = lastSegments[nextIdx];
          const nextStart = (nextSeg.start || 0) / 1000;

          if (Math.abs(player.currentTime - nextStart) > CONTINUOUS_THRESHOLD) {
            player.currentTime = nextStart;
          }

          highlightNow();
        }

        editedRAFRef.current = requestAnimationFrame(monitor);
      };

      editedRAFRef.current = requestAnimationFrame(monitor);
    },
    [
      getAudioElement,
      composition,
      lastSegments,
      editedPlaying,
      editedPlayPos,
      setEditedPlaying,
      setEditedPlayPos,
      highlightNow,
    ]
  );

  /**
   * Stop edited playback
   */
  const stopEditedPlayback = useCallback(() => {
    setEditedPlaying(false);
    if (editedRAFRef.current) {
      cancelAnimationFrame(editedRAFRef.current);
      editedRAFRef.current = null;
    }
  }, [setEditedPlaying]);

  /**
   * Play/Pause controls
   */
  const play = useCallback(() => {
    const player = getAudioElement();
    if (player) {
      player.play().catch(console.error);
    }
  }, [getAudioElement]);

  const pause = useCallback(() => {
    const player = getAudioElement();
    if (player) {
      player.pause();
    }
  }, [getAudioElement]);

  const togglePlayPause = useCallback(() => {
    const player = getAudioElement();
    if (player) {
      if (player.paused) {
        play();
      } else {
        pause();
      }
    }
  }, [getAudioElement, play, pause]);

  /**
   * Seek control
   */
  const seek = useCallback(
    (time: number) => {
      const player = getAudioElement();
      if (player) {
        player.currentTime = time / 1000; // Convert ms to seconds
        highlightNow();
      }
    },
    [getAudioElement, highlightNow]
  );

  /**
   * Volume control
   */
  const setVolume = useCallback(
    (volume: number) => {
      const player = getAudioElement();
      if (player) {
        player.volume = Math.max(0, Math.min(1, volume));
      }
    },
    [getAudioElement]
  );

  // Setup event listeners
  useEffect(() => {
    const player = getAudioElement();
    if (!player) return;

    const handlePlay = () => {
      setIsPlaying(true);

      // Start highlighting loop
      if (highlightRAFRef.current) {
        cancelAnimationFrame(highlightRAFRef.current);
      }

      const loop = () => {
        if (!player.paused) {
          highlightNow();
        }
        if (!player.paused) {
          highlightRAFRef.current = requestAnimationFrame(loop);
        }
      };
      loop();
    };

    const handlePause = () => {
      setIsPlaying(false);

      // Stop highlighting loop
      if (highlightRAFRef.current) {
        cancelAnimationFrame(highlightRAFRef.current);
        highlightRAFRef.current = null;
      }

      // Clear highlights if not in edited playback mode
      if (!editedPlaying) {
        const sentenceSpans = document.querySelectorAll('.sentence');
        sentenceSpans.forEach((sp) => sp.classList.remove('active'));

        const charSpans = document.querySelectorAll('.char-unit');
        charSpans.forEach((sp) => sp.classList.remove('active'));
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(player.currentTime * 1000);
    };

    const handleLoadedMetadata = () => {
      setDuration(player.duration * 1000);
    };

    player.addEventListener('play', handlePlay);
    player.addEventListener('pause', handlePause);
    player.addEventListener('timeupdate', handleTimeUpdate);
    player.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      player.removeEventListener('play', handlePlay);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('timeupdate', handleTimeUpdate);
      player.removeEventListener('loadedmetadata', handleLoadedMetadata);

      if (highlightRAFRef.current) {
        cancelAnimationFrame(highlightRAFRef.current);
      }
      if (editedRAFRef.current) {
        cancelAnimationFrame(editedRAFRef.current);
      }
    };
  }, [getAudioElement, highlightNow, editedPlaying]);

  return {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    togglePlayPause,
    seek,
    setVolume,
    highlightNow,
    startEditedPlayback,
    stopEditedPlayback,
  };
};
