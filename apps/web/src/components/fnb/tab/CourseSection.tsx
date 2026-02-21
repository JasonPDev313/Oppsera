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

const STATUS_COLORS: Record<string, string> = {
  unsent: 'var(--fnb-text-muted)',
  sent: 'var(--fnb-status-ordered)',
  fired: 'var(--fnb-status-entrees-fired)',
  served: 'var(--fnb-status-available)',
};

const STATUS_LABELS: Record<string, string> = {
  unsent: 'UNSENT',
  sent: 'SENT',
  fired: 'FIRED',
  served: 'SERVED',
};

export function CourseSection({ courseNumber, courseName, courseStatus, children, onHold, onFire, onSend }: CourseSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const color = STATUS_COLORS[courseStatus] ?? 'var(--fnb-text-muted)';

  return (
    <div className="mb-1">
      {/* Course header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-lg transition-colors hover:opacity-80"
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
          style={{ backgroundColor: `${color}20`, color }}
        >
          {STATUS_LABELS[courseStatus] ?? courseStatus}
        </span>

        {/* Inline actions */}
        <div className="flex-1" />
        {courseStatus === 'unsent' && onSend && (
          <span
            onClick={(e) => { e.stopPropagation(); onSend(); }}
            className="rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-status-ordered)', color: '#fff' }}
          >
            Send
          </span>
        )}
        {courseStatus === 'sent' && onFire && (
          <span
            onClick={(e) => { e.stopPropagation(); onFire(); }}
            className="rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-status-entrees-fired)', color: '#fff' }}
          >
            Fire
          </span>
        )}
        {(courseStatus === 'unsent' || courseStatus === 'sent') && onHold && (
          <span
            onClick={(e) => { e.stopPropagation(); onHold(); }}
            className="rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer hover:opacity-80"
            style={{ backgroundColor: 'var(--fnb-bg-primary)', color: 'var(--fnb-text-muted)' }}
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
