'use client';

import { useMemo } from 'react';

/**
 * Renders non-table objects from the room layout snapshot as a passive
 * background layer in the F&B floor plan. These are decorative / structural
 * elements (bar, dance floor, buffet, stage, walls, etc.) that give spatial
 * context but are not interactive.
 */

interface SnapshotObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  zIndex: number;
  name: string;
  properties: Record<string, unknown>;
  style?: { fill?: string; stroke?: string; opacity?: number; cornerRadius?: number };
}

/** Object types to render as background. Tables are excluded — they're rendered
 *  as interactive FnbTableNode components in the layer above. */
const BACKGROUND_TYPES = new Set([
  'bar', 'dance_floor', 'buffet', 'stage', 'wall', 'door', 'window',
  'divider', 'decoration', 'service_zone', 'station', 'chair', 'text_label',
]);

const TYPE_COLORS: Record<string, { fill: string; stroke: string; label: string }> = {
  bar:          { fill: '#c084fc', stroke: '#9333ea', label: 'Bar' },
  dance_floor:  { fill: '#f9a8d4', stroke: '#ec4899', label: 'Dance Floor' },
  buffet:       { fill: '#fbbf24', stroke: '#d97706', label: 'Buffet' },
  stage:        { fill: '#fcd34d', stroke: '#f59e0b', label: 'Stage' },
  wall:         { fill: '#475569', stroke: '#334155', label: '' },
  door:         { fill: '#a78bfa', stroke: '#7c3aed', label: '' },
  window:       { fill: '#93c5fd', stroke: '#3b82f6', label: '' },
  divider:      { fill: '#9ca3af', stroke: '#6b7280', label: '' },
  decoration:   { fill: '#d1d5db', stroke: '#9ca3af', label: '' },
  service_zone: { fill: '#3b82f620', stroke: '#3b82f6', label: '' },
  station:      { fill: '#6366f1', stroke: '#4f46e5', label: '' },
  chair:        { fill: '#f1f5f9', stroke: '#94a3b8', label: '' },
  text_label:   { fill: 'transparent', stroke: 'transparent', label: '' },
};

interface FloorBackgroundObjectsProps {
  snapshotJson: Record<string, unknown>;
  scalePxPerFt: number;
  viewScale: number;
}

export function FloorBackgroundObjects({ snapshotJson, scalePxPerFt, viewScale }: FloorBackgroundObjectsProps) {
  const objects = useMemo(() => {
    const raw = (snapshotJson as { objects?: SnapshotObject[] }).objects;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((o) => o.visible && BACKGROUND_TYPES.has(o.type))
      .sort((a, b) => a.zIndex - b.zIndex);
  }, [snapshotJson]);

  if (objects.length === 0) return null;

  return (
    <>
      {objects.map((obj) => (
        <BackgroundObject key={obj.id} obj={obj} scalePxPerFt={scalePxPerFt} viewScale={viewScale} />
      ))}
    </>
  );
}

function BackgroundObject({ obj, scalePxPerFt, viewScale }: { obj: SnapshotObject; scalePxPerFt: number; viewScale: number }) {
  const colors = TYPE_COLORS[obj.type] ?? TYPE_COLORS.decoration!;
  const fill = obj.style?.fill ?? colors.fill;
  const stroke = obj.style?.stroke ?? colors.stroke;
  const displayName = obj.name || colors.label;

  // Service zones: dashed border, very light fill
  if (obj.type === 'service_zone') {
    const props = obj.properties as { zoneName?: string; color?: string };
    const zoneColor = props.color ?? '#3b82f6';
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: obj.x * scalePxPerFt * viewScale,
          top: obj.y * scalePxPerFt * viewScale,
          width: obj.width * viewScale,
          height: obj.height * viewScale,
          transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
          backgroundColor: `${zoneColor}15`,
          border: `${Math.max(1, viewScale)}px dashed ${zoneColor}60`,
          borderRadius: 4 * viewScale,
        }}
      >
        {props.zoneName && (
          <span
            className="absolute pointer-events-none font-medium"
            style={{ top: 2 * viewScale, left: 4 * viewScale, fontSize: 9 * viewScale, color: zoneColor, opacity: 0.7 }}
          >
            {props.zoneName}
          </span>
        )}
      </div>
    );
  }

  // Station: small circle marker
  if (obj.type === 'station') {
    const props = obj.properties as { stationName?: string; stationType?: string };
    const stationColors: Record<string, string> = {
      pos_terminal: '#6366f1', wait_station: '#10b981', bus_station: '#f59e0b', host_stand: '#8b5cf6', bar_station: '#ec4899',
    };
    const color = stationColors[props.stationType ?? 'pos_terminal'] ?? '#6366f1';
    const size = Math.min(obj.width, obj.height) * viewScale;
    return (
      <div
        className="absolute pointer-events-none flex items-center justify-center"
        style={{
          left: obj.x * scalePxPerFt * viewScale,
          top: obj.y * scalePxPerFt * viewScale,
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: color,
          opacity: 0.7,
        }}
      >
        {props.stationName && size > 20 && (
          <span className="text-white font-bold truncate px-0.5" style={{ fontSize: Math.max(7, 8 * viewScale) }}>
            {props.stationName.charAt(0)}
          </span>
        )}
      </div>
    );
  }

  // Text labels
  if (obj.type === 'text_label') {
    const props = obj.properties as { text?: string; fontSize?: number };
    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: obj.x * scalePxPerFt * viewScale,
          top: obj.y * scalePxPerFt * viewScale,
          width: obj.width * viewScale,
          transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
          fontSize: (props.fontSize ?? 14) * viewScale,
          color: '#374151',
          opacity: 0.6,
        }}
      >
        {props.text}
      </div>
    );
  }

  // All other objects: bar, dance_floor, buffet, stage, wall, door, etc.
  const isLargeEnoughForLabel = obj.width * viewScale > 40 && obj.height * viewScale > 24;

  return (
    <div
      className="absolute pointer-events-none flex items-center justify-center overflow-hidden"
      style={{
        left: obj.x * scalePxPerFt * viewScale,
        top: obj.y * scalePxPerFt * viewScale,
        width: obj.width * viewScale,
        height: obj.height * viewScale,
        transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
        backgroundColor: fill,
        border: `${Math.max(1, viewScale)}px solid ${stroke}`,
        borderRadius: (obj.style?.cornerRadius ?? 0) * viewScale || (obj.type === 'bar' ? 6 * viewScale : 0),
        opacity: obj.style?.opacity ?? 0.65,
      }}
    >
      {displayName && isLargeEnoughForLabel && (
        <span
          className="font-semibold text-center leading-tight truncate px-1"
          style={{
            fontSize: Math.max(8, Math.min(12, obj.height * viewScale * 0.25)) ,
            color: stroke,
          }}
        >
          {displayName}
        </span>
      )}
    </div>
  );
}
