'use client';

import React from 'react';
import { Group, Rect, Text } from 'react-konva';
import type { CanvasObject } from '@oppsera/shared';
import { useEditorStore } from '@/stores/room-layout-editor';
import { snapToGrid } from '../snap';

interface GenericNodeProps {
  obj: CanvasObject;
  isSelected: boolean;
}

export const GenericNode = React.memo(function GenericNode({ obj, isSelected }: GenericNodeProps) {
  const updateObject = useEditorStore((s) => s.updateObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const setSelection = useEditorStore((s) => s.setSelection);

  const px = obj.x * scalePxPerFt;
  const py = obj.y * scalePxPerFt;

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

  const label = obj.name || obj.type.replace('_', ' ');

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
      <Rect
        width={obj.width}
        height={obj.height}
        fill={obj.style.fill}
        stroke={isSelected ? '#4f46e5' : obj.style.stroke}
        strokeWidth={isSelected ? 2 : obj.style.strokeWidth}
        opacity={obj.style.opacity}
        cornerRadius={obj.style.cornerRadius ?? 4}
      />
      <Text
        text={label}
        width={obj.width}
        height={obj.height}
        fontSize={11}
        align="center"
        verticalAlign="middle"
        fill="#64748b"
        listening={false}
      />
    </Group>
  );
});
