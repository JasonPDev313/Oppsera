'use client';

interface Room {
  id: string;
  name: string;
}

interface RoomTabsProps {
  rooms: Room[];
  activeRoomId: string | null;
  onSelect: (roomId: string) => void;
}

export function RoomTabs({ rooms, activeRoomId, onSelect }: RoomTabsProps) {
  if (rooms.length <= 1) return null;

  return (
    <div className="flex sm:flex-col gap-1 p-1 overflow-x-auto sm:overflow-x-visible shrink-0" style={{ minWidth: 'auto' }}>
      {/* Horizontal on handheld (<640px), vertical on tablet+ */}
      {rooms.map((room) => {
        const isActive = room.id === activeRoomId;
        return (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelect(room.id)}
            className={`
              rounded-lg px-2 py-3 text-xs font-semibold text-center transition-colors
              fnb-touch-min
              ${isActive
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {room.name}
          </button>
        );
      })}
    </div>
  );
}
