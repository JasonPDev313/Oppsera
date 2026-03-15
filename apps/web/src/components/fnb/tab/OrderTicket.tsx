'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { List, Layers } from 'lucide-react';
import type { FnbTabDetail, FnbDraftLine, FnbTabLine } from '@/types/fnb';
import { CourseSection } from './CourseSection';
import { FnbOrderLine } from './FnbOrderLine';
import { FnbLineItemEditPanel } from './FnbLineItemEditPanel';
import type { FnbLineEditPermissions } from './FnbLineItemEditPanel';

interface OrderTicketProps {
  tab: FnbTabDetail;
  activeSeat: number;
  activeCourse: number;
  courseNames: string[];
  draftLines?: FnbDraftLine[];
  onSendCourse: (courseNumber: number) => void;
  onFireCourse: (courseNumber: number) => void;
  onLineTap?: (lineId: string) => void;
  /** When false, hides per-course Send/Fire buttons (KDS routing mode) */
  kdsSendEnabled?: boolean;
  /** Disables action buttons while a mutation is in-flight */
  disabled?: boolean;
  // Item-level edit actions
  onUpdateNote?: (lineId: string, note: string | null) => void;
  onDeleteLine?: (lineId: string) => void;
  onChangePrice?: (lineId: string, newPriceCents: number, reason: string) => void;
  onVoidLine?: (lineId: string, reason: string) => void;
  onCompLine?: (lineId: string, reason: string, compCategory: string) => void;
  onChangeSeat?: (lineId: string, newSeat: number) => void;
  onChangeCourse?: (lineId: string, newCourse: number) => void;
  onEditDraftModifiers?: (localId: string) => void;
  seatCount?: number;
  linePermissions?: FnbLineEditPermissions;
}

