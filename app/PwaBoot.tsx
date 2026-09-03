'use client';

import { useEffect } from 'react';

export default function PwaBoot() {
  useEffect(() => {
    const makeCaptureDialogMobileSafe = () => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      const card = dialog?.firstElementChild as HTMLElement | null;
      if (!card) return;
      card.style.maxHeight = 'calc(100dvh - 40px)';
      card.style.overflowY = 'auto';
      card.style.overscrollBehavior = 'contain';
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest('button') as HTMLButtonElement | null;
      if (!button) return;
      if (!button.textContent?.includes('I have permission to record this content')) return;

      makeCaptureDialogMobileSafe();
      window.setTimeout(() => {
        const dialog = button.closest('[role="dialog"]');
        const continueButton = Array.from(dialog?.querySelectorAll('button') || [])
          .find(candidate => candidate.textContent?.trim() === 'Continue') as HTMLButtonElement | undefined;
        if (!continueButton) return;
        continueButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => continueButton.focus({ preventScroll: true }), 180);
      }, 60);
    };

    const observer = new MutationObserver(makeCaptureDialogMobileSafe);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handleClick);

    const register = async () => {
      if (!('serviceWorker' in navigator)) return;
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (error) {
        console.warn('Pie service worker registration failed', error);
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick);
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
