'use client';

import { useMemo } from 'react';
import { Line } from 'react-konva';
import { useEditorStore } from '@/stores/room-layout-editor';

interface SnapGuide {
  orientation: 'horizontal' | 'vertical';
  position: number; // in px
}

const SNAP_THRESHOLD_FT = 0.25;
const GUIDE_COLOR = '#e11d9c'; // magenta

export function useSnapGuides(): {
  guides: SnapGuide[];
  snapDelta: (objId: string, x: number, y: number, w: number, h: number) => { dx: number; dy: number };
} {
  const objects = useEditorStore((s) => s.objects);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const widthFt = useEditorStore((s) => s.widthFt);
  const heightFt = useEditorStore((s) => s.heightFt);

  // Pre-compute guide points for non-selected objects
  const guidePoints = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const hPoints: number[] = []; // y values in ft
    const vPoints: number[] = []; // x values in ft

    // Room boundaries
    hPoints.push(0, heightFt);
    vPoints.push(0, widthFt);

    for (const obj of objects) {
      if (selectedSet.has(obj.id) || !obj.visible) continue;
      const wFt = obj.width / scalePxPerFt;
      const hFt = obj.height / scalePxPerFt;

      // Edges
      vPoints.push(obj.x, obj.x + wFt);
      hPoints.push(obj.y, obj.y + hFt);
      // Centers
      vPoints.push(obj.x + wFt / 2);
      hPoints.push(obj.y + hFt / 2);
    }

    return { hPoints, vPoints };
  }, [objects, selectedIds, scalePxPerFt, widthFt, heightFt]);

  const snapDelta = (objId: string, x: number, y: number, w: number, h: number) => {
    if (!snapEnabled) return { dx: 0, dy: 0 };

    const wFt = w / scalePxPerFt;
    const hFt = h / scalePxPerFt;

    // Object edges and center
    const objVPoints = [x, x + wFt / 2, x + wFt]; // left, center, right
    const objHPoints = [y, y + hFt / 2, y + hFt]; // top, center, bottom

    let dx = 0;
    let dy = 0;
    let bestDx = SNAP_THRESHOLD_FT;
    let bestDy = SNAP_THRESHOLD_FT;

    for (const vp of guidePoints.vPoints) {
      for (const op of objVPoints) {
        const diff = Math.abs(vp - op);
        if (diff < bestDx) {
          bestDx = diff;
          dx = vp - op;
        }
      }
    }

    for (const hp of guidePoints.hPoints) {
      for (const op of objHPoints) {
        const diff = Math.abs(hp - op);
        if (diff < bestDy) {
          bestDy = diff;
          dy = hp - op;
        }
      }
    }

    return { dx, dy };
  };

  return { guides: [], snapDelta };
}

interface SnapGuideLinesProps {
  guides: SnapGuide[];
  canvasWidth: number;
  canvasHeight: number;
}

export function SnapGuideLines({ guides, canvasWidth, canvasHeight }: SnapGuideLinesProps) {
  return (
    <>
      {guides.map((g, i) =>
        g.orientation === 'vertical' ? (
          <Line
            key={`guide-${i}`}
            points={[g.position, 0, g.position, canvasHeight]}
            stroke={GUIDE_COLOR}
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        ) : (
          <Line
            key={`guide-${i}`}
            points={[0, g.position, canvasWidth, g.position]}
            stroke={GUIDE_COLOR}
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        ),
      )}
    </>
  );
}