export const OrderTicket = memo(function OrderTicket({
  tab,
  activeSeat,
  activeCourse,
  courseNames,
  draftLines = [],
  onSendCourse,
  onFireCourse,
  onLineTap,
  kdsSendEnabled = true,
  disabled,
  onUpdateNote,
  onDeleteLine,
  onChangePrice,
  onVoidLine,
  onCompLine,
  onChangeSeat,
  onChangeCourse,
  onEditDraftModifiers,
  seatCount,
  linePermissions,
}: OrderTicketProps) {
  const [viewMode, setViewMode] = useState<'active' | 'all'>('all');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  const hasItemEditActions = !!(onUpdateNote || onDeleteLine || onChangePrice || onVoidLine || onCompLine || onChangeSeat || onChangeCourse || onEditDraftModifiers);

  const handleLineTap = useCallback((lineId: string) => {
    if (hasItemEditActions) {
      setEditingLineId((prev) => (prev === lineId ? null : lineId));
    }
    onLineTap?.(lineId);
  }, [hasItemEditActions, onLineTap]);

  const handleEditDone = useCallback(() => {
    setEditingLineId(null);
  }, []);

  const defaultPermissions: FnbLineEditPermissions = linePermissions ?? {
    priceOverride: true,
    discount: true,
    voidLine: true,
    comp: true,
  };

  const courses = tab.courses ?? [];
  const serverLines = tab.lines ?? [];

  // Memoize line grouping — avoid re-building Maps on every render
  const { sortedCourses, draftsByCourse, courseStatusMap, hasAnyContent } = useMemo(() => {
    // Filter server lines by active seat
    const filteredServerLines = activeSeat === 0
      ? serverLines
      : serverLines.filter((l) => l.seatNumber === activeSeat);

    // Filter draft lines by active seat
    const filteredDrafts = activeSeat === 0
      ? draftLines
      : draftLines.filter((d) => d.seatNumber === activeSeat);

    // Group server lines by course
    const linesByCourse = new Map<number, typeof filteredServerLines>();
    for (const line of filteredServerLines) {
      const cn = line.courseNumber ?? 1;
      const existing = linesByCourse.get(cn) ?? [];
      existing.push(line);
      linesByCourse.set(cn, existing);
    }

    // Group draft lines by course
    const dbc = new Map<number, FnbDraftLine[]>();
    for (const draft of filteredDrafts) {
      const cn = draft.courseNumber ?? 1;
      const existing = dbc.get(cn) ?? [];
      existing.push(draft);
      dbc.set(cn, existing);
    }

    // Ensure all courses (server + draft) are represented
    for (const course of courses) {
      if (!linesByCourse.has(course.courseNumber)) {
        linesByCourse.set(course.courseNumber, []);
      }
    }
    for (const cn of dbc.keys()) {
      if (!linesByCourse.has(cn)) {
        linesByCourse.set(cn, []);
      }
    }

    const sorted = [...linesByCourse.entries()].sort(([a], [b]) => a - b);

    // Build a map of course statuses for "previous course served" detection
    const csm = new Map<number, string>();
    for (const c of courses) {
      csm.set(c.courseNumber, c.courseStatus);
    }

    return {
      sortedCourses: sorted,
      draftsByCourse: dbc,
      courseStatusMap: csm,
      hasAnyContent: sorted.length > 0 || filteredDrafts.length > 0,
    };
  }, [serverLines, draftLines, activeSeat, courses]);

  // In "active" mode, only show the active course
  const displayCourses = viewMode === 'active'
    ? sortedCourses.filter(([cn]) => cn === activeCourse)
    : sortedCourses;

  if (!hasAnyContent) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm" style={{ color: 'var(--fnb-text-muted)' }}>
          No items yet — tap menu to add
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ backgroundColor: 'var(--fnb-bg-surface)' }}>
      {/* View mode toggle — only show when multiple courses exist */}
      {sortedCourses.length > 1 && (
        <div
          className="flex items-center gap-1 px-2 py-1 shrink-0"
          style={{ borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => setViewMode('all')}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: viewMode === 'all' ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: viewMode === 'all' ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
            }}
          >
            <Layers className="h-3 w-3" />
            All
          </button>
          <button
            type="button"
            onClick={() => setViewMode('active')}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: viewMode === 'active' ? 'var(--fnb-bg-elevated)' : 'transparent',
              color: viewMode === 'active' ? 'var(--fnb-text-primary)' : 'var(--fnb-text-muted)',
            }}
          >
            <List className="h-3 w-3" />
            Course {activeCourse}
          </button>
        </div>
      )}

      {/* Course sections */}
      <div className="flex-1 overflow-y-auto p-2">
        {displayCourses.map(([courseNum, courseLines]) => {
          const courseInfo = courses.find((c) => c.courseNumber === courseNum);
          const courseName = courseInfo?.courseName ?? courseNames[courseNum - 1] ?? `Course ${courseNum}`;
          const courseStatus = (courseInfo?.courseStatus as 'unsent' | 'sent' | 'held' | 'fired' | 'cooking' | 'ready' | 'served') ?? 'unsent';
          const courseDrafts = draftsByCourse.get(courseNum) ?? [];
          const totalItems = courseLines.length + courseDrafts.length;

          // Check if previous course is served (for fire pulse)
          const prevCourseStatus = courseNum > 1 ? courseStatusMap.get(courseNum - 1) : undefined;
          const previousCourseServed = prevCourseStatus === 'served';

          return (
            <CourseSection
              key={courseNum}
              courseNumber={courseNum}
              courseName={courseName}
              courseStatus={courseStatus}
              sentAt={courseInfo?.sentAt}
              firedAt={courseInfo?.firedAt}
              servedAt={courseInfo?.servedAt}
              itemCount={totalItems}
              previousCourseServed={previousCourseServed}
              onSend={kdsSendEnabled && courseInfo ? () => onSendCourse(courseNum) : undefined}
              onFire={kdsSendEnabled && courseInfo ? () => onFireCourse(courseNum) : undefined}
              disabled={disabled}
            >
              {/* Server-committed lines */}
              {courseLines.map((line) => {
                const mods = (line.modifiers ?? []) as Array<Record<string, unknown>>;
                const modAdj = mods.reduce((sum, m) => sum + (Number(m?.priceAdjustment) || 0), 0);
                return (
                <div key={line.id}>
                  <FnbOrderLine
                    seatNumber={line.seatNumber ?? 1}
                    itemName={line.catalogItemName ?? 'Unknown'}
                    modifiers={mods.map((mod) => {
                      if (typeof mod === 'string') return mod as string;
                      const name = String(mod?.name ?? '');
                      const price = Number(mod?.priceAdjustment) || 0;
                      const suffix = price > 0 ? ` (+$${(price / 100).toFixed(2)})` : '';
                      if (mod?.instruction === 'none') return `NO ${name}`;
                      if (mod?.instruction === 'extra') return `EXTRA ${name}${suffix}`;
                      if (mod?.instruction === 'on_side') return `${name} ON SIDE${suffix}`;
                      return `${name}${suffix}`;
                    })}
                    specialInstructions={line.specialInstructions}
                    priceCents={(line.unitPriceCents ?? 0) + modAdj}
                    qty={line.qty ?? 1}
                    status={(line.status as 'draft' | 'sent' | 'fired' | 'served' | 'voided') ?? 'draft'}
                    isUnsent={line.status === 'draft' || line.status === 'unsent'}
                    onTap={() => handleLineTap(line.id)}
                  />
                  {/* Inline item edit panel */}
                  {editingLineId === line.id && hasItemEditActions && line.status !== 'voided' && (
                    <FnbLineItemEditPanel
                      line={line}
                      onUpdateNote={onUpdateNote ?? (() => {})}
                      onDelete={onDeleteLine ?? (() => {})}
                      onChangePrice={onChangePrice ?? (() => {})}
                      onVoidLine={onVoidLine ?? (() => {})}
                      onCompLine={onCompLine ?? (() => {})}
                      onChangeSeat={onChangeSeat}
                      onChangeCourse={onChangeCourse}
                      seatCount={seatCount}
                      courseNames={courseNames}
                      onDone={handleEditDone}
                      permissions={defaultPermissions}
                      disabled={disabled}
                    />
                  )}
                </div>
              )})}
              {/* Local draft lines (not yet persisted) */}
              {courseDrafts.map((draft) => {
                const draftModAdj = draft.modifiers.reduce((sum, m) => sum + (m.priceAdjustment || 0), 0);
                // Build a FnbTabLine-compatible object so edit panel can render
                const draftAsLine: FnbTabLine = {
                  id: draft.localId,
                  orderLineId: null,
                  catalogItemId: draft.catalogItemId,
                  catalogItemName: draft.catalogItemName,
                  seatNumber: draft.seatNumber,
                  courseNumber: draft.courseNumber,
                  qty: draft.qty,
                  unitPriceCents: draft.unitPriceCents,
                  extendedPriceCents: draft.unitPriceCents * draft.qty,
                  modifiers: draft.modifiers as unknown[],
                  specialInstructions: draft.specialInstructions,
                  status: 'draft',
                  sentAt: null,
                  firedAt: null,
                  voidedAt: null,
                  voidedBy: null,
                  voidReason: null,
                };
                return (
                <div
                  key={`draft-${draft.localId}`}
                  style={{ opacity: 0.7, borderLeft: '2px dashed var(--fnb-text-muted)', paddingLeft: 4 }}
                >
                  <FnbOrderLine
                    seatNumber={draft.seatNumber}
                    itemName={draft.catalogItemName}
                    modifiers={draft.modifiers.map((m) => {
                      const price = m.priceAdjustment || 0;
                      const suffix = price > 0 ? ` (+$${(price / 100).toFixed(2)})` : '';
                      if (m.instruction === 'none') return `NO ${m.name}`;
                      if (m.instruction === 'extra') return `EXTRA ${m.name}${suffix}`;
                      if (m.instruction === 'on_side') return `${m.name} ON SIDE${suffix}`;
                      return `${m.name}${suffix}`;
                    })}
                    specialInstructions={draft.specialInstructions}
                    priceCents={draft.unitPriceCents + draftModAdj}
                    qty={draft.qty}
                    status="draft"
                    isUnsent
                    onTap={() => handleLineTap(draft.localId)}
                  />
                  {/* Inline edit panel for drafts — seat/course change + modifier editing */}
                  {editingLineId === draft.localId && (onChangeSeat || onChangeCourse || onEditDraftModifiers) && (
                    <FnbLineItemEditPanel
                      line={draftAsLine}
                      onUpdateNote={() => {}}
                      onDelete={() => {}}
                      onChangePrice={() => {}}
                      onVoidLine={() => {}}
                      onCompLine={() => {}}
                      onChangeSeat={onChangeSeat}
                      onChangeCourse={onChangeCourse}
                      onEditModifiers={onEditDraftModifiers ? () => { onEditDraftModifiers(draft.localId); handleEditDone(); } : undefined}
                      seatCount={seatCount}
                      courseNames={courseNames}
                      onDone={handleEditDone}
                      permissions={{ priceOverride: false, discount: false, voidLine: false, comp: false }}
                      disabled={disabled}
                    />
                  )}
                </div>
              )})}
            </CourseSection>
          );
        })}
      </div>
    </div>
  );
});
