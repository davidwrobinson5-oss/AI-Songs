'use client';

import { useLayoutEffect, useRef } from 'react';

const items = [
  { id: 'create', icon: '🎶', label: 'Music', minLevel: 1 },
  { id: 'train', icon: '🎤', label: 'Voice', minLevel: 1 },
  { id: 'songs', icon: '🎵', label: 'Songs', minLevel: 1 },
  { id: 'mix', icon: '🎚️', label: 'Mix', minLevel: 1 },
  { id: 'sheets', icon: '📄', label: 'Sheets', minLevel: 1 },
  { id: 'video', icon: '🎬', label: 'Video', minLevel: 3 },
  { id: 'merch', icon: '👕', label: 'Merch', minLevel: 3 },
  { id: 'band', icon: '👥', label: 'Band', minLevel: 6 },
  { id: 'gigs', icon: '🎟️', label: 'Gigs', minLevel: 6 },
  { id: 'calendar', icon: '📅', label: 'Calendar', minLevel: 2 },
  { id: 'scoreboard', icon: '🏆', label: 'Scoreboard', minLevel: 1 },

  { id: 'marketing', icon: '📣', label: 'Marketing', minLevel: 3 },
  { id: 'data', icon: '🗂️', label: 'Data', minLevel: 3 },
  { id: 'licensing', icon: '⚖️', label: 'Licensing', minLevel: 2 },
  { id: 'legal', icon: '📚', label: 'Legal', minLevel: 2 },
  { id: 'travel', icon: '✈️', label: 'Travel', minLevel: 6 },
  { id: 'business', icon: '💼', label: 'Business', minLevel: 5 },
  { id: 'accounting', icon: '🧾', label: 'Accounting', minLevel: 5 },
  { id: 'cyber', icon: '🛡️', label: 'Cyber Security', minLevel: 1 },
] as const;

const NAV_SCROLL_KEY = 'pieNavScrollLeft';
let rememberedScrollLeft = 0;

export default function PieBottomNav({ active, onNavigate }: { active: string; onNavigate: (screen: string) => void }) {
  // Private beta/studio mode intentionally exposes all workspaces without
  // requiring Clerk during server rendering. Stage gating can be restored
  // when Clerk is explicitly re-enabled.
  const planLevel = 8;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);

  function rememberPosition() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    rememberedScrollLeft = scroller.scrollLeft;
    try { sessionStorage.setItem(NAV_SCROLL_KEY, String(rememberedScrollLeft)); } catch {}
  }

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let target = rememberedScrollLeft;
    try {
      const stored = Number(sessionStorage.getItem(NAV_SCROLL_KEY));
      if (Number.isFinite(stored) && stored >= 0) target = stored;
    } catch {}

    scroller.scrollLeft = target;
    rememberedScrollLeft = target;
    restoredRef.current = true;

    const frame = requestAnimationFrame(() => {
      if (scrollerRef.current) scrollerRef.current.scrollLeft = rememberedScrollLeft;
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function navigateTo(screen: string) {
    rememberPosition();
    const position = rememberedScrollLeft;
    onNavigate(screen);

    // Some workspaces remount or relayout the navigation. Re-apply the exact
    // user-selected scroll position after the screen changes instead of
    // letting the browser snap the tab row back to the beginning.
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      scroller.scrollLeft = position;
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollLeft = position;
      });
    });
  }

  return (
    <nav className="pieExpandedNav noPrint" aria-label="Main navigation">
      <div
        ref={scrollerRef}
        className="pieExpandedNavScroller"
        onScroll={() => {
          if (!restoredRef.current) return;
          rememberPosition();
        }}
      >
        {items.map((item) => {
          const locked = planLevel < item.minLevel;
          return (
            <button
              type="button"
              key={item.id}
              className={active === item.id ? 'navActive' : ''}
              aria-current={active === item.id ? 'page' : undefined}
              aria-label={locked ? `${item.label} requires Pie Stage ${item.minLevel}` : item.label}
              onClick={() => {
                if (locked) {
                  window.location.href = `/onboarding?upgrade=${item.minLevel}`;
                  return;
                }
                navigateTo(item.id);
              }}
            >
              <b>{locked ? '🔒' : item.icon}</b>
              <small>{item.label}</small>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
