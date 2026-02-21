'use client';

interface QuickItem {
  id: string;
  name: string;
  priceCents: number;
}

interface QuickItemsRowProps {
  items: QuickItem[];
  onTap: (itemId: string) => void;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function QuickItemsRow({ items, onTap }: QuickItemsRowProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="flex gap-1.5 px-2 py-1.5 overflow-x-auto shrink-0 border-b"
      style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTap(item.id)}
          className="flex flex-col items-center justify-center rounded-lg px-3 py-1.5 shrink-0 transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'var(--fnb-status-seated)',
            minWidth: '64px',
          }}
        >
          <span className="text-[10px] font-semibold text-white whitespace-nowrap">{item.name}</span>
          <span className="text-[9px] fnb-mono text-white/70">{formatMoney(item.priceCents)}</span>
        </button>
      ))}
    </div>
  );
}
