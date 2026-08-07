/**
 * AudioPlayer Component
 *
 * HTML5 audio player with controls for playback, progress tracking, and time display.
 * Integrates with asrStore for audio URL management.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useASRStore } from '@/stores/asrStore';

interface AudioPlayerProps {
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: () => void;
  className?: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  onPlay,
  onPause,
  onTimeUpdate,
  onLoadedMetadata,
  className = '',
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { audioUrl } = useASRStore();

  // Setup event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => {
      onPlay?.();
    };

    const handlePause = () => {
      onPause?.();
    };

    const handleTimeUpdate = () => {
      onTimeUpdate?.(audio.currentTime * 1000); // Convert to milliseconds
    };

    const handleLoadedMetadata = () => {
      onLoadedMetadata?.();
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [onPlay, onPause, onTimeUpdate, onLoadedMetadata]);

  // Update audio source when audioUrl changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audioUrl) {
      audio.src = audioUrl;
      audio.load();
    } else {
      audio.removeAttribute('src');
      audio.load();
    }
  }, [audioUrl]);

  return (
    <div className={`w-full ${className}`}>
      <audio
        ref={audioRef}
        id="player"
        className="w-full"
        controls
        style={{
          backgroundColor: 'var(--bg-input)',
          borderRadius: '8px',
        }}
      />
    </div>
  );
};

// Export ref type for use in hooks
export type AudioPlayerRef = HTMLAudioElement;

// Export a version with ref forwarding for advanced use cases
export const AudioPlayerWithRef = React.forwardRef<
  HTMLAudioElement,
  AudioPlayerProps
>((props, ref) => {
  const localRef = useRef<HTMLAudioElement>(null);
  const { audioUrl } = useASRStore();

  // Combine refs - use callback ref pattern for proper ref assignment
  const setRefs = useCallback((element: HTMLAudioElement | null) => {
    // Update local ref
    (localRef as React.MutableRefObject<HTMLAudioElement | null>).current = element;

    // Update forwarded ref
    if (typeof ref === 'function') {
      ref(element);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLAudioElement | null>).current = element;
    }
  }, [ref]);

  // Setup event listeners
  useEffect(() => {
    const audio = localRef.current;
    if (!audio) return;

    const handlePlay = () => props.onPlay?.();
    const handlePause = () => props.onPause?.();
    const handleTimeUpdate = () =>
      props.onTimeUpdate?.(audio.currentTime * 1000);
    const handleLoadedMetadata = () => props.onLoadedMetadata?.();

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [props]);

  // Update audio source when audioUrl changes
  useEffect(() => {
    const audio = localRef.current;
    if (!audio) return;

    if (audioUrl) {
      audio.src = audioUrl;
      audio.load();
    } else {
      audio.removeAttribute('src');
      audio.load();
    }
  }, [audioUrl]);

  return (
    <div className={`w-full ${props.className || ''}`}>
      <audio
        ref={setRefs}
        id="player"
        className="w-full"
        controls
        style={{
          backgroundColor: 'var(--bg-input)',
          borderRadius: '8px',
        }}
      />
    </div>
  );
});

AudioPlayerWithRef.displayName = 'AudioPlayerWithRef';
