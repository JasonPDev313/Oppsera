'use client';

import React from 'react';
import { Group, Rect, Circle, Text } from 'react-konva';
import type { CanvasObject } from '@oppsera/shared';
import { useEditorStore } from '@/stores/room-layout-editor';
import { snapToGrid } from '../snap';

interface TableNodeProps {
  obj: CanvasObject;
  isSelected: boolean;
}

export const TableNode = React.memo(function TableNode({ obj, isSelected }: TableNodeProps) {
  const updateObject = useEditorStore((s) => s.updateObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const setSelection = useEditorStore((s) => s.setSelection);

  const px = obj.x * scalePxPerFt;
  const py = obj.y * scalePxPerFt;
  const pw = obj.width;
  const ph = obj.height;

  const props = obj.properties as { shape?: string; seats?: number; tableNumber?: string };
  const shape = props.shape ?? 'square';
  const seats = props.seats ?? 4;
  const tableNumber = props.tableNumber ?? '';

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

  const handleClick = () => {
    setSelection([obj.id]);
  };

  // Seat indicators around perimeter
  const seatElements: React.ReactElement[] = [];
  const seatRadius = 5;
  for (let i = 0; i < seats; i++) {
    if (shape === 'round') {
      const angle = (i / seats) * 2 * Math.PI - Math.PI / 2;
      const r = pw / 2 + 8;
      seatElements.push(
        <Circle
          key={`seat-${i}`}
          x={pw / 2 + Math.cos(angle) * r}
          y={ph / 2 + Math.sin(angle) * r}
          radius={seatRadius}
          fill="#94a3b8"
          listening={false}
        />,
      );
    } else {
      // Distribute seats around rectangle perimeter
      const perimeter = 2 * (pw + ph);
      const pos = (i / seats) * perimeter;
      let sx: number, sy: number;
      if (pos < pw) {
        sx = pos; sy = -10;
      } else if (pos < pw + ph) {
        sx = pw + 10; sy = pos - pw;
      } else if (pos < 2 * pw + ph) {
        sx = 2 * pw + ph - pos; sy = ph + 10;
      } else {
        sx = -10; sy = perimeter - pos;
      }
      seatElements.push(
        <Circle key={`seat-${i}`} x={sx} y={sy} radius={seatRadius} fill="#94a3b8" listening={false} />,
      );
    }
  }

  return (
    <Group
      id={obj.id}
      x={px}
      y={py}
      rotation={obj.rotation}
      draggable={!obj.locked}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onTap={handleClick}
    >
      {shape === 'round' ? (
        <Circle
          x={pw / 2}
          y={ph / 2}
          radius={pw / 2}
          fill={obj.style.fill}
          stroke={isSelected ? '#4f46e5' : obj.style.stroke}
          strokeWidth={isSelected ? 2 : obj.style.strokeWidth}
          opacity={obj.style.opacity}
        />
      ) : (
        <Rect
          width={pw}
          height={ph}
          fill={obj.style.fill}
          stroke={isSelected ? '#4f46e5' : obj.style.stroke}
          strokeWidth={isSelected ? 2 : obj.style.strokeWidth}
          opacity={obj.style.opacity}
          cornerRadius={obj.style.cornerRadius ?? 2}
        />
      )}
      {seatElements}
      <Text
        text={tableNumber || `T`}
        x={shape === 'round' ? pw / 2 - 8 : pw / 2 - 8}
        y={ph / 2 - 6}
        fontSize={12}
        fill="#374151"
        listening={false}
      />
    </Group>
  );
});
