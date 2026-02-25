'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { useScheduledReports } from '@/hooks/use-scheduled-reports';
import { ScheduledReportsPanel } from '@/components/insights/ScheduledReportsPanel';

// ── ReportsContent ────────────────────────────────────────────────

export default function ReportsContent({ embedded }: { embedded?: boolean }) {
  const {
    reports,
    createReport,
    updateReport,
    deleteReport,
    isLoading,
    error,
  } = useScheduledReports();

  // Map hook data to the shape ScheduledReportsPanel expects
  const schedules = reports.map((r) => ({
    id: r.id,
    name: r.name,
    reportType: r.reportType,
    frequency: r.frequency,
    deliveryHour: r.deliveryHour,
    channel: r.channel,
    isActive: r.isActive,
    lastDeliveredAt: r.lastDeliveredAt ?? undefined,
    nextDeliveryAt: r.nextDeliveryAt ?? undefined,
  }));

  return (
    <div className={embedded ? '' : 'max-w-4xl mx-auto'}>
      {!embedded && (
        <>
          {/* Back link */}
          <Link
            href="/insights"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </Link>

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Scheduled Reports</h1>
              <p className="text-sm text-muted-foreground">
                Automated delivery of AI-powered reports and digests
              </p>
            </div>
          </div>
        </>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && reports.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mb-4">
            <CalendarClock className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No scheduled reports</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Set up automated report delivery to receive AI-generated insights on a recurring schedule.
          </p>
        </div>
      )}

      {/* Scheduled reports panel */}
      {!isLoading && !error && schedules.length > 0 && (
        <ScheduledReportsPanel
          schedules={schedules}
          onCreate={(input) => {
            createReport({
              name: input.name,
              reportType: input.reportType as 'digest' | 'custom_report' | 'metric_snapshot',
              frequency: input.frequency as 'daily' | 'weekly' | 'monthly',
              deliveryHour: input.deliveryHour,
              channel: input.channel as 'in_app' | 'email' | 'webhook',
            });
          }}
          onUpdate={(id, input) => {
            updateReport(id, {
              name: input.name,
              frequency: input.frequency as 'daily' | 'weekly' | 'monthly',
              deliveryHour: input.deliveryHour,
              channel: input.channel as 'in_app' | 'email' | 'webhook',
            });
          }}
          onDelete={deleteReport}
          onToggle={(id, active) => {
            updateReport(id, { isActive: active });
          }}
        />
      )}
    </div>
  );
}
