'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer } from 'react-konva';
import type Konva from 'konva';
import { useEditorStore, setEditorStageRef } from '@/stores/room-layout-editor';
import { GridLayer } from './canvas/grid-layer';
import { ObjectLayer } from './canvas/object-renderer';
import { TransformHandler } from './canvas/transform-handler';
import { SelectionBox, useMarqueeSelection } from './canvas/selection-box';
import { ContextMenu } from './canvas/context-menu';
import { useCanvasControls } from './canvas/use-canvas-controls';
import { snapToGrid } from './canvas/snap';
import type { CanvasObject } from '@oppsera/shared';
import { generateUlid } from '@oppsera/shared';

export function CanvasArea() {
  const stageRef = useRef<Konva.Stage | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipboardRef = useRef<CanvasObject[]>([]);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const widthFt = useEditorStore((s) => s.widthFt);
  const heightFt = useEditorStore((s) => s.heightFt);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const snapEnabled = useEditorStore((s) => s.snapToGrid);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const addObject = useEditorStore((s) => s.addObject);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const setSelection = useEditorStore((s) => s.setSelection);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const objects = useEditorStore((s) => s.objects);
  const layers = useEditorStore((s) => s.layers);
  const addToSelection = useEditorStore((s) => s.addToSelection);
  const removeFromSelection = useEditorStore((s) => s.removeFromSelection);

  const { handleWheel } = useCanvasControls(stageRef);
  const { rectRef, onMouseDown, onMouseMove, onMouseUp } = useMarqueeSelection(stageRef);

  // Register stage ref for export functionality
  useEffect(() => {
    setEditorStageRef(stageRef.current);
    return () => setEditorStageRef(null);
  }, []);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Click on empty stage area → clear selection
  const handleStageClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e: any) => {
      // Close context menu on any click
      if (contextMenu) {
        setContextMenu(null);
        return;
      }

      if (e.target === e.target.getStage()) {
        clearSelection();
        return;
      }

      // Shift+click for multi-select
      const clickedId = e.target.parent?.id?.() || e.target.id?.();
      if (clickedId && e.evt?.shiftKey) {
        e.cancelBubble = true;
        if (selectedIds.includes(clickedId)) {
          removeFromSelection(clickedId);
        } else {
          addToSelection(clickedId);
        }
      }
    },
    [clearSelection, contextMenu, selectedIds, addToSelection, removeFromSelection],
  );

  // Right-click context menu
  const handleContextMenu = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      // If right-clicked on an object that isn't selected, select it
      const clickedId = e.target.parent?.id?.() || e.target.id?.();
      if (clickedId && e.target !== stage && !selectedIds.includes(clickedId)) {
        setSelection([clickedId]);
      }

      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY });
    },
    [selectedIds, setSelection],
  );

  // Copy/Paste/Duplicate
  const handleCopy = useCallback(() => {
    const selected = objects.filter((o) => selectedIds.includes(o.id));
    clipboardRef.current = JSON.parse(JSON.stringify(selected));
  }, [objects, selectedIds]);

  const handlePaste = useCallback(() => {
    const items = clipboardRef.current;
    if (items.length === 0) return;

    commitToHistory();
    const newIds: string[] = [];

    for (const item of items) {
      const newId = generateUlid();
      newIds.push(newId);

      let newX = item.x + 1; // offset by 1ft
      let newY = item.y + 1;

      // Clamp within room bounds
      const objWFt = item.width / scalePxPerFt;
      const objHFt = item.height / scalePxPerFt;
      newX = Math.max(0, Math.min(newX, widthFt - objWFt));
      newY = Math.max(0, Math.min(newY, heightFt - objHFt));

      addObject({
        ...item,
        x: newX,
        y: newY,
      });

      // Fix the ID of the newly added object to our generated one
      const state = useEditorStore.getState();
      const lastObj = state.objects[state.objects.length - 1];
      if (lastObj) {
        useEditorStore.getState().updateObject(lastObj.id, {});
      }
    }

    // Select all pasted objects
    const state = useEditorStore.getState();
    const pastedIds = state.objects.slice(-items.length).map((o) => o.id);
    setSelection(pastedIds);
  }, [addObject, commitToHistory, scalePxPerFt, widthFt, heightFt, setSelection]);

  const handleDuplicate = useCallback(() => {
    const selected = objects.filter((o) => selectedIds.includes(o.id));
    if (selected.length === 0) return;

    clipboardRef.current = JSON.parse(JSON.stringify(selected));
    handlePaste();
  }, [objects, selectedIds, handlePaste]);

  // Drag & drop from palette
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/room-layout-object');
      if (!raw) return;

      const data = JSON.parse(raw) as {
        type: CanvasObject['type'];
        name: string;
        width: number;
        height: number;
        properties: Record<string, unknown>;
        style: CanvasObject['style'];
      };

      const stage = stageRef.current;
      if (!stage) return;

      const container = stage.container().getBoundingClientRect();
      const stageX = stage.x();
      const stageY = stage.y();
      const stageScale = stage.scaleX();

      const pointerX = (e.clientX - container.left - stageX) / stageScale;
      const pointerY = (e.clientY - container.top - stageY) / stageScale;

      let xFt = pointerX / scalePxPerFt;
      let yFt = pointerY / scalePxPerFt;

      if (snapEnabled) {
        xFt = snapToGrid(xFt, gridSizeFt);
        yFt = snapToGrid(yFt, gridSizeFt);
      }

      xFt = Math.max(0, Math.min(xFt, widthFt - data.width / scalePxPerFt));
      yFt = Math.max(0, Math.min(yFt, heightFt - data.height / scalePxPerFt));

      const defaultLayerId = layers[0]?.id ?? 'default';

      commitToHistory();
      addObject({
        type: data.type,
        x: xFt,
        y: yFt,
        width: data.width,
        height: data.height,
        rotation: 0,
        layerId: defaultLayerId,
        zIndex: 0,
        locked: false,
        visible: true,
        name: data.name,
        properties: data.properties,
        style: data.style,
      });

      const newState = useEditorStore.getState();
      const lastObj = newState.objects[newState.objects.length - 1];
      if (lastObj) {
        setSelection([lastObj.id]);
      }
    },
    [scalePxPerFt, gridSizeFt, snapEnabled, widthFt, heightFt, layers, addObject, commitToHistory, setSelection],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden bg-gray-100"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onWheel={handleWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onContextMenu={handleContextMenu}
      >
        <GridLayer />
        <ObjectLayer />
        {/* UI Layer: transformer, selection box */}
        <Layer>
          <TransformHandler stageRef={stageRef} />
          <SelectionBox rectRef={rectRef} />
        </Layer>
      </Stage>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDuplicate={handleDuplicate}
          hasClipboard={clipboardRef.current.length > 0}
        />
      )}
    </div>
  );
}
