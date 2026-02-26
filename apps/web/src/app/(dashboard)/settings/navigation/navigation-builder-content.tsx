'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  GripVertical,
  Eye,
  EyeOff,
  Lock,
  RotateCcw,
  Save,
  Loader2,
  Info,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavPreferences } from '@/hooks/use-nav-preferences';
import { useEntitlementsContext } from '@/components/entitlements-provider';
import { navigation } from '@/lib/navigation';
import { isPinnedNavItem } from '@/lib/navigation-order';
import type { NavItem } from '@/lib/navigation';
import type { NavItemPreference } from '@oppsera/shared';

// ─── Types ──────────────────────────────────────────────────────────

interface BuilderItem {
  href: string;
  name: string;
  icon: NavItem['icon'];
  moduleKey?: string;
  hidden: boolean;
  pinned: boolean;
}

// ─── SortableNavRow ─────────────────────────────────────────────────

function SortableNavRow({
  item,
  onToggleHidden,
}: {
  item: BuilderItem;
  onToggleHidden: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.href });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = item.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
        isDragging
          ? 'z-10 border-indigo-500/30 bg-indigo-500/10 shadow-lg'
          : item.hidden
            ? 'border-border/60 bg-muted/50'
            : 'border-border bg-surface hover:border-border'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
        aria-label={`Drag to reorder ${item.name}`}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Icon */}
      <Icon
        className={`h-5 w-5 shrink-0 ${
          item.hidden ? 'text-muted-foreground/60' : 'text-muted-foreground'
        }`}
      />

      {/* Name */}
      <span
        className={`flex-1 text-sm font-medium ${
          item.hidden
            ? 'text-muted-foreground line-through'
            : 'text-foreground'
        }`}
      >
        {item.name}
      </span>

      {/* Module badge */}
      {item.moduleKey && (
        <span className="hidden rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground sm:inline-block">
          {item.moduleKey}
        </span>
      )}

      {/* Visibility toggle or pin indicator */}
      {item.pinned ? (
        <span
          className="rounded p-1.5 text-muted-foreground"
          title="This item is always visible"
        >
          <Lock className="h-4 w-4" />
        </span>
      ) : (
        <button
          onClick={onToggleHidden}
          className={`rounded p-1.5 transition-colors ${
            item.hidden
              ? 'text-muted-foreground/60 hover:bg-accent hover:text-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          title={item.hidden ? 'Show in sidebar' : 'Hide from sidebar'}
        >
          {item.hidden ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

// ─── Drag Overlay Item ──────────────────────────────────────────────

function DragOverlayItem({ item }: { item: BuilderItem }) {
  const Icon = item.icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-indigo-500/40 bg-surface p-3 shadow-xl">
      <GripVertical className="h-5 w-5 text-indigo-400" />
      <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium text-foreground">
        {item.name}
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export default function NavigationBuilderContent() {
  const { itemOrder, isLoading, isSaving, save, reset } = useNavPreferences();
  const { isModuleEnabled } = useEntitlementsContext();

  // Build the full ordered list from defaults + saved preferences
  const defaultItems = useMemo((): BuilderItem[] => {
    return navigation
      .filter((item) => !item.moduleKey || isModuleEnabled(item.moduleKey))
      .map((item) => ({
        href: item.href,
        name: item.name,
        icon: item.icon,
        moduleKey: item.moduleKey,
        hidden: false,
        pinned: isPinnedNavItem(item.href),
      }));
  }, [isModuleEnabled]);

  // Initialize builder items from saved order + defaults
  const [items, setItems] = useState<BuilderItem[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Build items when preferences load
  useEffect(() => {
    if (isLoading) return;

    const saved = itemOrder ?? [];
    if (saved.length === 0) {
      setItems(defaultItems);
      return;
    }

    // Merge saved order with defaults
    const navByHref = new Map<string, BuilderItem>();
    for (const item of defaultItems) {
      navByHref.set(item.href, item);
    }

    const result: BuilderItem[] = [];
    const seen = new Set<string>();

    // Phase 1: items in saved order
    for (const pref of saved) {
      const item = navByHref.get(pref.href);
      if (!item) continue;
      result.push({
        ...item,
        hidden: pref.hidden && !item.pinned,
      });
      seen.add(pref.href);
    }

    // Phase 2: new items not in saved order
    for (const item of defaultItems) {
      if (seen.has(item.href)) continue;
      result.push(item);
    }

    setItems(result);
  }, [isLoading, itemOrder, defaultItems]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !items) return;

    const oldIndex = items.findIndex((i) => i.href === active.id);
    const newIndex = items.findIndex((i) => i.href === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    setItems(arrayMove(items, oldIndex, newIndex));
    setIsDirty(true);
  }, [items]);

  const handleToggleHidden = useCallback((href: string) => {
    setItems((prev) => {
      if (!prev) return prev;
      return prev.map((item) =>
        item.href === href ? { ...item, hidden: !item.hidden } : item,
      );
    });
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!items) return;

    const prefs: NavItemPreference[] = items.map((item) => ({
      href: item.href,
      hidden: item.hidden,
    }));

    try {
      await save(prefs);
      setIsDirty(false);
      setToast({ type: 'success', message: 'Navigation order saved' });
    } catch {
      setToast({ type: 'error', message: 'Failed to save navigation order' });
    }
  }, [items, save]);

  const handleReset = useCallback(async () => {
    try {
      await reset();
      setItems(defaultItems);
      setIsDirty(false);
      setToast({ type: 'success', message: 'Navigation reset to default' });
    } catch {
      setToast({ type: 'error', message: 'Failed to reset navigation' });
    }
  }, [reset, defaultItems]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeItem = activeId ? items?.find((i) => i.href === activeId) : null;

  if (isLoading || !items) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted" />
        <div className="space-y-2 pt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Navigation Menu</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Drag items to reorder your sidebar navigation. Toggle visibility to hide items you don&apos;t need.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
          {isDirty && (
            <span className="text-xs text-amber-500">Unsaved changes</span>
          )}
        </div>
      </div>

      {/* Info bar */}
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-xs text-blue-500">
          Items marked with a lock icon are always visible and cannot be hidden. Modules that are disabled
          in your entitlements will not appear here. Changes apply to all users in your organization.
        </p>
      </div>

      {/* Sortable list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((i) => i.href)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {items.map((item) => (
              <SortableNavRow
                key={item.href}
                item={item}
                onToggleHidden={() => handleToggleHidden(item.href)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeItem ? <DragOverlayItem item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
