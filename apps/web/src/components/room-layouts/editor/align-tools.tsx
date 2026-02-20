'use client';

import {
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Columns3,
  Rows3,
} from 'lucide-react';
import { useEditorStore } from '@/stores/room-layout-editor';
import type { CanvasObject } from '@oppsera/shared';
import {
  alignLeft,
  alignCenterH,
  alignRight,
  alignTop,
  alignMiddle,
  alignBottom,
  distributeH,
  distributeV,
} from './align-utils';

export function AlignTools() {
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const objects = useEditorStore((s) => s.objects);
  const updateObjects = useEditorStore((s) => s.updateObjects);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);

  const selectedObjs = objects.filter((o) => selectedIds.includes(o.id));
  if (selectedObjs.length < 2) return null;

  const apply = (fn: () => Array<{ id: string; changes: Partial<CanvasObject> }>) => {
    const updates = fn();
    if (updates.length > 0) {
      updateObjects(updates);
      commitToHistory();
    }
  };

  const tools = [
    { icon: AlignStartVertical, title: 'Align Left', fn: () => alignLeft(selectedObjs) },
    { icon: AlignCenterVertical, title: 'Align Center', fn: () => alignCenterH(selectedObjs, scalePxPerFt) },
    { icon: AlignEndVertical, title: 'Align Right', fn: () => alignRight(selectedObjs, scalePxPerFt) },
    { icon: AlignStartHorizontal, title: 'Align Top', fn: () => alignTop(selectedObjs) },
    { icon: AlignCenterHorizontal, title: 'Align Middle', fn: () => alignMiddle(selectedObjs, scalePxPerFt) },
    { icon: AlignEndHorizontal, title: 'Align Bottom', fn: () => alignBottom(selectedObjs, scalePxPerFt) },
    { icon: Columns3, title: 'Distribute H', fn: () => distributeH(selectedObjs, scalePxPerFt), minCount: 3 },
    { icon: Rows3, title: 'Distribute V', fn: () => distributeV(selectedObjs, scalePxPerFt), minCount: 3 },
  ];

  return (
    <div className="flex items-center gap-0.5 rounded bg-gray-100 px-1 py-0.5">
      {tools.map((tool) => (
        <button
          key={tool.title}
          onClick={() => apply(tool.fn)}
          disabled={tool.minCount ? selectedObjs.length < tool.minCount : false}
          className="rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30"
          title={tool.title}
        >
          <tool.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
