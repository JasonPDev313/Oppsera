'use client';

import { Layer } from 'react-konva';
import { useEditorStore } from '@/stores/room-layout-editor';
import { TableNode } from './objects/table-node';
import { WallNode } from './objects/wall-node';
import { DoorNode } from './objects/door-node';
import { TextNode } from './objects/text-node';
import { ServiceZoneNode } from './objects/service-zone-node';
import { StationNode } from './objects/station-node';
import { GenericNode } from './objects/generic-node';
import type { CanvasObject } from '@oppsera/shared';

function ObjectNode({ obj, isSelected }: { obj: CanvasObject; isSelected: boolean }) {
  switch (obj.type) {
    case 'table':
      return <TableNode obj={obj} isSelected={isSelected} />;
    case 'wall':
    case 'divider':
      return <WallNode obj={obj} isSelected={isSelected} />;
    case 'door':
    case 'window':
      return <DoorNode obj={obj} isSelected={isSelected} />;
    case 'text_label':
      return <TextNode obj={obj} isSelected={isSelected} />;
    case 'service_zone':
      return <ServiceZoneNode obj={obj} isSelected={isSelected} />;
    case 'station':
      return <StationNode obj={obj} isSelected={isSelected} />;
    default:
      return <GenericNode obj={obj} isSelected={isSelected} />;
  }
}

export function ObjectLayer() {
  const objects = useEditorStore((s) => s.objects);
  const layers = useEditorStore((s) => s.layers);
  const selectedIds = useEditorStore((s) => s.selectedIds);

  // Build set of visible layer IDs
  const visibleLayerIds = new Set(layers.filter((l) => l.visible).map((l) => l.id));
  const selectedSet = new Set(selectedIds);

  // Filter to visible objects, sorted by zIndex
  const visibleObjects = objects
    .filter((o) => o.visible && visibleLayerIds.has(o.layerId))
    .sort((a, b) => a.zIndex - b.zIndex);

  return (
    <Layer>
      {visibleObjects.map((obj) => (
        <ObjectNode key={obj.id} obj={obj} isSelected={selectedSet.has(obj.id)} />
      ))}
    </Layer>
  );
}
