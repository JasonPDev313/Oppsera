'use client';

import React from 'react';

interface SnapshotObject {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  style?: { fill?: string; stroke?: string; opacity?: number };
  properties?: Record<string, unknown>;
}

interface SnapshotData {
  objects?: SnapshotObject[];
  widthFt?: number;
  heightFt?: number;
  scalePxPerFt?: number;
}

interface TemplateThumbnailProps {
  snapshot: SnapshotData;
  width?: number;
  height?: number;
  className?: string;
}

const TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  table: { fill: '#e2e8f0', stroke: '#64748b' },
  chair: { fill: '#f1f5f9', stroke: '#94a3b8' },
  wall: { fill: '#475569', stroke: '#334155' },
  door: { fill: '#a78bfa', stroke: '#7c3aed' },
  text: { fill: 'transparent', stroke: '#6b7280' },
  service_zone: { fill: '#3b82f6', stroke: '#3b82f6' },
  station: { fill: '#f59e0b', stroke: '#d97706' },
  generic: { fill: '#d1d5db', stroke: '#9ca3af' },
};

export const TemplateThumbnail = React.memo(function TemplateThumbnail({
  snapshot,
  width = 200,
  height = 150,
  className,
}: TemplateThumbnailProps) {
  const objects = snapshot.objects ?? [];
  const roomW = snapshot.widthFt ?? 40;
  const roomH = snapshot.heightFt ?? 30;
  const scale = snapshot.scalePxPerFt ?? 20;

  // Room in px
  const roomPxW = roomW * scale;
  const roomPxH = roomH * scale;

  // Scale to fit the thumbnail
  const scaleX = width / roomPxW;
  const scaleY = height / roomPxH;
  const fitScale = Math.min(scaleX, scaleY) * 0.9; // 90% to add margin

  const offsetX = (width - roomPxW * fitScale) / 2;
  const offsetY = (height - roomPxH * fitScale) / 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {/* Room background */}
      <rect
        x={offsetX}
        y={offsetY}
        width={roomPxW * fitScale}
        height={roomPxH * fitScale}
        fill="#f8fafc"
        stroke="#e2e8f0"
        strokeWidth={1}
      />

      {/* Objects */}
      {objects.map((obj, i) => {
        const defaultColors = { fill: '#d1d5db', stroke: '#9ca3af' };
        const colors = TYPE_COLORS[obj.type] ?? defaultColors;
        const objFill = obj.style?.fill ?? colors.fill;
        const objStroke = obj.style?.stroke ?? colors.stroke;
        const opacity = obj.type === 'service_zone' ? 0.15 : (obj.style?.opacity ?? 1);

        const px = obj.x * scale * fitScale + offsetX;
        const py = obj.y * scale * fitScale + offsetY;
        const pw = obj.width * fitScale;
        const ph = obj.height * fitScale;

        const cx = px + pw / 2;
        const cy = py + ph / 2;

        if (obj.type === 'table' && obj.properties?.shape === 'circle') {
          const r = Math.min(pw, ph) / 2;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill={objFill}
              stroke={objStroke}
              strokeWidth={0.5}
              opacity={opacity}
              transform={obj.rotation ? `rotate(${obj.rotation} ${cx} ${cy})` : undefined}
            />
          );
        }

        return (
          <rect
            key={i}
            x={px}
            y={py}
            width={pw}
            height={ph}
            fill={objFill}
            stroke={objStroke}
            strokeWidth={0.5}
            opacity={opacity}
            rx={obj.type === 'door' ? 2 : 0}
            transform={obj.rotation ? `rotate(${obj.rotation} ${cx} ${cy})` : undefined}
          />
        );
      })}

      {/* Empty state */}
      {objects.length === 0 && (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#94a3b8"
          fontSize={11}
        >
          Empty
        </text>
      )}
    </svg>
  );
});
