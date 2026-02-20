'use client';

import React from 'react';
import { Group, Circle, Text, Rect } from 'react-konva';
import type { CanvasObject } from '@oppsera/shared';
import { useEditorStore } from '@/stores/room-layout-editor';
import { snapToGrid } from '../snap';

interface StationNodeProps {
  obj: CanvasObject;
  isSelected: boolean;
}

const STATION_COLORS: Record<string, string> = {
  pos_terminal: '#6366f1',
  wait_station: '#10b981',
  bus_station: '#f59e0b',
  host_stand: '#8b5cf6',
  bar_station: '#ec4899',
};

const STATION_ICONS: Record<string, string> = {
  pos_terminal: 'POS',
  wait_station: 'W',
  bus_station: 'B',
  host_stand: 'H',
  bar_station: 'BAR',
};

export const StationNode = React.memo(function StationNode({ obj, isSelected }: StationNodeProps) {
  const updateObject = useEditorStore((s) => s.updateObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const setSelection = useEditorStore((s) => s.setSelection);

  const px = obj.x * scalePxPerFt;
  const py = obj.y * scalePxPerFt;

  const props = obj.properties as { stationName?: string; stationType?: string };
  const stationType = props.stationType ?? 'pos_terminal';
  const color = STATION_COLORS[stationType] ?? '#6366f1';
  const icon = STATION_ICONS[stationType] ?? '?';
  const radius = Math.min(obj.width, obj.height) / 2;

  const handleDragEnd = (e: { target: { x: () => number; y: () => number } }) => {
    let newX = e.target.x() / scalePxPerFt;
    let newY = e.target.y() / scalePxPerFt;
    if (snapEnabled) {
      newX = snapToGrid(newX, gridSizeFt);
      newY = snapToGrid(newY, gridSizeFt);
    }
    updateObject(obj.id, { x: newX, y: newY });
    commitToHistory();
  };

  return (
    <Group
      id={obj.id}
      x={px}
      y={py}
      rotation={obj.rotation}
      draggable={!obj.locked}
      onDragEnd={handleDragEnd}
      onClick={() => setSelection([obj.id])}
      onTap={() => setSelection([obj.id])}
    >
      {/* Background circle */}
      <Circle
        x={radius}
        y={radius}
        radius={radius}
        fill={color}
        opacity={0.9}
        stroke={isSelected ? '#4f46e5' : color}
        strokeWidth={isSelected ? 2 : 1}
      />
      {/* Icon text */}
      <Text
        text={icon}
        x={0}
        y={radius - 5}
        width={obj.width}
        align="center"
        fontSize={9}
        fill="#ffffff"
        fontStyle="bold"
        listening={false}
      />
      {/* Label below */}
      {props.stationName && (
        <Rect
          x={-10}
          y={obj.height + 2}
          width={obj.width + 20}
          height={14}
          fill="transparent"
          listening={false}
        />
      )}
      {props.stationName && (
        <Text
          text={props.stationName}
          x={-10}
          y={obj.height + 2}
          width={obj.width + 20}
          align="center"
          fontSize={9}
          fill={color}
          listening={false}
        />
      )}
    </Group>
  );
});
