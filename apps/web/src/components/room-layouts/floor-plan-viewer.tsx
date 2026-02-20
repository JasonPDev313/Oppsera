'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Circle, Text, Group, Line } from 'react-konva';
import type Konva from 'konva';
import type { CanvasObject, CanvasSnapshot } from '@oppsera/shared';

interface FloorPlanViewerProps {
  snapshot: CanvasSnapshot;
  widthFt: number;
  heightFt: number;
  scalePxPerFt?: number;
  showCapacity?: boolean;
  showZones?: boolean;
  interactive?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

const TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  table: { fill: '#e2e8f0', stroke: '#64748b' },
  chair: { fill: '#f1f5f9', stroke: '#94a3b8' },
  wall: { fill: '#475569', stroke: '#334155' },
  door: { fill: '#a78bfa', stroke: '#7c3aed' },
  window: { fill: '#93c5fd', stroke: '#3b82f6' },
  stage: { fill: '#fcd34d', stroke: '#f59e0b' },
  bar: { fill: '#c084fc', stroke: '#9333ea' },
  buffet: { fill: '#fbbf24', stroke: '#d97706' },
  dance_floor: { fill: '#f9a8d4', stroke: '#ec4899' },
  divider: { fill: '#9ca3af', stroke: '#6b7280' },
  decoration: { fill: '#d1d5db', stroke: '#9ca3af' },
  service_zone: { fill: '#3b82f6', stroke: '#3b82f6' },
  station: { fill: '#6366f1', stroke: '#4f46e5' },
  text_label: { fill: 'transparent', stroke: 'transparent' },
  generic: { fill: '#d1d5db', stroke: '#9ca3af' },
};

function ViewerObject({ obj, scale, showCapacity }: { obj: CanvasObject; scale: number; showCapacity?: boolean }) {
  const colors = TYPE_COLORS[obj.type] ?? TYPE_COLORS.generic!;
  const fill = obj.style?.fill ?? colors.fill;
  const stroke = obj.style?.stroke ?? colors.stroke;

  const px = obj.x * scale;
  const py = obj.y * scale;

  if (obj.type === 'service_zone') {
    const props = obj.properties as { zoneName?: string; color?: string };
    const zoneColor = props.color ?? '#3b82f6';
    return (
      <Group x={px} y={py} rotation={obj.rotation}>
        <Rect width={obj.width} height={obj.height} fill={zoneColor} opacity={0.15} stroke={zoneColor} strokeWidth={1} dash={[6, 3]} />
        {props.zoneName && (
          <Text text={props.zoneName} x={4} y={4} fontSize={10} fill={zoneColor} listening={false} />
        )}
      </Group>
    );
  }

  if (obj.type === 'station') {
    const props = obj.properties as { stationName?: string; stationType?: string };
    const stationColors: Record<string, string> = {
      pos_terminal: '#6366f1', wait_station: '#10b981', bus_station: '#f59e0b', host_stand: '#8b5cf6', bar_station: '#ec4899',
    };
    const color = stationColors[props.stationType ?? 'pos_terminal'] ?? '#6366f1';
    const r = Math.min(obj.width, obj.height) / 2;
    return (
      <Group x={px} y={py}>
        <Circle x={r} y={r} radius={r} fill={color} opacity={0.9} />
        {props.stationName && (
          <Text text={props.stationName} x={-10} y={obj.height + 2} width={obj.width + 20} align="center" fontSize={8} fill={color} listening={false} />
        )}
      </Group>
    );
  }

  if (obj.type === 'text_label') {
    const props = obj.properties as { text?: string; fontSize?: number };
    return (
      <Text
        x={px} y={py} text={props.text ?? ''} fontSize={props.fontSize ?? 14}
        width={obj.width} fill={fill === 'transparent' ? '#374151' : fill} listening={false}
      />
    );
  }

  if (obj.type === 'wall' || obj.type === 'divider') {
    return (
      <Group x={px} y={py} rotation={obj.rotation}>
        <Rect width={obj.width} height={obj.height} fill={fill} stroke={stroke} strokeWidth={1} />
      </Group>
    );
  }

  // Table
  if (obj.type === 'table') {
    const props = obj.properties as { shape?: string; seats?: number; tableNumber?: string };
    const isRound = props.shape === 'round' || props.shape === 'circle';

    return (
      <Group x={px} y={py} rotation={obj.rotation}>
        {isRound ? (
          <Circle
            x={obj.width / 2} y={obj.height / 2} radius={Math.min(obj.width, obj.height) / 2}
            fill={fill} stroke={stroke} strokeWidth={1}
          />
        ) : (
          <Rect
            width={obj.width} height={obj.height} fill={fill} stroke={stroke} strokeWidth={1}
            cornerRadius={obj.style?.cornerRadius ?? 0}
          />
        )}
        {props.tableNumber && (
          <Text
            text={props.tableNumber} x={0} y={obj.height / 2 - 6} width={obj.width}
            align="center" fontSize={11} fontStyle="bold" fill="#374151" listening={false}
          />
        )}
        {showCapacity && props.seats && (
          <Text
            text={`${props.seats}`} x={0} y={obj.height / 2 + 4} width={obj.width}
            align="center" fontSize={9} fill="#6b7280" listening={false}
          />
        )}
      </Group>
    );
  }

  // Generic rect for everything else
  return (
    <Group x={px} y={py} rotation={obj.rotation}>
      <Rect width={obj.width} height={obj.height} fill={fill} stroke={stroke} strokeWidth={1} />
    </Group>
  );
}

