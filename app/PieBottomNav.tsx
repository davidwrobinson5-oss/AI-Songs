'use client';

const items = [
  { id: 'create', icon: '🎶', label: 'Music' },
  { id: 'train', icon: '🎤', label: 'Voice' },
  { id: 'songs', icon: '🎵', label: 'Songs' },
  { id: 'mix', icon: '🎚️', label: 'Mix' },
  { id: 'sheets', icon: '📄', label: 'Sheets' },
  { id: 'video', icon: '🎬', label: 'Video' },
  { id: 'marketing', icon: '📣', label: 'Marketing' },
  { id: 'merch', icon: '👕', label: 'Merch' },
  { id: 'gigs', icon: '🎟️', label: 'Gigs' },
  { id: 'band', icon: '👥', label: 'Band' },
  { id: 'licensing', icon: '⚖️', label: 'Licensing' },
  { id: 'legal', icon: '📚', label: 'Legal' },
  { id: 'calendar', icon: '📅', label: 'Calendar' },
  { id: 'travel', icon: '✈️', label: 'Travel' },
  { id: 'business', icon: '💼', label: 'Business' },
  { id: 'accounting', icon: '🧾', label: 'Accounting' },
] as const;

export default function PieBottomNav({ active, onNavigate }: { active: string; onNavigate: (screen: string) => void }) {
  return (
    <nav className="pieExpandedNav noPrint" aria-label="Main navigation">
      <div className="pieExpandedNavScroller">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={active === item.id ? 'navActive' : ''}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <b>{item.icon}</b>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
    </nav>
  );
}
