'use client';

import { useState } from 'react';
import { List, Layers } from 'lucide-react';
import type { FnbTabDetail, FnbDraftLine } from '@/types/fnb';
import { CourseSection } from './CourseSection';
import { FnbOrderLine } from './FnbOrderLine';

interface OrderTicketProps {
  tab: FnbTabDetail;
  activeSeat: number;
  activeCourse: number;
  courseNames: string[];
  draftLines?: FnbDraftLine[];
  onSendCourse: (courseNumber: number) => void;
  onFireCourse: (courseNumber: number) => void;
  onLineTap?: (lineId: string) => void;
  onMoveLineToCourse?: (lineId: string, newCourseNumber: number) => void;
  /** When false, hides per-course Send/Fire buttons (KDS routing mode) */
  kdsSendEnabled?: boolean;
}

export function OrderTicket({
  tab,
  activeSeat,
  activeCourse,
  courseNames,
  draftLines = [],
  onSendCourse,
  onFireCourse,
  onLineTap,
  onMoveLineToCourse,
  kdsSendEnabled = true,
}: OrderTicketProps) {
  const [viewMode, setViewMode] = useState<'active' | 'all'>('all');
  const [coursePickerLineId, setCoursePickerLineId] = useState<string | null>(null);

  const courses = tab.courses ?? [];
  const serverLines = tab.lines ?? [];

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
  const draftsByCourse = new Map<number, FnbDraftLine[]>();
  for (const draft of filteredDrafts) {
    const cn = draft.courseNumber ?? 1;
    const existing = draftsByCourse.get(cn) ?? [];
    existing.push(draft);
    draftsByCourse.set(cn, existing);
  }

  // Ensure all courses (server + draft) are represented
  for (const course of courses) {
    if (!linesByCourse.has(course.courseNumber)) {
      linesByCourse.set(course.courseNumber, []);
    }
  }
  for (const cn of draftsByCourse.keys()) {
    if (!linesByCourse.has(cn)) {
      linesByCourse.set(cn, []);
    }
  }

  const sortedCourses = [...linesByCourse.entries()].sort(([a], [b]) => a - b);

  // In "active" mode, only show the active course
  const displayCourses = viewMode === 'active'
    ? sortedCourses.filter(([cn]) => cn === activeCourse)
    : sortedCourses;

  // Build a map of course statuses for "previous course served" detection
  const courseStatusMap = new Map<number, string>();
  for (const c of courses) {
    courseStatusMap.set(c.courseNumber, c.courseStatus);
  }

  // Check if there's anything to show
  const hasAnyContent = sortedCourses.length > 0 || filteredDrafts.length > 0;

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
              onSend={kdsSendEnabled ? () => onSendCourse(courseNum) : undefined}
              onFire={kdsSendEnabled ? () => onFireCourse(courseNum) : undefined}
            >
              {/* Server-committed lines */}
              {courseLines.map((line) => (
                <div key={line.id} className="relative">
                  <FnbOrderLine
                    seatNumber={line.seatNumber ?? 1}
                    itemName={line.catalogItemName ?? 'Unknown'}
                    modifiers={(line.modifiers ?? []).map((mod) => {
                      if (typeof mod === 'string') return mod;
                      const m = mod as Record<string, unknown>;
                      const name = String(m?.name ?? '');
                      if (m?.instruction === 'none') return `NO ${name}`;
                      if (m?.instruction === 'extra') return `EXTRA ${name}`;
                      if (m?.instruction === 'on_side') return `${name} ON SIDE`;
                      return name;
                    })}
                    specialInstructions={line.specialInstructions}
                    priceCents={line.unitPriceCents ?? 0}
                    qty={line.qty ?? 1}
                    status={(line.status as 'draft' | 'sent' | 'fired' | 'served' | 'voided') ?? 'draft'}
                    isUnsent={line.status === 'draft' || line.status === 'unsent'}
                    onTap={() => {
                      if (coursePickerLineId === line.id) {
                        setCoursePickerLineId(null);
                      } else {
                        onLineTap?.(line.id);
                      }
                    }}
                    onLongPress={onMoveLineToCourse && (line.status === 'draft' || line.status === 'unsent')
                      ? () => setCoursePickerLineId(line.id)
                      : undefined
                    }
                  />
                  {/* Course reassignment dropdown */}
                  {coursePickerLineId === line.id && onMoveLineToCourse && (
                    <div
                      className="absolute right-2 top-full z-10 rounded-lg shadow-lg border p-1 min-w-30"
                      style={{
                        backgroundColor: 'var(--fnb-bg-surface)',
                        borderColor: 'rgba(148, 163, 184, 0.2)',
                      }}
                    >
                      <p className="px-2 py-1 text-[9px] font-bold uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
                        Move to course
                      </p>
                      {courseNames.map((name, i) => {
                        const targetCourse = i + 1;
                        if (targetCourse === courseNum) return null;
                        return (
                          <button
                            key={targetCourse}
                            type="button"
                            onClick={() => {
                              onMoveLineToCourse(line.id, targetCourse);
                              setCoursePickerLineId(null);
                            }}
                            className="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs transition-opacity hover:opacity-80"
                            style={{ color: 'var(--fnb-text-primary)' }}
                          >
                            <span className="font-bold" style={{ color: 'var(--fnb-text-muted)' }}>C{targetCourse}</span>
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {/* Local draft lines (not yet persisted) */}
              {courseDrafts.map((draft) => (
                <div
                  key={`draft-${draft.localId}`}
                  style={{ opacity: 0.7, borderLeft: '2px dashed var(--fnb-text-muted)', paddingLeft: 4 }}
                >
                  <FnbOrderLine
                    seatNumber={draft.seatNumber}
                    itemName={draft.catalogItemName}
                    modifiers={draft.modifiers.map((m) => {
                      // Format with instruction prefix for proper chip coloring
                      if (m.instruction === 'none') return `NO ${m.name}`;
                      if (m.instruction === 'extra') return `EXTRA ${m.name}`;
                      if (m.instruction === 'on_side') return `${m.name} ON SIDE`;
                      return m.name;
                    })}
                    specialInstructions={draft.specialInstructions}
                    priceCents={draft.unitPriceCents}
                    qty={draft.qty}
                    status="draft"
                    isUnsent
                  />
                </div>
              ))}
            </CourseSection>
          );
        })}
      </div>
    </div>
  );
}