export function FloorPlanViewer({
  snapshot,
  widthFt,
  heightFt,
  scalePxPerFt = 20,
  showCapacity = true,
  showZones = true,
  interactive = false,
  width: containerWidth,
  height: containerHeight,
  className,
}: FloorPlanViewerProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: containerWidth ?? 600, height: containerHeight ?? 400 });

  const roomPxW = widthFt * scalePxPerFt;
  const roomPxH = heightFt * scalePxPerFt;

  // Auto-fit scale
  const fitScaleX = size.width / roomPxW;
  const fitScaleY = size.height / roomPxH;
  const fitScale = Math.min(fitScaleX, fitScaleY) * 0.95;

  const offsetX = (size.width - roomPxW * fitScale) / 2;
  const offsetY = (size.height - roomPxH * fitScale) / 2;

  // Resize observer for auto-sizing
  useEffect(() => {
    if (containerWidth && containerHeight) return; // Fixed size, no observer needed
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerWidth, containerHeight]);

  const objects = snapshot.objects ?? [];
  const visibleObjects = objects
    .filter((o) => o.visible && (showZones || o.type !== 'service_zone'))
    .sort((a, b) => a.zIndex - b.zIndex);

  // Separate zones to render below
  const zones = visibleObjects.filter((o) => o.type === 'service_zone');
  const nonZones = visibleObjects.filter((o) => o.type !== 'service_zone');

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className ?? ''}`} style={containerWidth ? { width: containerWidth, height: containerHeight } : undefined}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        scaleX={fitScale}
        scaleY={fitScale}
        x={offsetX}
        y={offsetY}
        listening={interactive}
      >
        <Layer>
          {/* Room background */}
          <Rect x={0} y={0} width={roomPxW} height={roomPxH} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} />

          {/* Zones first (below other objects) */}
          {zones.map((obj) => (
            <ViewerObject key={obj.id} obj={obj} scale={scalePxPerFt} showCapacity={showCapacity} />
          ))}

          {/* All other objects */}
          {nonZones.map((obj) => (
            <ViewerObject key={obj.id} obj={obj} scale={scalePxPerFt} showCapacity={showCapacity} />
          ))}
        </Layer>
      </Stage>

      {/* Capacity overlay */}
      {showCapacity && snapshot.metadata?.totalCapacity > 0 && (
        <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
          {snapshot.metadata.totalCapacity} seats
        </div>
      )}
    </div>
  );
}
