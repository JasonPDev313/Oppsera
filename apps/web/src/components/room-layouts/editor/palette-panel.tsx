'use client';

import { useState, useCallback } from 'react';
import {
  Circle,
  Square,
  RectangleHorizontal,
  Armchair,
  Minus,
  DoorOpen,
  Columns2,
  Theater,
  Wine,
  UtensilsCrossed,
  Music2,
  Mic2,
  MapPin,
  Type,
  ChevronDown,
  ChevronRight,
  Monitor,
  Coffee,
  Trash2,
  UserCheck,
  GlassWater,
} from 'lucide-react';
import { useEditorStore } from '@/stores/room-layout-editor';
import type { CanvasObject, ObjectType } from '@oppsera/shared';

// ── Palette Items ────────────────────────────────────────────────

interface PaletteItem {
  type: ObjectType;
  name: string;
  icon: typeof Circle;
  defaultWidth: number;
  defaultHeight: number;
  defaultProperties: Record<string, unknown>;
}

interface PaletteGroup {
  name: string;
  items: PaletteItem[];
}

const DEFAULT_STYLE = {
  fill: '#e2e8f0',
  stroke: '#64748b',
  strokeWidth: 1,
  opacity: 1,
};

const paletteGroups: PaletteGroup[] = [
  {
    name: 'Tables',
    items: [
      { type: 'table', name: 'Round 4-seat', icon: Circle, defaultWidth: 48, defaultHeight: 48, defaultProperties: { shape: 'round', seats: 4, minSeats: 2, maxSeats: 6, tableNumber: '', status: 'available', section: '', serverAssignment: '', isJoinable: true } },
      { type: 'table', name: 'Round 6-seat', icon: Circle, defaultWidth: 60, defaultHeight: 60, defaultProperties: { shape: 'round', seats: 6, minSeats: 4, maxSeats: 8, tableNumber: '', status: 'available', section: '', serverAssignment: '', isJoinable: true } },
      { type: 'table', name: 'Round 8-seat', icon: Circle, defaultWidth: 72, defaultHeight: 72, defaultProperties: { shape: 'round', seats: 8, minSeats: 6, maxSeats: 10, tableNumber: '', status: 'available', section: '', serverAssignment: '', isJoinable: true } },
      { type: 'table', name: 'Square 2-seat', icon: Square, defaultWidth: 36, defaultHeight: 36, defaultProperties: { shape: 'square', seats: 2, minSeats: 1, maxSeats: 4, tableNumber: '', status: 'available', section: '', serverAssignment: '', isJoinable: true } },
      { type: 'table', name: 'Square 4-seat', icon: Square, defaultWidth: 48, defaultHeight: 48, defaultProperties: { shape: 'square', seats: 4, minSeats: 2, maxSeats: 4, tableNumber: '', status: 'available', section: '', serverAssignment: '', isJoinable: true } },
      { type: 'table', name: 'Rectangle 6-seat', icon: RectangleHorizontal, defaultWidth: 96, defaultHeight: 40, defaultProperties: { shape: 'rectangle', seats: 6, minSeats: 4, maxSeats: 8, tableNumber: '', status: 'available', section: '', serverAssignment: '', isJoinable: true } },
      { type: 'table', name: 'Rectangle 8-seat', icon: RectangleHorizontal, defaultWidth: 120, defaultHeight: 40, defaultProperties: { shape: 'rectangle', seats: 8, minSeats: 6, maxSeats: 10, tableNumber: '', status: 'available', section: '', serverAssignment: '', isJoinable: true } },
    ],
  },
  {
    name: 'Seating',
    items: [
      { type: 'chair', name: 'Chair', icon: Armchair, defaultWidth: 20, defaultHeight: 20, defaultProperties: {} },
      { type: 'chair', name: 'Booth', icon: Armchair, defaultWidth: 80, defaultHeight: 36, defaultProperties: { boothType: 'standard' } },
      { type: 'chair', name: 'Barstool', icon: Armchair, defaultWidth: 18, defaultHeight: 18, defaultProperties: { barstool: true } },
    ],
  },
  {
    name: 'Walls & Structure',
    items: [
      { type: 'wall', name: 'Wall', icon: Minus, defaultWidth: 120, defaultHeight: 8, defaultProperties: {} },
      { type: 'door', name: 'Door', icon: DoorOpen, defaultWidth: 36, defaultHeight: 8, defaultProperties: { doorType: 'single' } },
      { type: 'window', name: 'Window', icon: Columns2, defaultWidth: 48, defaultHeight: 6, defaultProperties: {} },
      { type: 'divider', name: 'Divider', icon: Minus, defaultWidth: 80, defaultHeight: 4, defaultProperties: {} },
    ],
  },
  {
    name: 'Features',
    items: [
      { type: 'stage', name: 'Stage', icon: Theater, defaultWidth: 160, defaultHeight: 80, defaultProperties: { stageName: '', stageType: 'performance', hasCurtain: false } },
      { type: 'bar', name: 'Bar', icon: Wine, defaultWidth: 160, defaultHeight: 40, defaultProperties: { barName: '', seatCount: 8, hasServiceWell: true } },
      { type: 'buffet', name: 'Buffet', icon: UtensilsCrossed, defaultWidth: 120, defaultHeight: 36, defaultProperties: { stationName: '', stationType: 'hot' } },
      { type: 'dance_floor', name: 'Dance Floor', icon: Music2, defaultWidth: 120, defaultHeight: 120, defaultProperties: {} },
      { type: 'decoration', name: 'Podium', icon: Mic2, defaultWidth: 30, defaultHeight: 30, defaultProperties: { decorationType: 'podium' } },
      { type: 'decoration', name: 'Host Stand', icon: MapPin, defaultWidth: 30, defaultHeight: 30, defaultProperties: { decorationType: 'host_stand' } },
    ],
  },
  {
    name: 'Service',
    items: [
      { type: 'service_zone', name: 'Service Zone', icon: MapPin, defaultWidth: 120, defaultHeight: 80, defaultProperties: { zoneName: '', zoneType: 'server', assignedTo: '', color: '#3b82f6' } },
      { type: 'station', name: 'POS Terminal', icon: Monitor, defaultWidth: 24, defaultHeight: 24, defaultProperties: { stationName: 'POS', stationType: 'pos_terminal', terminalId: '' } },
      { type: 'station', name: 'Wait Station', icon: Coffee, defaultWidth: 24, defaultHeight: 24, defaultProperties: { stationName: '', stationType: 'wait_station', terminalId: '' } },
      { type: 'station', name: 'Bus Station', icon: Trash2, defaultWidth: 24, defaultHeight: 24, defaultProperties: { stationName: '', stationType: 'bus_station', terminalId: '' } },
      { type: 'station', name: 'Host Stand', icon: UserCheck, defaultWidth: 24, defaultHeight: 24, defaultProperties: { stationName: 'Host', stationType: 'host_stand', terminalId: '' } },
      { type: 'station', name: 'Bar Station', icon: GlassWater, defaultWidth: 24, defaultHeight: 24, defaultProperties: { stationName: '', stationType: 'bar_station', terminalId: '' } },
    ],
  },
  {
    name: 'Labels',
    items: [
      { type: 'text_label', name: 'Text Label', icon: Type, defaultWidth: 100, defaultHeight: 30, defaultProperties: { text: 'Label', fontSize: 16, fontFamily: 'sans-serif', fontWeight: 'normal', textAlign: 'center' } },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────

export function PalettePanel() {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(paletteGroups.map((g) => g.name)),
  );
  const { addObject, commitToHistory, layers } = useEditorStore();

  const toggleGroup = useCallback((name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleAddItem = useCallback(
    (item: PaletteItem) => {
      const defaultLayerId = layers[0]?.id ?? 'default';
      const obj: Omit<CanvasObject, 'id'> = {
        type: item.type,
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
        width: item.defaultWidth,
        height: item.defaultHeight,
        rotation: 0,
        layerId: defaultLayerId,
        zIndex: 0,
        locked: false,
        visible: true,
        name: item.name,
        properties: { ...item.defaultProperties },
        style: { ...DEFAULT_STYLE },
      };
      commitToHistory();
      addObject(obj);
    },
    [addObject, commitToHistory, layers],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: PaletteItem) => {
      const data = JSON.stringify({
        type: item.type,
        name: item.name,
        width: item.defaultWidth,
        height: item.defaultHeight,
        properties: item.defaultProperties,
        style: DEFAULT_STYLE,
      });
      e.dataTransfer.setData('application/room-layout-object', data);
      e.dataTransfer.effectAllowed = 'copy';
    },
    [],
  );

  return (
    <div className="flex h-full w-60 flex-col border-r border-gray-200 bg-surface">
      <div className="border-b border-gray-200 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Objects</h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {paletteGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.name);
          return (
            <div key={group.name}>
              <button
                onClick={() => toggleGroup(group.name)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {group.name}
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              {isExpanded && (
                <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                  {group.items.map((item, idx) => (
                    <button
                      key={`${item.type}-${idx}`}
                      onClick={() => handleAddItem(item)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, item)}
                      className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-2 text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="text-[10px] leading-tight text-center">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
