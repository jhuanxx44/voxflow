/**
 * MediaPlayer Component
 *
 * Unified media player that renders <video> or <audio> based on mediaType.
 * Both HTML5 elements share the same HTMLMediaElement API for time sync.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { useASRStore } from '@/stores/asrStore';

interface MediaPlayerProps {
  onPlay?: () => void;
  onPause?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
  onLoadedMetadata?: () => void;
  className?: string;
}

export const MediaPlayer: React.FC<MediaPlayerProps> = ({
  onPlay,
  onPause,
  onTimeUpdate,
  onLoadedMetadata,
  className = '',
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { audioUrl, mediaType } = useASRStore();

  // Get the active media element based on type
  const getMediaElement = useCallback((): HTMLMediaElement | null => {
    return mediaType === 'video' ? videoRef.current : audioRef.current;
  }, [mediaType]);

  // Setup event listeners for the current media type
  useEffect(() => {
    const media = getMediaElement();
    if (!media) return;

    const handlePlay = () => onPlay?.();
    const handlePause = () => onPause?.();
    const handleTimeUpdate = () => onTimeUpdate?.(media.currentTime * 1000);
    const handleLoadedMetadata = () => onLoadedMetadata?.();

    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [mediaType, onPlay, onPause, onTimeUpdate, onLoadedMetadata, getMediaElement]);

  // Update media source when audioUrl changes
  useEffect(() => {
    const media = getMediaElement();
    if (!media) return;

    if (audioUrl) {
      media.src = audioUrl;
      media.load();
    } else {
      media.removeAttribute('src');
      media.load();
    }
  }, [audioUrl, mediaType, getMediaElement]);

  return (
    <div className={`w-full ${className}`}>
      {mediaType === 'video' ? (
        <video
          data-testid="media-player"
          ref={videoRef}
          id="player"
          className="w-full rounded-lg"
          controls
          style={{
            maxHeight: '400px',
            backgroundColor: 'var(--bg-input)',
          }}
        />
      ) : (
        <audio
          data-testid="media-player"
          ref={audioRef}
          id="player"
          className="w-full"
          controls
          style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: '8px',
          }}
        />
      )}
    </div>
  );
};

// Export ref type for use in hooks (HTMLMediaElement covers both audio/video)
export type MediaPlayerRef = HTMLMediaElement;

// Export a version with ref forwarding for advanced use cases
export const MediaPlayerWithRef = React.forwardRef<
  HTMLMediaElement,
  MediaPlayerProps
>((props, ref) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { audioUrl, mediaType } = useASRStore();

  // Get the active media element based on type
  const getMediaElement = useCallback((): HTMLMediaElement | null => {
    return mediaType === 'video' ? videoRef.current : audioRef.current;
  }, [mediaType]);

  // Combine refs - update forwarded ref when media element changes
  useEffect(() => {
    const element = getMediaElement();
    if (typeof ref === 'function') {
      ref(element);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLMediaElement | null>).current = element;
    }
  }, [ref, mediaType, getMediaElement]);

  // Setup event listeners
  useEffect(() => {
    const media = getMediaElement();
    if (!media) return;

    const handlePlay = () => props.onPlay?.();
    const handlePause = () => props.onPause?.();
    const handleTimeUpdate = () =>
      props.onTimeUpdate?.(media.currentTime * 1000);
    const handleLoadedMetadata = () => props.onLoadedMetadata?.();

    media.addEventListener('play', handlePlay);
    media.addEventListener('pause', handlePause);
    media.addEventListener('timeupdate', handleTimeUpdate);
    media.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      media.removeEventListener('play', handlePlay);
      media.removeEventListener('pause', handlePause);
      media.removeEventListener('timeupdate', handleTimeUpdate);
      media.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [props, mediaType, getMediaElement]);

  // Update media source when audioUrl changes
  useEffect(() => {
    const media = getMediaElement();
    if (!media) return;

    if (audioUrl) {
      media.src = audioUrl;
      media.load();
    } else {
      media.removeAttribute('src');
      media.load();
    }
  }, [audioUrl, mediaType, getMediaElement]);

  return (
    <div className={`w-full ${props.className || ''}`}>
      {mediaType === 'video' ? (
        <video
          data-testid="media-player"
          ref={videoRef}
          id="player"
          className="w-full rounded-lg"
          controls
          style={{
            maxHeight: '400px',
            backgroundColor: 'var(--bg-input)',
          }}
        />
      ) : (
        <audio
          data-testid="media-player"
          ref={audioRef}
          id="player"
          className="w-full"
          controls
          style={{
            backgroundColor: 'var(--bg-input)',
            borderRadius: '8px',
          }}
        />
      )}
    </div>
  );
});

MediaPlayerWithRef.displayName = 'MediaPlayerWithRef';
