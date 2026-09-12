'use client';

import { useEffect } from 'react';
import VocalLayerBuilder from './VocalLayerBuilder';

function pauseMedia(except?: HTMLMediaElement | null) {
  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
    if (media === except) return;
    if (!media.paused) media.pause();
  });
}

function stopWebAudio() {
  window.dispatchEvent(new Event('ai-songs-stop-webaudio'));
}

function stopAllAudio(except?: HTMLMediaElement | null) {
  pauseMedia(except);
  stopWebAudio();
}

export default function AudioPolicy() {
  useEffect(() => {
    let navigationGuard: number | null = null;

    const clearNavigationGuard = () => {
      if (navigationGuard !== null) window.clearInterval(navigationGuard);
      navigationGuard = null;
    };

    const guardAgainstLateMixPlayback = () => {
      clearNavigationGuard();
      const startedAt = Date.now();
      navigationGuard = window.setInterval(() => {
        if (document.querySelector('.mixConsole') || Date.now() - startedAt > 15_000) {
          clearNavigationGuard();
          return;
        }
        // Mix playback is WebAudio. Keep stopping only WebAudio here so a song
        // the user intentionally starts in Songs (HTMLAudioElement) is not paused.
        stopWebAudio();
      }, 250);
    };

    const onPlay = (event: Event) => {
      const media = event.target instanceof HTMLMediaElement ? event.target : null;
      if (!media) return;
      stopAllAudio(media);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopAllAudio();
    };

    const onStartWebAudio = () => {
      clearNavigationGuard();
      stopAllAudio();
    };

    const onPageHide = () => stopAllAudio();
    const onStopAll = () => {
      stopAllAudio();
      // A screen change dispatches this after Mix has left the DOM. Keep sending
      // WebAudio stop signals briefly so an in-flight Mix decode cannot start later.
      if (!document.querySelector('.mixConsole')) guardAgainstLateMixPlayback();
    };

    document.addEventListener('play', onPlay, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('ai-songs-start-webaudio', onStartWebAudio);
    window.addEventListener('ai-songs-stop-all-audio', onStopAll);

    return () => {
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('ai-songs-start-webaudio', onStartWebAudio);
      window.removeEventListener('ai-songs-stop-all-audio', onStopAll);
      clearNavigationGuard();
    };
  }, []);

  return <VocalLayerBuilder />;
}
