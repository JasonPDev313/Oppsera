'use client';

import { useRef, useEffect } from 'react';
import { Transformer } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore } from '@/stores/room-layout-editor';
import { snapToGrid } from './snap';

interface TransformHandlerProps {
  stageRef: React.RefObject<Konva.Stage | null>;
}

const ROTATION_SNAPS = Array.from({ length: 24 }, (_, i) => i * 15);
const MIN_SIZE_FT = 0.5;

export function TransformHandler({ stageRef }: TransformHandlerProps) {
  const trRef = useRef<Konva.Transformer | null>(null);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const objects = useEditorStore((s) => s.objects);
  const updateObjects = useEditorStore((s) => s.updateObjects);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);

  // Attach transformer to selected nodes
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;

    if (selectedIds.length === 0) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }

    const nodes: Konva.Node[] = [];
    for (const id of selectedIds) {
      const node = stage.findOne(`#${id}`);
      if (node) nodes.push(node);
    }
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, stageRef, objects]);

  const handleTransformEnd = () => {
    const stage = stageRef.current;
    if (!stage) return;

    const updates: Array<{ id: string; changes: Partial<typeof objects[0]> }> = [];

    for (const id of selectedIds) {
      const node = stage.findOne(`#${id}`);
      if (!node) continue;

      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      // Bake scale into dimensions, reset scale to 1
      node.scaleX(1);
      node.scaleY(1);

      let newWidth = Math.max(MIN_SIZE_FT * scalePxPerFt, node.width() * scaleX);
      let newHeight = Math.max(MIN_SIZE_FT * scalePxPerFt, node.height() * scaleY);

      let newX = node.x() / scalePxPerFt;
      let newY = node.y() / scalePxPerFt;

      if (snapEnabled) {
        newX = snapToGrid(newX, gridSizeFt);
        newY = snapToGrid(newY, gridSizeFt);
      }

      // Convert width/height back to the object's coordinate space
      // Object nodes store width/height in pixels (set in palette), so keep px
      updates.push({
        id,
        changes: {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
          rotation: node.rotation(),
        },
      });
    }

    if (updates.length > 0) {
      updateObjects(updates);
      commitToHistory();
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <Transformer
      ref={trRef}
      rotateEnabled={true}
      rotationSnaps={ROTATION_SNAPS}
      boundBoxFunc={(oldBox, newBox) => {
        // Enforce minimum size
        const minPx = MIN_SIZE_FT * scalePxPerFt;
        if (Math.abs(newBox.width) < minPx || Math.abs(newBox.height) < minPx) {
          return oldBox;
        }
        return newBox;
      }}
      onTransformEnd={handleTransformEnd}
      borderStroke="#4f46e5"
      anchorStroke="#4f46e5"
      anchorFill="#fff"
      anchorSize={8}
      anchorCornerRadius={2}
      enabledAnchors={
        selectedIds.length > 1
          ? [] // disable resize for multi-select
          : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
      }
    />
  );
}
