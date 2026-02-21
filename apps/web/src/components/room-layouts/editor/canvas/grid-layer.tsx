'use client';

import { useMemo } from 'react';
import { Layer, Line, Rect } from 'react-konva';
import { useEditorStore } from '@/stores/room-layout-editor';

export function GridLayer() {
  const widthFt = useEditorStore((s) => s.widthFt);
  const heightFt = useEditorStore((s) => s.heightFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const showGrid = useEditorStore((s) => s.showGrid);

  const canvasW = widthFt * scalePxPerFt;
  const canvasH = heightFt * scalePxPerFt;
  const gridPx = gridSizeFt * scalePxPerFt;

  const gridLines = useMemo(() => {
    if (!showGrid || gridPx <= 0) return [];
    const lines: Array<{ points: number[]; stroke: string; strokeWidth: number }> = [];

    // Vertical lines
    for (let x = gridPx; x < canvasW; x += gridPx) {
      const isMajor = Math.abs(x % (gridPx * 5)) < 0.01;
      lines.push({
        points: [x, 0, x, canvasH],
        stroke: isMajor ? '#cbd5e1' : '#e2e8f0',
        strokeWidth: isMajor ? 1 : 0.5,
      });
    }

    // Horizontal lines
    for (let y = gridPx; y < canvasH; y += gridPx) {
      const isMajor = Math.abs(y % (gridPx * 5)) < 0.01;
      lines.push({
        points: [0, y, canvasW, y],
        stroke: isMajor ? '#cbd5e1' : '#e2e8f0',
        strokeWidth: isMajor ? 1 : 0.5,
      });
    }

    return lines;
  }, [showGrid, gridPx, canvasW, canvasH]);

  return (
    <Layer listening={false}>
      {/* Room background */}
      <Rect x={0} y={0} width={canvasW} height={canvasH} fill="white" />

      {/* Grid lines */}
      {gridLines.map((line, i) => (
        <Line
          key={i}
          points={line.points}
          stroke={line.stroke}
          strokeWidth={line.strokeWidth}
          listening={false}
        />
      ))}

      {/* Room boundary */}
      <Rect
        x={0}
        y={0}
        width={canvasW}
        height={canvasH}
        stroke="#94a3b8"
        strokeWidth={2}
        listening={false}
      />
    </Layer>
  );
}
