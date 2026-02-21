import type { CanvasObject } from '@oppsera/shared';

export function alignLeft(objs: CanvasObject[]): Array<{ id: string; changes: Partial<CanvasObject> }> {
  const minX = Math.min(...objs.map((o) => o.x));
  return objs.map((o) => ({ id: o.id, changes: { x: minX } }));
}

export function alignCenterH(objs: CanvasObject[], scalePxPerFt: number): Array<{ id: string; changes: Partial<CanvasObject> }> {
  const centers = objs.map((o) => o.x + o.width / scalePxPerFt / 2);
  const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
  return objs.map((o) => ({ id: o.id, changes: { x: avgCenter - o.width / scalePxPerFt / 2 } }));
}

export function alignRight(objs: CanvasObject[], scalePxPerFt: number): Array<{ id: string; changes: Partial<CanvasObject> }> {
  const maxRight = Math.max(...objs.map((o) => o.x + o.width / scalePxPerFt));
  return objs.map((o) => ({ id: o.id, changes: { x: maxRight - o.width / scalePxPerFt } }));
}

export function alignTop(objs: CanvasObject[]): Array<{ id: string; changes: Partial<CanvasObject> }> {
  const minY = Math.min(...objs.map((o) => o.y));
  return objs.map((o) => ({ id: o.id, changes: { y: minY } }));
}

export function alignMiddle(objs: CanvasObject[], scalePxPerFt: number): Array<{ id: string; changes: Partial<CanvasObject> }> {
  const centers = objs.map((o) => o.y + o.height / scalePxPerFt / 2);
  const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
  return objs.map((o) => ({ id: o.id, changes: { y: avgCenter - o.height / scalePxPerFt / 2 } }));
}

export function alignBottom(objs: CanvasObject[], scalePxPerFt: number): Array<{ id: string; changes: Partial<CanvasObject> }> {
  const maxBottom = Math.max(...objs.map((o) => o.y + o.height / scalePxPerFt));
  return objs.map((o) => ({ id: o.id, changes: { y: maxBottom - o.height / scalePxPerFt } }));
}

export function distributeH(objs: CanvasObject[], scalePxPerFt: number): Array<{ id: string; changes: Partial<CanvasObject> }> {
  if (objs.length < 3) return [];
  const sorted = [...objs].sort((a, b) => a.x - b.x);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const totalSpan = (last.x + last.width / scalePxPerFt) - first.x;
  const objectsWidth = sorted.reduce((sum, o) => sum + o.width / scalePxPerFt, 0);
  const gap = (totalSpan - objectsWidth) / (sorted.length - 1);

  let currentX = first.x;
  return sorted.map((o) => {
    const result = { id: o.id, changes: { x: currentX } };
    currentX += o.width / scalePxPerFt + gap;
    return result;
  });
}

export function distributeV(objs: CanvasObject[], scalePxPerFt: number): Array<{ id: string; changes: Partial<CanvasObject> }> {
  if (objs.length < 3) return [];
  const sorted = [...objs].sort((a, b) => a.y - b.y);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const totalSpan = (last.y + last.height / scalePxPerFt) - first.y;
  const objectsHeight = sorted.reduce((sum, o) => sum + o.height / scalePxPerFt, 0);
  const gap = (totalSpan - objectsHeight) / (sorted.length - 1);

  let currentY = first.y;
  return sorted.map((o) => {
    const result = { id: o.id, changes: { y: currentY } };
    currentY += o.height / scalePxPerFt + gap;
    return result;
  });
}
