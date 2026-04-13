import { useEffect, useRef, useState } from 'react';

interface AudioDurationSource {
  audioUrl: string;
  duration?: number;
}

function isValidDuration(duration?: number): duration is number {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
}

export function useResolvedAudioDurations(sources: AudioDurationSource[]) {
  const cacheRef = useRef<Map<string, number>>(new Map());
  const loadingRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    sources.forEach((source) => {
      if (!source.audioUrl) {
        return;
      }

      if (isValidDuration(source.duration)) {
        cacheRef.current.set(source.audioUrl, source.duration);
        return;
      }

      if (cacheRef.current.has(source.audioUrl) || loadingRef.current.has(source.audioUrl)) {
        return;
      }

      loadingRef.current.add(source.audioUrl);

      const audio = new Audio();
      audio.preload = 'metadata';

      const finalize = () => {
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
        audio.removeEventListener('error', handleError);
        audio.src = '';
        audio.load();
        loadingRef.current.delete(source.audioUrl);
      };

      const handleLoadedMetadata = () => {
        if (!cancelled && isValidDuration(audio.duration)) {
          cacheRef.current.set(source.audioUrl, audio.duration);
          forceUpdate((value) => value + 1);
        }
        finalize();
      };

      const handleError = () => {
        finalize();
      };

      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('error', handleError);
      audio.src = source.audioUrl;

      cleanups.push(() => {
        finalize();
      });
    });

    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [sources]);

  return cacheRef.current;
}
