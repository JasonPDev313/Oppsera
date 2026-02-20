'use client';

import { useCallback, useEffect, useRef } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '@/stores/room-layout-editor';

export function useCanvasControls(stageRef: React.RefObject<Konva.Stage | null>) {
  const setZoom = useEditorStore((s) => s.setZoom);
  const zoom = useEditorStore((s) => s.zoom);
  const isPanning = useRef(false);

  // Ctrl+wheel zoom centered on pointer
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      if (!e.evt.ctrlKey && !e.evt.metaKey) return;

      const oldZoom = stage.scaleX();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY < 0 ? 1 : -1;
      const factor = 1.1;
      const newZoom = direction > 0 ? oldZoom * factor : oldZoom / factor;
      const clampedZoom = Math.min(5, Math.max(0.1, newZoom));

      const mousePointTo = {
        x: (pointer.x - stage.x()) / oldZoom,
        y: (pointer.y - stage.y()) / oldZoom,
      };

      stage.scale({ x: clampedZoom, y: clampedZoom });
      stage.position({
        x: pointer.x - mousePointTo.x * clampedZoom,
        y: pointer.y - mousePointTo.y * clampedZoom,
      });
      stage.batchDraw();
      setZoom(clampedZoom);
    },
    [stageRef, setZoom],
  );

  // Spacebar pan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isPanning.current) {
        isPanning.current = true;
        const stage = stageRef.current;
        if (stage) {
          stage.container().style.cursor = 'grab';
          stage.draggable(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isPanning.current = false;
        const stage = stageRef.current;
        if (stage) {
          stage.container().style.cursor = 'default';
          stage.draggable(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [stageRef]);

  return { handleWheel, zoom };
}
