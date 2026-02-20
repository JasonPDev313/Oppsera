'use client';

import React from 'react';
import { Group, Text, Rect } from 'react-konva';
import type { CanvasObject } from '@oppsera/shared';
import { useEditorStore } from '@/stores/room-layout-editor';
import { snapToGrid } from '../snap';

interface TextNodeProps {
  obj: CanvasObject;
  isSelected: boolean;
}

export const TextNode = React.memo(function TextNode({ obj, isSelected }: TextNodeProps) {
  const updateObject = useEditorStore((s) => s.updateObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const setSelection = useEditorStore((s) => s.setSelection);

  const px = obj.x * scalePxPerFt;
  const py = obj.y * scalePxPerFt;

  const props = obj.properties as {
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    textAlign?: string;
  };

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
      {isSelected && (
        <Rect
          width={obj.width}
          height={obj.height}
          stroke="#4f46e5"
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      )}
      <Text
        text={props.text ?? 'Label'}
        width={obj.width}
        height={obj.height}
        fontSize={props.fontSize ?? 16}
        fontFamily={props.fontFamily ?? 'sans-serif'}
        fontStyle={props.fontWeight === 'bold' ? 'bold' : 'normal'}
        align={props.textAlign ?? 'center'}
        verticalAlign="middle"
        fill="#374151"
      />
    </Group>
  );
});
