'use client';

import React from 'react';
import { Group, Rect, Text } from 'react-konva';
import type { CanvasObject } from '@oppsera/shared';
import { useEditorStore } from '@/stores/room-layout-editor';
import { snapToGrid } from '../snap';

interface ServiceZoneNodeProps {
  obj: CanvasObject;
  isSelected: boolean;
}

export const ServiceZoneNode = React.memo(function ServiceZoneNode({ obj, isSelected }: ServiceZoneNodeProps) {
  const updateObject = useEditorStore((s) => s.updateObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const setSelection = useEditorStore((s) => s.setSelection);

  const px = obj.x * scalePxPerFt;
  const py = obj.y * scalePxPerFt;

  const props = obj.properties as { zoneName?: string; color?: string };
  const zoneColor = props.color ?? '#3b82f6';

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
      <Rect
        width={obj.width}
        height={obj.height}
        fill={zoneColor}
        opacity={0.15}
        stroke={isSelected ? '#4f46e5' : zoneColor}
        strokeWidth={isSelected ? 2 : 1}
        dash={[6, 3]}
      />
      {props.zoneName && (
        <Text
          text={props.zoneName}
          x={4}
          y={4}
          fontSize={11}
          fill={zoneColor}
          listening={false}
        />
      )}
    </Group>
  );
});
