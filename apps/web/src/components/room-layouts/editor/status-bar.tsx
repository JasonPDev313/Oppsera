'use client';

import { useEditorStore } from '@/stores/room-layout-editor';

export function StatusBar() {
  const objects = useEditorStore((s) => s.objects);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const zoom = useEditorStore((s) => s.zoom);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const widthFt = useEditorStore((s) => s.widthFt);
  const heightFt = useEditorStore((s) => s.heightFt);
  const unit = useEditorStore((s) => s.unit);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500">
      <div className="flex items-center gap-3">
        <span>{objects.length} objects</span>
        {selectedIds.length > 0 && (
          <span>{selectedIds.length} selected</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span>{Math.round(zoom * 100)}%</span>
        <span>Grid: {gridSizeFt}{unit}</span>
        <span>{widthFt} × {heightFt} {unit}</span>
      </div>
    </div>
  );
}
