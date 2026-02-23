'use client';

interface FnbItemTileProps {
  name: string;
  priceCents: number;
  is86d: boolean;
  onTap: () => void;
  allergenIcons?: string[];
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function FnbItemTile({ name, priceCents, is86d, onTap, allergenIcons }: FnbItemTileProps) {
  return (
    <button
      type="button"
      onClick={is86d ? undefined : onTap}
      disabled={is86d}
      className={`relative flex flex-col items-center justify-center p-2 transition-opacity disabled:cursor-not-allowed ${
        is86d ? 'opacity-40' : 'hover:opacity-80'
      }`}
      style={{
        width: '100%',
        minHeight: 100,
        borderRadius: 'var(--fnb-radius-lg)',
        backgroundColor: 'var(--fnb-bg-elevated)',
      }}
    >
      {/* Item name */}
      <span
        className="text-sm font-semibold text-center leading-tight line-clamp-2"
        style={{ color: 'var(--fnb-text-primary)' }}
      >
        {name}
      </span>

      {/* Price */}
      <span className="text-xs mt-1" style={{ color: 'var(--fnb-text-muted)' }}>
        {formatMoney(priceCents)}
      </span>

      {/* 86'd overlay */}
      {is86d && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ borderRadius: 'var(--fnb-radius-lg)', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <span className="text-xs font-bold text-white">86&apos;d</span>
        </div>
      )}

      {/* Allergen icons */}
      {allergenIcons && allergenIcons.length > 0 && (
        <div className="absolute top-1 right-1 flex gap-0.5">
          {allergenIcons.slice(0, 3).map((icon, i) => (
            <span key={i} className="text-[10px]">{icon}</span>
          ))}
        </div>
      )}
    </button>
  );
}
