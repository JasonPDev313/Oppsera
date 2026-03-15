'use client';

import { useState } from 'react';
import { ChevronDown, Flame } from 'lucide-react';

interface UpcomingCourse {
  tabId: string;
  courseNumber: number;
  courseName: string | null;
  courseStatus: string;
  itemCount: number;
  tableNumber: number | null;
}

interface CourseTimelineProps {
  courses: UpcomingCourse[];
  onFireCourse?: (tabId: string, courseNumber: number) => void;
}

function getStatusStyle(status: string): { background: string; color: string } {
  switch (status) {
    case 'held':
      return { background: 'rgba(217, 119, 6, 0.2)', color: '#fbbf24' };
    case 'sent':
      return { background: 'rgba(37, 99, 235, 0.2)', color: '#60a5fa' };
    default:
      return { background: 'rgba(148, 163, 184, 0.15)', color: 'var(--fnb-text-muted)' };
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'held':
      return 'HELD';
    case 'sent':
      return 'SENT';
    case 'unsent':
      return 'UNSENT';
    default:
      return status.toUpperCase();
  }
}

export function CourseTimeline({ courses, onFireCourse }: CourseTimelineProps) {
  const [expanded, setExpanded] = useState(true);

  if (courses.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--fnb-bg-surface)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '6px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontSize: 'calc(10px * var(--pos-font-scale, 1))',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--fnb-text-muted)',
            textTransform: 'uppercase',
          }}
        >
          Upcoming Courses
        </span>
        <span
          style={{
            fontSize: 'calc(10px * var(--pos-font-scale, 1))',
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: '999px',
            background: 'rgba(148, 163, 184, 0.15)',
            color: 'var(--fnb-text-secondary)',
          }}
        >
          {courses.length}
        </span>
        <ChevronDown
          size={13}
          style={{
            marginLeft: 'auto',
            color: 'var(--fnb-text-muted)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 150ms ease',
            flexShrink: 0,
          }}
        />
      </button>

      {/* Course rows */}
      {expanded && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1px',
            paddingBottom: '6px',
          }}
        >
          {courses.map((course) => {
            const canFire =
              onFireCourse !== undefined &&
              (course.courseStatus === 'held' || course.courseStatus === 'sent');
            const statusStyle = getStatusStyle(course.courseStatus);

            return (
              <div
                key={`${course.tabId}-${course.courseNumber}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  minHeight: '44px',
                  background: 'var(--fnb-bg-elevated)',
                  marginInline: '8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                }}
              >
                {/* Course name */}
                <span
                  style={{
                    fontSize: 'calc(11px * var(--pos-font-scale, 1))',
                    fontWeight: 600,
                    color: 'var(--fnb-text-primary)',
                    minWidth: 0,
                    flex: '1 1 auto',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {course.courseName ?? `Course ${course.courseNumber}`}
                </span>

                {/* Table number */}
                {course.tableNumber !== null && (
                  <span
                    style={{
                      fontSize: 'calc(10px * var(--pos-font-scale, 1))',
                      color: 'var(--fnb-text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    T{course.tableNumber}
                  </span>
                )}

                {/* Item count */}
                <span
                  style={{
                    fontSize: 'calc(10px * var(--pos-font-scale, 1))',
                    color: 'var(--fnb-text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {course.itemCount} {course.itemCount === 1 ? 'item' : 'items'}
                </span>

                {/* Status badge */}
                <span
                  style={{
                    fontSize: 'calc(10px * var(--pos-font-scale, 1))',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: statusStyle.background,
                    color: statusStyle.color,
                    flexShrink: 0,
                  }}
                >
                  {getStatusLabel(course.courseStatus)}
                </span>

                {/* Fire button */}
                {canFire && (
                  <button
                    type="button"
                    onClick={() => onFireCourse!(course.tabId, course.courseNumber)}
                    title="Fire course"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 12px',
                      minHeight: '44px',
                      minWidth: '44px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: '#f87171',
                      flexShrink: 0,
                      lineHeight: 1,
                    }}
                  >
                    <Flame size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
