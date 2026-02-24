'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface CourseSectionProps {
  courseNumber: number;
  courseName: string;
  courseStatus: 'unsent' | 'sent' | 'fired' | 'served';
  children: React.ReactNode;
  onHold?: () => void;
  onFire?: () => void;
  onSend?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  unsent: 'UNSENT',
  sent: 'SENT',
  fired: 'FIRED',
  served: 'SERVED',
};

function getStatusBadgeStyle(status: string): React.CSSProperties {
  switch (status) {
    case 'sent':
      return { backgroundColor: 'rgba(33, 150, 243, 0.15)', color: 'var(--fnb-info)' };
    case 'fired':
      return { backgroundColor: 'rgba(255, 152, 0, 0.15)', color: 'var(--fnb-status-entrees-fired)' };
    case 'served':
      return { backgroundColor: 'rgba(34, 197, 94, 0.15)', color: 'var(--fnb-success)' };
    default: // unsent
      return { backgroundColor: 'rgba(234, 179, 8, 0.15)', color: 'var(--fnb-warning)' };
  }
}

export function CourseSection({ courseNumber, courseName, courseStatus, children, onHold, onFire, onSend }: CourseSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-1">
      {/* Course header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-lg transition-opacity hover:opacity-90"
        style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--fnb-text-muted)' }} />
        )}
        <span className="text-xs font-bold uppercase" style={{ color: 'var(--fnb-text-primary)' }}>
          Course {courseNumber}: {courseName}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={getStatusBadgeStyle(courseStatus)}
        >
          {STATUS_LABELS[courseStatus] ?? courseStatus}
        </span>

        {/* Inline actions */}
        <div className="flex-1" />
        {courseStatus === 'unsent' && onSend && (
          <span
            onClick={(e) => { e.stopPropagation(); onSend(); }}
            className="rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-action-send)', color: '#fff' }}
          >
            Send
          </span>
        )}
        {courseStatus === 'sent' && onFire && (
          <span
            onClick={(e) => { e.stopPropagation(); onFire(); }}
            className="rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-action-fire)', color: '#fff' }}
          >
            Fire
          </span>
        )}
        {(courseStatus === 'unsent' || courseStatus === 'sent') && onHold && (
          <span
            onClick={(e) => { e.stopPropagation(); onHold(); }}
            className="rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-surface)', color: 'var(--fnb-text-muted)' }}
          >
            Hold
          </span>
        )}
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="mt-0.5">
          {children}
        </div>
      )}
    </div>
  );
}
