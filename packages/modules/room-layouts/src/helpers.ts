import { generateUlid, generateSlug } from '@oppsera/shared';
import type { CanvasSnapshot, CanvasObject } from '@oppsera/shared';

export function computeSnapshotStats(snapshot: Record<string, unknown>): {
  objectCount: number;
  totalCapacity: number;
} {
  const objects = (snapshot as unknown as CanvasSnapshot).objects ?? [];
  let totalCapacity = 0;

  for (const obj of objects) {
    if (obj.type === 'table' && obj.properties) {
      const seats = Number(obj.properties.seats) || 0;
      totalCapacity += seats;
    }
  }

  return { objectCount: objects.length, totalCapacity };
}

export function generateRoomSlug(name: string): string {
  return generateSlug(name);
}

export function reassignObjectIds(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const typed = snapshot as unknown as CanvasSnapshot;
  const layerIdMap = new Map<string, string>();

  const newLayers = (typed.layers ?? []).map((layer) => {
    const newId = generateUlid();
    layerIdMap.set(layer.id, newId);
    return { ...layer, id: newId };
  });

  const newObjects: CanvasObject[] = (typed.objects ?? []).map((obj) => ({
    ...obj,
    id: generateUlid(),
    layerId: layerIdMap.get(obj.layerId) ?? obj.layerId,
  }));

  return {
    ...typed,
    objects: newObjects,
    layers: newLayers,
    metadata: {
      ...(typed.metadata ?? {}),
      objectCount: newObjects.length,
    },
  };
}
