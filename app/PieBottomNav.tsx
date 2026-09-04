' use client';

import { useUser } from '@clerk/nextjs';

const items = [
  { id: 'create', icon: '🎶', label: 'Music', minLevel: 1 },
  { id: 'train', icon: '🎤', label: 'Voice', minLevel: 1 },
  { id: 'songs', icon: '🎵', label: 'Songs', minLevel: 1 },
  { id: 'mix', icon: '🎚️', label: 'Mix', minLevel: 1 },
  { id: 'sheets', icon: '📄', label: 'Sheets', minLevel: 1 },
  { id: 'video', icon: '🎬', label: 'Video', minLevel: 3 },
  { id: 'marketing', icon: '📣', label: 'Marketing', minLevel: 3 },
  { id: 'merch', icon: '👕', label: 'Merch', minLevel: 3 },
  { id: 'gigs', icon: '🎟️', label: 'Gigs', minLevel: 6 },
  { id: 'band', icon: '👥', label: 'Band', minLevel: 6 },
  { id: 'licensing', icon: '⚖️', label: 'Licensing', minLevel: 2 },
  { id: 'legal', icon: '📚', label: 'Legal', minLevel: 2 },
  { id: 'calendar', icon: '📅', label: 'Calendar', minLevel: 2 },
  { id: 'travel', icon: '✈️', label: 'Travel', minLevel: 6 },
  { id: 'business', icon: '💼', label: 'Business', minLevel: 5 },
  { id: 'accounting', icon: '🧾', label: 'Accounting', minLevel: 5 },
] as const;

export default function PieBottomNav({ active, onNavigate }: { active: string; onNavigate: (screen: string) => void }) {
  const { user } = useUser();
  const publicMetadata = (user?.publicMetadata || {}) as Record<string, unknown>;
  const planLevel = Math.max(1, Number(publicMetadata.piePlanLevel || 1));

  return (
    <nav className="pieExpandedNav noPrint" aria-label="Main navigation">
      <div className="pieExpandedNavScroller">
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
                onNavigate(item.id);
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
