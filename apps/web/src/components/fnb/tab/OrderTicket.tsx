'use client';

import type { FnbTabDetail, FnbDraftLine } from '@/types/fnb';
import { CourseSection } from './CourseSection';
import { FnbOrderLine } from './FnbOrderLine';

interface OrderTicketProps {
  tab: FnbTabDetail;
  activeSeat: number;
  draftLines?: FnbDraftLine[];
  onSendCourse: (courseNumber: number) => void;
  onFireCourse: (courseNumber: number) => void;
  onLineTap?: (lineId: string) => void;
}

export function OrderTicket({ tab, activeSeat, draftLines = [], onSendCourse, onFireCourse, onLineTap }: OrderTicketProps) {
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

  // Check if there's anything to show (server lines + drafts)
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
    <div className="flex-1 overflow-y-auto p-2">
      {sortedCourses.map(([courseNum, courseLines]) => {
        const courseInfo = courses.find((c) => c.courseNumber === courseNum);
        const courseName = courseInfo?.courseName ?? `Course ${courseNum}`;
        const courseStatus = (courseInfo?.courseStatus as 'unsent' | 'sent' | 'fired' | 'served') ?? 'unsent';
        const courseDrafts = draftsByCourse.get(courseNum) ?? [];

        return (
          <CourseSection
            key={courseNum}
            courseNumber={courseNum}
            courseName={courseName}
            courseStatus={courseStatus}
            onSend={() => onSendCourse(courseNum)}
            onFire={() => onFireCourse(courseNum)}
          >
            {/* Server-committed lines */}
            {courseLines.map((line) => (
              <FnbOrderLine
                key={line.id}
                seatNumber={line.seatNumber ?? 1}
                itemName={line.catalogItemName ?? 'Unknown'}
                modifiers={line.modifiers}
                priceCents={line.unitPriceCents ?? 0}
                qty={line.qty ?? 1}
                status={(line.status as 'draft' | 'sent' | 'fired' | 'served' | 'voided') ?? 'draft'}
                isUnsent={line.status === 'draft' || line.status === 'unsent'}
                onTap={() => onLineTap?.(line.id)}
              />
            ))}
            {/* Local draft lines (not yet persisted) */}
            {courseDrafts.map((draft) => (
              <div
                key={`draft-${draft.localId}`}
                style={{ opacity: 0.7, borderLeft: '2px dashed var(--fnb-text-muted)', paddingLeft: '4px' }}
              >
                <FnbOrderLine
                  seatNumber={draft.seatNumber}
                  itemName={draft.catalogItemName}
                  modifiers={draft.modifiers.map((m) => m.name)}
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
  );
}
