'use client';

import { useEffect } from 'react';

const CAPTURE_ID_KEY='pieCaptureSessionId';
const PENDING_CAPTURE_ID_KEY='piePendingCaptureId';

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

    const rememberCapture = () => {
      const current=sessionStorage.getItem(CAPTURE_ID_KEY)||'';
      if(current)sessionStorage.setItem(PENDING_CAPTURE_ID_KEY,current);
    };

    let checking=false;
    const checkForSelection = async () => {
      rememberCapture();
      if(checking||window.location.pathname==='/capture-options')return;
      const id=sessionStorage.getItem(PENDING_CAPTURE_ID_KEY)||'';
      if(!id)return;
      checking=true;
      try{
        const response=await fetch('/api/capture-session',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'status',id}),
          credentials:'same-origin',
          cache:'no-store',
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)return;
        if(String(data?.status||'')!=='accepted')return;
        try{
          const parsed=JSON.parse(String(data?.result||''));
          if(parsed?.awaitingSelection&&parsed?.stagedPath){
            window.location.assign(`/capture-options?captureId=${encodeURIComponent(id)}`);
          }
        }catch{}
      }catch{}
      finally{checking=false;}
    };

    const observer = new MutationObserver(makeCaptureDialogMobileSafe);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', handleClick);
    document.addEventListener('visibilitychange', rememberCapture);
    window.addEventListener('pagehide',rememberCapture);
    window.addEventListener('focus',()=>{void checkForSelection();});
    window.addEventListener('pageshow',()=>{void checkForSelection();});
    const captureTimer=window.setInterval(()=>{void checkForSelection();},1000);

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
      document.removeEventListener('visibilitychange', rememberCapture);
      window.removeEventListener('pagehide',rememberCapture);
      window.clearInterval(captureTimer);
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
