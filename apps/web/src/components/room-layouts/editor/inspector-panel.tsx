'use client';

import { useCallback } from 'react';
import {
  ArrowUpToLine,
  ArrowDownToLine,
  Lock,
  Unlock,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from 'lucide-react';
import { useEditorStore } from '@/stores/room-layout-editor';
import { ColorPicker } from './color-picker';
import type { CanvasObject } from '@oppsera/shared';

// ── Helpers ────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="shrink-0 text-xs text-gray-500">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  onCommit,
  step = 1,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: () => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={Math.round(value * 100) / 100}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      onBlur={onCommit}
      onKeyDown={(e) => { if (e.key === 'Enter') onCommit(); }}
      step={step}
      min={min}
      max={max}
      className="w-full rounded border border-gray-300 bg-surface px-2 py-1 text-right text-xs text-gray-900"
    />
  );
}

function SelectInput({
  value,
  options,
  onChange,
  onCommit,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => { onChange(e.target.value); onCommit(); }}
      className="w-full rounded border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-900"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ── Room Properties ────────────────────────────────────

function RoomProperties() {
  const roomName = useEditorStore((s) => s.roomName);
  const widthFt = useEditorStore((s) => s.widthFt);
  const heightFt = useEditorStore((s) => s.heightFt);
  const gridSizeFt = useEditorStore((s) => s.gridSizeFt);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const objects = useEditorStore((s) => s.objects);
  const setRoomName = useEditorStore((s) => s.setRoomName);

  let totalCapacity = 0;
  for (const obj of objects) {
    if (obj.type === 'table') {
      const seats = (obj.properties as { seats?: number }).seats;
      if (typeof seats === 'number') totalCapacity += seats;
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Room">
        <Field label="Name">
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="w-full rounded border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-900"
          />
        </Field>
        <Field label="Width (ft)">
          <span className="text-xs text-gray-700">{widthFt}</span>
        </Field>
        <Field label="Height (ft)">
          <span className="text-xs text-gray-700">{heightFt}</span>
        </Field>
        <Field label="Grid Size">
          <span className="text-xs text-gray-700">{gridSizeFt} ft</span>
        </Field>
        <Field label="Scale">
          <span className="text-xs text-gray-700">{scalePxPerFt} px/ft</span>
        </Field>
      </Section>
      <Section title="Summary">
        <Field label="Objects">
          <span className="text-xs text-gray-700">{objects.length}</span>
        </Field>
        <Field label="Capacity">
          <span className="text-xs text-gray-700">{totalCapacity} seats</span>
        </Field>
      </Section>
    </div>
  );
}

// ── Object Properties ──────────────────────────────────

function ObjectProperties({ objs }: { objs: CanvasObject[] }) {
  const updateObject = useEditorStore((s) => s.updateObject);
  const updateObjects = useEditorStore((s) => s.updateObjects);
  const commitToHistory = useEditorStore((s) => s.commitToHistory);
  const scalePxPerFt = useEditorStore((s) => s.scalePxPerFt);
  const layers = useEditorStore((s) => s.layers);
  const objects = useEditorStore((s) => s.objects);

  const isSingle = objs.length === 1;
  const obj = objs[0]!;

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      if (isSingle) {
        updateObject(obj.id, { [field]: value });
      } else {
        updateObjects(objs.map((o) => ({ id: o.id, changes: { [field]: value } })));
      }
    },
    [isSingle, obj.id, objs, updateObject, updateObjects],
  );

  const handleStyleChange = useCallback(
    (field: string, value: unknown) => {
      if (isSingle) {
        updateObject(obj.id, { style: { ...obj.style, [field]: value } });
      } else {
        updateObjects(
          objs.map((o) => ({
            id: o.id,
            changes: { style: { ...o.style, [field]: value } },
          })),
        );
      }
    },
    [isSingle, obj, objs, updateObject, updateObjects],
  );

  const handlePropChange = useCallback(
    (field: string, value: unknown) => {
      if (isSingle) {
        updateObject(obj.id, {
          properties: { ...(obj.properties as Record<string, unknown>), [field]: value },
        });
      } else {
        updateObjects(
          objs.map((o) => ({
            id: o.id,
            changes: {
              properties: { ...(o.properties as Record<string, unknown>), [field]: value },
            },
          })),
        );
      }
    },
    [isSingle, obj, objs, updateObject, updateObjects],
  );

  const commit = commitToHistory;

  const handleBringToFront = () => {
    const maxZ = Math.max(0, ...objects.map((o) => o.zIndex));
    handleChange('zIndex', maxZ + 1);
    commit();
  };

  const handleSendToBack = () => {
    const minZ = Math.min(0, ...objects.map((o) => o.zIndex));
    handleChange('zIndex', minZ - 1);
    commit();
  };

  const props = obj.properties as Record<string, unknown>;

  return (
    <div className="space-y-4">
      {isSingle ? (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium capitalize text-gray-900">
            {obj.type.replace('_', ' ')}
          </span>
          <button
            onClick={() => { handleChange('locked', !obj.locked); commit(); }}
            className="rounded p-1 hover:bg-gray-100"
            title={obj.locked ? 'Unlock' : 'Lock'}
          >
            {obj.locked ? <Lock className="h-3.5 w-3.5 text-gray-500" /> : <Unlock className="h-3.5 w-3.5 text-gray-400" />}
          </button>
        </div>
      ) : (
        <p className="text-sm font-medium text-gray-700">{objs.length} objects selected</p>
      )}

      <Section title="Position & Size">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <NumInput value={obj.x} onChange={(v) => handleChange('x', v)} onCommit={commit} step={0.5} min={0} />
          </Field>
          <Field label="Y">
            <NumInput value={obj.y} onChange={(v) => handleChange('y', v)} onCommit={commit} step={0.5} min={0} />
          </Field>
          <Field label="W">
            <NumInput value={obj.width / scalePxPerFt} onChange={(v) => handleChange('width', v * scalePxPerFt)} onCommit={commit} step={0.5} min={0.5} />
          </Field>
          <Field label="H">
            <NumInput value={obj.height / scalePxPerFt} onChange={(v) => handleChange('height', v * scalePxPerFt)} onCommit={commit} step={0.5} min={0.5} />
          </Field>
        </div>
        <Field label="Rotation">
          <div className="flex items-center gap-1">
            <NumInput value={obj.rotation} onChange={(v) => handleChange('rotation', v)} onCommit={commit} step={15} min={0} max={360} />
            <span className="text-xs text-gray-400">deg</span>
          </div>
        </Field>
      </Section>

      <Section title="Appearance">
        <ColorPicker label="Fill" value={obj.style.fill ?? '#e2e8f0'} onChange={(c) => handleStyleChange('fill', c)} onCommit={commit} />
        <ColorPicker label="Stroke" value={obj.style.stroke ?? '#64748b'} onChange={(c) => handleStyleChange('stroke', c)} onCommit={commit} />
        <Field label="Stroke W">
          <NumInput value={obj.style.strokeWidth ?? 1} onChange={(v) => handleStyleChange('strokeWidth', v)} onCommit={commit} step={0.5} min={0} max={10} />
        </Field>
        <Field label="Opacity">
          <input type="range" min={0} max={1} step={0.05} value={obj.style.opacity ?? 1} onChange={(e) => handleStyleChange('opacity', parseFloat(e.target.value))} onMouseUp={commit} className="w-full" />
        </Field>
        {obj.type !== 'door' && (
          <Field label="Radius">
            <NumInput value={obj.style.cornerRadius ?? 0} onChange={(v) => handleStyleChange('cornerRadius', v)} onCommit={commit} step={1} min={0} max={50} />
          </Field>
        )}
      </Section>

      <Section title="Layer">
        <Field label="Layer">
          <SelectInput value={obj.layerId} options={layers.map((l) => ({ value: l.id, label: l.name }))} onChange={(v) => handleChange('layerId', v)} onCommit={commit} />
        </Field>
        {isSingle && (
          <div className="flex gap-1">
            <button onClick={handleBringToFront} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200" title="Bring to Front">
              <ArrowUpToLine className="h-3 w-3" /> Front
            </button>
            <button onClick={handleSendToBack} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-gray-200" title="Send to Back">
              <ArrowDownToLine className="h-3 w-3" /> Back
            </button>
          </div>
        )}
      </Section>

      {isSingle && obj.type === 'table' && (
        <Section title="Table Settings">
          <Field label="Table #">
            <input type="text" value={String(props.tableNumber ?? '')} onChange={(e) => handlePropChange('tableNumber', e.target.value)} onBlur={commit} className="w-full rounded border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-900" />
          </Field>
          <Field label="Shape">
            <SelectInput value={String(props.shape ?? 'square')} options={[{ value: 'square', label: 'Square' }, { value: 'round', label: 'Round' }, { value: 'rectangle', label: 'Rectangle' }, { value: 'oval', label: 'Oval' }]} onChange={(v) => handlePropChange('shape', v)} onCommit={commit} />
          </Field>
          <Field label="Seats">
            <NumInput value={Number(props.seats ?? 4)} onChange={(v) => handlePropChange('seats', v)} onCommit={commit} step={1} min={1} max={20} />
          </Field>
          <Field label="Min Seats">
            <NumInput value={Number(props.minSeats ?? 1)} onChange={(v) => handlePropChange('minSeats', v)} onCommit={commit} step={1} min={1} />
          </Field>
          <Field label="Max Seats">
            <NumInput value={Number(props.maxSeats ?? 8)} onChange={(v) => handlePropChange('maxSeats', v)} onCommit={commit} step={1} min={1} />
          </Field>
          <Field label="Status">
            <SelectInput value={String(props.status ?? 'available')} options={[{ value: 'available', label: 'Available' }, { value: 'reserved', label: 'Reserved' }, { value: 'occupied', label: 'Occupied' }, { value: 'blocked', label: 'Blocked' }]} onChange={(v) => handlePropChange('status', v)} onCommit={commit} />
          </Field>
          <Field label="Joinable">
            <input type="checkbox" checked={!!props.joinable} onChange={(e) => { handlePropChange('joinable', e.target.checked); commit(); }} className="rounded" />
          </Field>
        </Section>
      )}

      {isSingle && (obj.type === 'wall' || obj.type === 'divider') && (
        <Section title="Wall Settings">
          <Field label="Material">
            <SelectInput value={String(props.material ?? 'drywall')} options={[{ value: 'drywall', label: 'Drywall' }, { value: 'glass', label: 'Glass' }, { value: 'brick', label: 'Brick' }, { value: 'curtain', label: 'Curtain' }]} onChange={(v) => handlePropChange('material', v)} onCommit={commit} />
          </Field>
        </Section>
      )}

      {isSingle && (obj.type === 'door' || obj.type === 'window') && (
        <Section title="Door Settings">
          <Field label="Type">
            <SelectInput value={String(props.doorType ?? 'single')} options={[{ value: 'single', label: 'Single' }, { value: 'double', label: 'Double' }, { value: 'sliding', label: 'Sliding' }, { value: 'revolving', label: 'Revolving' }]} onChange={(v) => handlePropChange('doorType', v)} onCommit={commit} />
          </Field>
          <Field label="Swing">
            <SelectInput value={String(props.swingDirection ?? 'right')} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }]} onChange={(v) => handlePropChange('swingDirection', v)} onCommit={commit} />
          </Field>
          <Field label="Angle">
            <NumInput value={Number(props.openingAngle ?? 90)} onChange={(v) => handlePropChange('openingAngle', v)} onCommit={commit} step={15} min={0} max={180} />
          </Field>
        </Section>
      )}

      {isSingle && obj.type === 'text_label' && (
        <Section title="Text Settings">
          <div>
            <label className="text-xs text-gray-500">Content</label>
            <textarea value={String(props.text ?? '')} onChange={(e) => handlePropChange('text', e.target.value)} onBlur={commit} rows={2} className="mt-1 w-full rounded border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-900" />
          </div>
          <Field label="Font Size">
            <NumInput value={Number(props.fontSize ?? 16)} onChange={(v) => handlePropChange('fontSize', v)} onCommit={commit} step={1} min={8} max={72} />
          </Field>
          <Field label="Weight">
            <SelectInput value={String(props.fontWeight ?? 'normal')} options={[{ value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Bold' }]} onChange={(v) => handlePropChange('fontWeight', v)} onCommit={commit} />
          </Field>
          <Field label="Align">
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button key={align} onClick={() => { handlePropChange('textAlign', align); commit(); }} className={`rounded p-1 ${String(props.textAlign ?? 'center') === align ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                  {align === 'left' && <AlignLeft className="h-3.5 w-3.5" />}
                  {align === 'center' && <AlignCenter className="h-3.5 w-3.5" />}
                  {align === 'right' && <AlignRight className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </Field>
        </Section>
      )}

      {isSingle && obj.type === 'service_zone' && (
        <Section title="Zone Settings">
          <Field label="Name">
            <input type="text" value={String(props.zoneName ?? '')} onChange={(e) => handlePropChange('zoneName', e.target.value)} onBlur={commit} className="w-full rounded border border-gray-300 bg-surface px-2 py-1 text-xs text-gray-900" />
          </Field>
          <Field label="Type">
            <SelectInput value={String(props.zoneType ?? 'wait_service')} options={[{ value: 'bar_service', label: 'Bar Service' }, { value: 'wait_service', label: 'Wait Service' }, { value: 'self_service', label: 'Self Service' }, { value: 'kitchen_service', label: 'Kitchen Service' }]} onChange={(v) => handlePropChange('zoneType', v)} onCommit={commit} />
          </Field>
          <ColorPicker label="Zone Color" value={String(props.color ?? '#3b82f6')} onChange={(c) => handlePropChange('color', c)} onCommit={commit} />
        </Section>
      )}
    </div>
  );
}

// ── Main Inspector ─────────────────────────────────────

export function InspectorPanel() {
  const { selectedIds, objects } = useEditorStore();
  const selectedObjects = objects.filter((o) => selectedIds.includes(o.id));

  return (
    <div className="flex h-full w-70 flex-col border-l border-gray-200 bg-surface">
      <div className="border-b border-gray-200 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inspector</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {selectedObjects.length === 0 ? (
          <RoomProperties />
        ) : (
          <ObjectProperties objs={selectedObjects} />
        )}
      </div>
    </div>
  );
}
