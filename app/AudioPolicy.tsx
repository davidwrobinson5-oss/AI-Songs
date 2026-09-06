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
    const contexts = new Set<AudioContext>();
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let restoreDecode: (() => void) | null = null;

    if (AudioContextCtor) {
      const proto = AudioContextCtor.prototype as AudioContext & { decodeAudioData: AudioContext['decodeAudioData'] };
      const originalDecode = proto.decodeAudioData;
      proto.decodeAudioData = function(...args: Parameters<AudioContext['decodeAudioData']>) {
        contexts.add(this as AudioContext);
        return originalDecode.apply(this, args as Parameters<AudioContext['decodeAudioData']>);
      } as AudioContext['decodeAudioData'];
      restoreDecode = () => { proto.decodeAudioData = originalDecode; };
    }

    const stopContexts = () => {
      contexts.forEach((context) => {
        if (context.state !== 'closed') void context.close().catch(() => undefined);
      });
      contexts.clear();
    };

    const onPlay = (event: Event) => {
      const media = event.target instanceof HTMLMediaElement ? event.target : null;
      if (!media) return;
      stopAllAudio(media);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopAllAudio();
        stopContexts();
      }
    };

    const onPageHide = () => {
      stopAllAudio();
      stopContexts();
    };
    const onStopAll = () => {
      stopAllAudio();
      stopContexts();
    };

    document.addEventListener('play', onPlay, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('ai-songs-stop-all-audio', onStopAll);

    return () => {
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('ai-songs-stop-all-audio', onStopAll);
      stopContexts();
      restoreDecode?.();
    };
  }, []);

  return null;
}
