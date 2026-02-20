'use client';

import React from 'react';
import { Group, Arc, Line } from 'react-konva';
import type { CanvasObject } from '@oppsera/shared';
import { useEditorStore } from '@/stores/room-layout-editor';
import { snapToGrid } from '../snap';

interface DoorNodeProps {
  obj: CanvasObject;
  isSelected: boolean;
}

export const DoorNode = React.memo(function DoorNode({ obj, isSelected }: DoorNodeProps) {
  const updateObject = useEditorStore((s) => s.updateObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const setSelection = useEditorStore((s) => s.setSelection);

  const px = obj.x * scalePxPerFt;
  const py = obj.y * scalePxPerFt;
  const doorWidth = obj.width;

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
      {/* Door frame line */}
      <Line
        points={[0, 0, doorWidth, 0]}
        stroke="#94a3b8"
        strokeWidth={4}
        listening={false}
      />
      {/* Swing arc */}
      <Arc
        x={0}
        y={0}
        innerRadius={0}
        outerRadius={doorWidth}
        angle={90}
        stroke={isSelected ? '#4f46e5' : '#94a3b8'}
        strokeWidth={isSelected ? 2 : 1}
        dash={[4, 4]}
        listening={false}
      />
    </Group>
  );
});
