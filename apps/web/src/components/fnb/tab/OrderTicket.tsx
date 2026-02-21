'use client';

import type { FnbTabDetail } from '@/types/fnb';
import { CourseSection } from './CourseSection';
import { FnbOrderLine } from './FnbOrderLine';

interface OrderTicketProps {
  tab: FnbTabDetail;
  activeSeat: number;
  onSendCourse: (courseNumber: number) => void;
  onFireCourse: (courseNumber: number) => void;
  onLineTap?: (lineId: string) => void;
}

export function OrderTicket({ tab, activeSeat, onSendCourse, onFireCourse, onLineTap }: OrderTicketProps) {
  const courses = tab.courses ?? [];
  const lines = tab.lines ?? [];

  // Filter by active seat
  const filteredLines = activeSeat === 0
    ? lines
    : lines.filter((l) => l.seatNumber === activeSeat);

  // Group by course
  const linesByCourse = new Map<number, typeof filteredLines>();
  for (const line of filteredLines) {
    const cn = line.courseNumber ?? 1;
    const existing = linesByCourse.get(cn) ?? [];
    existing.push(line);
    linesByCourse.set(cn, existing);
  }

  // Ensure all courses are represented
  for (const course of courses) {
    if (!linesByCourse.has(course.courseNumber)) {
      linesByCourse.set(course.courseNumber, []);
    }
  }

  const sortedCourses = [...linesByCourse.entries()].sort(([a], [b]) => a - b);

  if (sortedCourses.length === 0) {
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

        return (
          <CourseSection
            key={courseNum}
            courseNumber={courseNum}
            courseName={courseName}
            courseStatus={courseStatus}
            onSend={() => onSendCourse(courseNum)}
            onFire={() => onFireCourse(courseNum)}
          >
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
          </CourseSection>
        );
      })}
    </div>
  );
}
