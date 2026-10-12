import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { TimelineLayoutItem, TimelinePlaybackState } from './types';
import {
  findLayoutItemAtTime,
  sourceToTimelineMs,
  timelineDurationMs,
  timelineToSourceMs,
} from './layout';
import { TIMELINE_MEDIA_PAUSE_EVENT } from './events';

interface UseTimelinePlaybackOptions {
  layout: readonly TimelineLayoutItem[];
  mediaRef: RefObject<HTMLMediaElement | null>;
  mediaElementKey: string;
  revision: number;
}

function clampTime(value: number, duration: number): number {
  return Math.max(0, Math.min(duration, Number.isFinite(value) ? value : 0));
}

export function useTimelinePlayback({
  layout,
  mediaRef,
  mediaElementKey,
  revision,
}: UseTimelinePlaybackOptions) {
  const durationMs = timelineDurationMs(layout);
  const [state, setState] = useState<TimelinePlaybackState>({
    playheadMs: 0,
    isPlaying: false,
    activeClipId: layout[0]?.clipId ?? null,
  });
  const stateRef = useRef(state);
  const layoutRef = useRef(layout);
  const itemByIdRef = useRef(new Map(layout.map((item) => [item.clipId, item])));
  const rafRef = useRef<number | null>(null);
  const replacementRef = useRef<HTMLAudioElement | null>(null);
  const internalPlayRef = useRef(false);
  const internalSeekTargetRef = useRef<number | null>(null);
  const replacementTailStartRef = useRef<number | null>(null);

  const updateState = useCallback((next: TimelinePlaybackState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    layoutRef.current = layout;
    itemByIdRef.current = new Map(layout.map((item) => [item.clipId, item]));
  }, [layout]);

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const pausePlayers = useCallback(() => {
    const media = mediaRef.current;
    if (media && !media.paused) media.pause();
    const replacement = replacementRef.current;
    if (replacement && !replacement.paused) replacement.pause();
  }, [mediaRef]);

  const stop = useCallback(() => {
    cancelRaf();
    pausePlayers();
    updateState({ ...stateRef.current, isPlaying: false });
  }, [cancelRaf, pausePlayers, updateState]);

  const monitorRef = useRef<() => void>(() => undefined);
  const startItemRef = useRef<(item: TimelineLayoutItem, offsetMs: number) => void>(() => undefined);

  const finishItem = useCallback(
    (item: TimelineLayoutItem) => {
      const currentLayout = layoutRef.current;
      const next = currentLayout[item.clipIndex + 1];
      if (!next) {
        cancelRaf();
        pausePlayers();
        updateState({ playheadMs: timelineDurationMs(currentLayout), isPlaying: false, activeClipId: null });
        return;
      }
      startItemRef.current(next, 0);
    },
    [cancelRaf, pausePlayers, updateState]
  );

  useEffect(() => {
    monitorRef.current = () => {
      if (!stateRef.current.isPlaying) return;
      const item = stateRef.current.activeClipId
        ? itemByIdRef.current.get(stateRef.current.activeClipId)
        : undefined;
      if (!item) {
        stop();
        return;
      }

      if (item.kind === 'replacement') {
        const replacement = replacementRef.current;
        if (!replacement) {
          stop();
          return;
        }
        const mediaElapsedMs = item.clip.duration_policy === 'fit_source'
          ? (replacement.currentTime * 1_000) / replacement.playbackRate
          : replacement.currentTime * 1_000;
        let offsetMs = mediaElapsedMs;
        if (item.clip.duration_policy === 'pad_or_trim' && replacement.ended) {
          if (replacementTailStartRef.current === null) {
            replacementTailStartRef.current = performance.now() - mediaElapsedMs;
          }
          offsetMs = performance.now() - replacementTailStartRef.current;
        }
        offsetMs = Math.min(item.durationMs, offsetMs);
        updateState({ playheadMs: item.timelineInMs + offsetMs, isPlaying: true, activeClipId: item.clipId });
        if (offsetMs >= item.durationMs - 1) {
          finishItem(item);
          return;
        }
      } else {
        const media = mediaRef.current;
        if (!media) {
          stop();
          return;
        }
        const sourceMs = media.currentTime * 1_000;
        const playheadMs = sourceToTimelineMs(item, sourceMs);
        updateState({ playheadMs, isPlaying: true, activeClipId: item.clipId });
        if (sourceMs >= item.sourceOutMs - 1 || media.ended) {
          finishItem(item);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(monitorRef.current);
    };
  }, [finishItem, mediaRef, stop, updateState]);

  useEffect(() => {
    startItemRef.current = (item, offsetMs) => {
      cancelRaf();
      const boundedOffsetMs = Math.max(0, Math.min(item.durationMs, offsetMs));
      const media = mediaRef.current;
      const previousReplacement = replacementRef.current;
      if (previousReplacement && !previousReplacement.paused) previousReplacement.pause();
      replacementTailStartRef.current = null;

      updateState({
        playheadMs: item.timelineInMs + boundedOffsetMs,
        isPlaying: true,
        activeClipId: item.clipId,
      });

      if (item.kind === 'replacement' && item.clip.replacement_artifact_id) {
        if (media && !media.paused) media.pause();
        const replacement = previousReplacement ?? new Audio();
        replacementRef.current = replacement;
        const expectedSrc = `/api/v1/artifacts/${item.clip.replacement_artifact_id}/content`;
        if (!replacement.src.endsWith(expectedSrc)) replacement.src = expectedSrc;
        const replacementDuration = item.clip.replacement_duration_ms ?? item.durationMs;
        replacement.playbackRate = item.clip.duration_policy === 'fit_source' && item.durationMs > 0
          ? Math.max(0.25, Math.min(4, replacementDuration / item.durationMs))
          : 1;
        replacement.currentTime = item.clip.duration_policy === 'fit_source'
          ? (boundedOffsetMs / 1_000) * replacement.playbackRate
          : Math.min(replacementDuration, boundedOffsetMs) / 1_000;
        replacement.play().then(() => {
          rafRef.current = requestAnimationFrame(monitorRef.current);
        }).catch(() => stop());
        return;
      }

      if (!media) {
        stop();
        return;
      }
      const sourceSeconds = timelineToSourceMs(item, item.timelineInMs + boundedOffsetMs) / 1_000;
      internalSeekTargetRef.current = sourceSeconds;
      media.currentTime = sourceSeconds;
      if (!media.paused) {
        rafRef.current = requestAnimationFrame(monitorRef.current);
        return;
      }
      internalPlayRef.current = true;
      media.play().then(() => {
        rafRef.current = requestAnimationFrame(monitorRef.current);
      }).catch(() => {
        internalPlayRef.current = false;
        stop();
      });
    };
  }, [cancelRaf, mediaRef, stop, updateState]);

  const seek = useCallback(
    (timelineMs: number, autoplay = false) => {
      const currentLayout = layoutRef.current;
      const bounded = clampTime(timelineMs, timelineDurationMs(currentLayout));
      const item = findLayoutItemAtTime(currentLayout, bounded);
      cancelRaf();
      pausePlayers();
      if (!item) {
        updateState({ playheadMs: bounded, isPlaying: false, activeClipId: null });
        return;
      }
      if (autoplay) {
        startItemRef.current(item, bounded - item.timelineInMs);
        return;
      }
      if (item.kind === 'source' && mediaRef.current) {
        const sourceSeconds = timelineToSourceMs(item, bounded) / 1_000;
        internalSeekTargetRef.current = sourceSeconds;
        mediaRef.current.currentTime = sourceSeconds;
      }
      updateState({ playheadMs: bounded, isPlaying: false, activeClipId: item.clipId });
    },
    [cancelRaf, mediaRef, pausePlayers, updateState]
  );

  const play = useCallback(() => {
    const currentLayout = layoutRef.current;
    if (currentLayout.length === 0) return;
    let playheadMs = stateRef.current.playheadMs;
    if (playheadMs >= timelineDurationMs(currentLayout)) playheadMs = 0;
    const item = findLayoutItemAtTime(currentLayout, playheadMs) ?? currentLayout[0];
    startItemRef.current(item, playheadMs - item.timelineInMs);
  }, []);

  const toggle = useCallback(() => {
    if (stateRef.current.isPlaying) stop();
    else play();
  }, [play, stop]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const handleNativePlay = () => {
      if (internalPlayRef.current) {
        internalPlayRef.current = false;
        return;
      }
      media.pause();
      play();
    };
    const handleNativeSeeking = () => {
      const internalTarget = internalSeekTargetRef.current;
      internalSeekTargetRef.current = null;
      if (internalTarget !== null && Math.abs(media.currentTime - internalTarget) < 0.01) {
        return;
      }
      cancelRaf();
      pausePlayers();
      const sourceMs = media.currentTime * 1_000;
      const matches = layoutRef.current.filter(
        (item) => item.kind === 'source' && sourceMs >= item.sourceInMs && sourceMs < item.sourceOutMs
      );
      const active = stateRef.current.activeClipId
        ? itemByIdRef.current.get(stateRef.current.activeClipId)
        : undefined;
      const match = matches.find((item) => item.clipId === active?.clipId) ?? matches[0];
      if (match) {
        updateState({
          playheadMs: sourceToTimelineMs(match, sourceMs),
          isPlaying: false,
          activeClipId: match.clipId,
        });
      }
    };
    const handleNativePause = () => {
      const active = stateRef.current.activeClipId
        ? itemByIdRef.current.get(stateRef.current.activeClipId)
        : undefined;
      if (stateRef.current.isPlaying && active?.kind === 'source') stop();
    };
    media.addEventListener('play', handleNativePlay);
    media.addEventListener('pause', handleNativePause);
    media.addEventListener('seeking', handleNativeSeeking);
    return () => {
      media.removeEventListener('play', handleNativePlay);
      media.removeEventListener('pause', handleNativePause);
      media.removeEventListener('seeking', handleNativeSeeking);
    };
  }, [cancelRaf, mediaElementKey, mediaRef, pausePlayers, play, stop, updateState]);

  useEffect(() => {
    const handlePause = () => {
      const active = stateRef.current.activeClipId
        ? itemByIdRef.current.get(stateRef.current.activeClipId)
        : undefined;
      if (stateRef.current.isPlaying && active?.kind === 'source') stop();
    };
    window.addEventListener(TIMELINE_MEDIA_PAUSE_EVENT, handlePause);
    return () => window.removeEventListener(TIMELINE_MEDIA_PAUSE_EVENT, handlePause);
  }, [stop]);

  useEffect(() => {
    stop();
    const nextDuration = timelineDurationMs(layout);
    const playheadMs = clampTime(stateRef.current.playheadMs, nextDuration);
    const item = findLayoutItemAtTime(layout, playheadMs);
    updateState({ playheadMs, isPlaying: false, activeClipId: item?.clipId ?? null });
  }, [revision, layout, stop, updateState]);

  useEffect(
    () => () => {
      cancelRaf();
      pausePlayers();
      if (replacementRef.current) {
        replacementRef.current.removeAttribute('src');
        replacementRef.current.load();
      }
    },
    [cancelRaf, pausePlayers]
  );

  return { ...state, durationMs, play, stop, toggle, seek };
}
