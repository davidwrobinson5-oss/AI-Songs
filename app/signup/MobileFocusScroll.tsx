'use client';

import { useEffect } from 'react';

export default function MobileFocusScroll() {
  useEffect(() => {
    function keepFocusedFieldVisible(event: FocusEvent) {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLSelectElement)) return;

      window.setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      }, 280);
    }

    document.addEventListener('focusin', keepFocusedFieldVisible);
    return () => document.removeEventListener('focusin', keepFocusedFieldVisible);
  }, []);

  return null;
}
