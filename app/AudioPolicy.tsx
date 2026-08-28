'use client';

import { useEffect } from 'react';

function pauseMedia(except?: HTMLMediaElement | null) {
  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
    if (media === except) return;
    if (!media.paused) media.pause();
  });
}

function stopAllAudio(except?: HTMLMediaElement | null) {
  pauseMedia(except);
  window.dispatchEvent(new Event('ai-songs-stop-webaudio'));
}

export default function AudioPolicy() {
  useEffect(() => {
    const onPlay = (event: Event) => {
      const media = event.target instanceof HTMLMediaElement ? event.target : null;
      if (!media) return;
      stopAllAudio(media);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopAllAudio();
    };

    const onPageHide = () => stopAllAudio();
    const onStopAll = () => stopAllAudio();

    document.addEventListener('play', onPlay, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('ai-songs-stop-all-audio', onStopAll);

    return () => {
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('ai-songs-stop-all-audio', onStopAll);
    };
  }, []);

  return null;
}
