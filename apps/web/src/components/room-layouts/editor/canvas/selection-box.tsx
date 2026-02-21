'use client';

import { useRef, useCallback } from 'react';
import { Rect } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '@/stores/room-layout-editor';

interface MarqueeState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function useMarqueeSelection(stageRef: React.RefObject<Konva.Stage | null>) {
  const marqueeRef = useRef<MarqueeState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const rectRef = useRef<Konva.Rect | null>(null);

  const objects = useEditorStore((s) => s.objects);
  const layers = useEditorStore((s) => s.layers);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const setSelection = useEditorStore((s) => s.setSelection);
  const activeTool = useEditorStore((s) => s.activeTool);

  const getRelativePointer = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - stage.x()) / stage.scaleX(),
      y: (pointer.y - stage.y()) / stage.scaleY(),
    };
  }, [stageRef]);

  const onMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (activeTool !== 'select') return;
      // Only start marquee when clicking on empty stage
      if (e.target !== e.target.getStage()) return;

      const pos = getRelativePointer();
      if (!pos) return;

      marqueeRef.current = {
        isDrawing: true,
        startX: pos.x,
        startY: pos.y,
        currentX: pos.x,
        currentY: pos.y,
      };

      if (rectRef.current) {
        rectRef.current.visible(true);
        rectRef.current.x(pos.x);
        rectRef.current.y(pos.y);
        rectRef.current.width(0);
        rectRef.current.height(0);
        rectRef.current.getLayer()?.batchDraw();
      }
    },
    [activeTool, getRelativePointer],
  );

  const onMouseMove = useCallback(
    () => {
      if (!marqueeRef.current.isDrawing) return;

      const pos = getRelativePointer();
      if (!pos) return;

      marqueeRef.current.currentX = pos.x;
      marqueeRef.current.currentY = pos.y;

      const { startX, startY } = marqueeRef.current;
      const x = Math.min(startX, pos.x);
      const y = Math.min(startY, pos.y);
      const w = Math.abs(pos.x - startX);
      const h = Math.abs(pos.y - startY);

      if (rectRef.current) {
        rectRef.current.x(x);
        rectRef.current.y(y);
        rectRef.current.width(w);
        rectRef.current.height(h);
        rectRef.current.getLayer()?.batchDraw();
      }
    },
    [getRelativePointer],
  );

  const onMouseUp = useCallback(() => {
    if (!marqueeRef.current.isDrawing) return;
    marqueeRef.current.isDrawing = false;

    const { startX, startY, currentX, currentY } = marqueeRef.current;
    const selX = Math.min(startX, currentX);
    const selY = Math.min(startY, currentY);
    const selW = Math.abs(currentX - startX);
    const selH = Math.abs(currentY - startY);

    if (rectRef.current) {
      rectRef.current.visible(false);
      rectRef.current.getLayer()?.batchDraw();
    }

    // Skip tiny drags (likely just a click)
    if (selW < 5 && selH < 5) return;

    // Find intersecting visible, unlocked objects
    const visibleLayerIds = new Set(layers.filter((l) => l.visible && !l.locked).map((l) => l.id));
    const intersecting: string[] = [];

    for (const obj of objects) {
      if (!obj.visible || obj.locked || !visibleLayerIds.has(obj.layerId)) continue;

      const objX = obj.x * scalePxPerFt;
      const objY = obj.y * scalePxPerFt;
      const objW = obj.width;
      const objH = obj.height;

      // AABB intersection
      if (
        objX < selX + selW &&
        objX + objW > selX &&
        objY < selY + selH &&
        objY + objH > selY
      ) {
        intersecting.push(obj.id);
      }
    }

    if (intersecting.length > 0) {
      setSelection(intersecting);
    }
  }, [objects, layers, scalePxPerFt, setSelection]);

  return { rectRef, onMouseDown, onMouseMove, onMouseUp };
}

export function SelectionBox({ rectRef }: { rectRef: React.RefObject<Konva.Rect | null> }) {
  return (
    <Rect
      ref={rectRef}
      fill="rgba(79, 70, 229, 0.1)"
      stroke="#4f46e5"
      strokeWidth={1}
      dash={[4, 4]}
      visible={false}
      listening={false}
    />
  );
}
