'use client';

interface Room {
  id: string;
  name: string;
  availableCount: number;
  totalCount: number;
}

interface RoomTabBarProps {
  rooms: Room[];
  activeRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
}

export function RoomTabBar({ rooms, activeRoomId, onSelectRoom }: RoomTabBarProps) {
  if (rooms.length <= 1) return null;

  return (
    <div
      className="flex items-center gap-1 overflow-x-auto pb-0.5 shrink-0"
      style={{ scrollbarWidth: 'none' }}
    >
      {/* All rooms tab */}
      <button
        type="button"
        onClick={() => onSelectRoom(null)}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 shrink-0 transition-all"
        style={{
          backgroundColor: activeRoomId === null ? 'var(--fnb-bg-elevated)' : 'transparent',
          color: activeRoomId === null ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
          borderBottom: activeRoomId === null ? '2px solid var(--fnb-info)' : '2px solid transparent',
        }}
      >
        <span className="text-[11px] font-semibold">All</span>
        <span
          className="text-[9px] font-bold tabular-nums rounded px-1.5 py-0.5"
          style={{
            backgroundColor: 'var(--fnb-bg-elevated)',
            color: 'var(--fnb-text-muted)',
            fontFamily: 'var(--fnb-font-mono)',
          }}
        >
          {rooms.reduce((sum, r) => sum + r.availableCount, 0)}/{rooms.reduce((sum, r) => sum + r.totalCount, 0)}
        </span>
      </button>

      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          onClick={() => onSelectRoom(room.id)}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 shrink-0 transition-all"
          style={{
            backgroundColor: activeRoomId === room.id ? 'var(--fnb-bg-elevated)' : 'transparent',
            color: activeRoomId === room.id ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
            borderBottom: activeRoomId === room.id ? '2px solid var(--fnb-info)' : '2px solid transparent',
          }}
        >
          <span className="text-[11px] font-semibold">{room.name}</span>
          <span
            className="text-[9px] font-bold tabular-nums rounded px-1.5 py-0.5"
            style={{
              backgroundColor: 'var(--fnb-bg-elevated)',
              color: 'var(--fnb-text-muted)',
              fontFamily: 'var(--fnb-font-mono)',
            }}
          >
            {room.availableCount}/{room.totalCount}
          </span>
        </button>
      ))}
    </div>
  );
}
