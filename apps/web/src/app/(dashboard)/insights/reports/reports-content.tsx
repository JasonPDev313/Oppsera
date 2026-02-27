'use client';

import Link from 'next/link';
import { ArrowLeft, CalendarClock } from 'lucide-react';
import { useScheduledReports } from '@/hooks/use-scheduled-reports';
import { ScheduledReportsPanel } from '@/components/insights/ScheduledReportsPanel';
import { ToolGuide } from '@/components/insights/ToolGuide';

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

      {/* Guide */}
      <ToolGuide
        storageKey="scheduled-reports"
        useCases={[
          'Daily sales summaries',
          'Weekly performance digests',
          'Monthly metric snapshots',
          'Automated team reporting',
        ]}
        steps={[
          { label: 'Create a schedule', detail: 'Choose a report type (digest, custom report, or metric snapshot) and set the frequency.' },
          { label: 'Set delivery', detail: 'Pick a delivery time and channel (in-app, email, or webhook). Add recipients if sharing.' },
          { label: 'Receive automatically', detail: 'Reports are generated and delivered on schedule. Pause or edit anytime.' },
        ]}
        example={'Create a daily "Sales Digest" delivered at 8 AM via email so your team starts each morning with yesterday\'s performance summary.'}
      />

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

      {/* Scheduled reports panel — always render; panel has its own empty state */}
      {!isLoading && !error && (
        <ScheduledReportsPanel
          schedules={schedules}
          onCreate={(input) => {
            createReport({
              name: input.name,
              reportType: input.reportType as 'digest' | 'custom_report' | 'metric_snapshot',
              frequency: input.frequency as 'daily' | 'weekly' | 'monthly',
              deliveryHour: input.deliveryHour,
              deliveryDayOfWeek: input.deliveryDayOfWeek ?? undefined,
              deliveryDayOfMonth: input.deliveryDayOfMonth ?? undefined,
              channel: input.channel as 'in_app' | 'email' | 'webhook',
              recipientType: input.recipients ? 'custom' : 'self',
              recipientUserIds: input.recipients
                ? input.recipients.split(',').map((s) => s.trim()).filter(Boolean)
                : undefined,
            });
          }}
          onUpdate={(id, input) => {
            updateReport(id, {
              name: input.name,
              frequency: input.frequency as 'daily' | 'weekly' | 'monthly',
              deliveryHour: input.deliveryHour,
              deliveryDayOfWeek: input.deliveryDayOfWeek ?? null,
              deliveryDayOfMonth: input.deliveryDayOfMonth ?? null,
              channel: input.channel as 'in_app' | 'email' | 'webhook',
              recipientType: input.recipients ? 'custom' : 'self',
              recipientUserIds: input.recipients
                ? input.recipients.split(',').map((s) => s.trim()).filter(Boolean)
                : null,
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
