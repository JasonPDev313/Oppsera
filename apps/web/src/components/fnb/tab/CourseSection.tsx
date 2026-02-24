'use client';

import { ChevronDown, ChevronRight, Pause, Flame } from 'lucide-react';
import { useState, useEffect } from 'react';

interface CourseSectionProps {
  courseNumber: number;
  courseName: string;
  courseStatus: 'unsent' | 'sent' | 'held' | 'fired' | 'cooking' | 'ready' | 'served';
  sentAt?: string | null;
  firedAt?: string | null;
  servedAt?: string | null;
  itemCount?: number;
  /** True when the previous course has been served — used to pulse the Fire button */
  previousCourseServed?: boolean;
  children: React.ReactNode;
  onHold?: () => void;
  onFire?: () => void;
  onSend?: () => void;
}

// ── Timeline Steps ─────────────────────────────────────────────

const STEPS = ['unsent', 'sent', 'fired', 'served'] as const;

const STEP_COLORS: Record<string, string> = {
  unsent: 'var(--fnb-text-muted)',
  sent: 'var(--fnb-info)',
  fired: 'var(--fnb-status-entrees-fired)',
  served: 'var(--fnb-success)',
};

function getStepIndex(status: string): number {
  // Map expanded statuses to timeline position
  switch (status) {
    case 'unsent': return 0;
    case 'sent': return 1;
    case 'held': return 0; // held = back to pre-send
    case 'fired':
    case 'cooking':
    case 'ready': return 2;
    case 'served': return 3;
    default: return 0;
  }
}

function StatusTimeline({ status }: { status: string }) {
  const activeIndex = getStepIndex(status);

  return (
    <div className="flex items-center gap-0.5">
      {STEPS.map((step, i) => {
        const isCompleted = i <= activeIndex;
        const isCurrent = i === activeIndex;
        const color = isCompleted ? STEP_COLORS[STEPS[activeIndex]!] ?? STEP_COLORS.unsent! : 'var(--fnb-text-disabled)';

        return (
          <div key={step} className="flex items-center gap-0.5">
            {/* Dot */}
            <div
              className="rounded-full shrink-0 transition-all duration-300"
              style={{
                width: isCurrent ? 7 : 5,
                height: isCurrent ? 7 : 5,
                backgroundColor: color,
                opacity: isCompleted ? 1 : 0.3,
              }}
            />
            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className="h-0.5 w-3 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: i < activeIndex ? color : 'var(--fnb-text-disabled)',
                  opacity: i < activeIndex ? 0.6 : 0.2,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Elapsed Time ───────────────────────────────────────────────

function useElapsed(timestamp: string | null | undefined): string | null {
  const [elapsed, setElapsed] = useState<string | null>(null);

  useEffect(() => {
    if (!timestamp) { setElapsed(null); return; }

    function compute() {
      const diffMs = Date.now() - new Date(timestamp!).getTime();
      if (diffMs < 0) return null;
      const mins = Math.floor(diffMs / 60_000);
      if (mins < 1) return '<1m';
      if (mins < 60) return `${mins}m`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }

    setElapsed(compute());
    const interval = setInterval(() => setElapsed(compute()), 30_000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return elapsed;
}

function getLatestTimestamp(status: string, sentAt?: string | null, firedAt?: string | null, servedAt?: string | null): string | null {
  switch (status) {
    case 'served': return servedAt ?? null;
    case 'fired':
    case 'cooking':
    case 'ready': return firedAt ?? null;
    case 'sent': return sentAt ?? null;
    default: return null;
  }
}

const STATUS_LABELS: Record<string, string> = {
  unsent: 'Unsent',
  sent: 'Sent',
  held: 'Held',
  fired: 'Fired',
  cooking: 'Cooking',
  ready: 'Ready',
  served: 'Served',
};

// ── Main Component ─────────────────────────────────────────────

export function CourseSection({
  courseNumber,
  courseName,
  courseStatus,
  sentAt,
  firedAt,
  servedAt,
  itemCount,
  previousCourseServed,
  children,
  onHold,
  onFire,
  onSend,
}: CourseSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const latestTs = getLatestTimestamp(courseStatus, sentAt, firedAt, servedAt);
  const elapsed = useElapsed(latestTs);
  const showFirePulse = previousCourseServed && courseStatus === 'sent';

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
          C{courseNumber} {courseName}
        </span>

        {/* Status timeline */}
        <StatusTimeline status={courseStatus} />

        {/* Elapsed time */}
        {elapsed && (
          <span className="text-[9px] font-medium" style={{ color: 'var(--fnb-text-muted)' }}>
            {elapsed}
          </span>
        )}

        {/* Item count when collapsed */}
        {collapsed && itemCount != null && itemCount > 0 && (
          <span
            className="rounded-full px-1.5 text-[9px] font-bold"
            style={{ backgroundColor: 'rgba(148, 163, 184, 0.15)', color: 'var(--fnb-text-muted)' }}
          >
            {itemCount}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status label */}
        <span className="text-[9px] font-medium uppercase" style={{ color: 'var(--fnb-text-muted)' }}>
          {STATUS_LABELS[courseStatus] ?? courseStatus}
        </span>

        {/* Inline action buttons */}
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
            className={`rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-opacity hover:opacity-80 inline-flex items-center gap-1 ${showFirePulse ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: 'var(--fnb-action-fire)', color: '#fff' }}
          >
            <Flame className="h-3 w-3" />
            Fire
          </span>
        )}
        {(courseStatus === 'unsent' || courseStatus === 'sent' || courseStatus === 'held') && onHold && (
          <span
            onClick={(e) => { e.stopPropagation(); onHold(); }}
            className="rounded px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-opacity hover:opacity-80 inline-flex items-center gap-1"
            style={{ backgroundColor: 'var(--fnb-bg-surface)', color: 'var(--fnb-text-muted)' }}
          >
            <Pause className="h-3 w-3" />
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
