'use client';

import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  Star,
  AlertTriangle,
  Info,
  Cake,
  Heart,
  Briefcase,
  Users,
  Calendar,
  Clock,
} from 'lucide-react';
import { usePreShiftReportFull } from '@/hooks/use-host-analytics';

interface PreShiftReportFullProps {
  open: boolean;
  onClose: () => void;
  locationId: string;
  date: string;
  mealPeriod: string;
  mealPeriodLabel: string;
}

const OCCASION_LABELS: Record<string, { label: string; icon: typeof Cake; color: string }> = {
  birthday: { label: 'Birthday', icon: Cake, color: '#f472b6' },
  anniversary: { label: 'Anniversary', icon: Heart, color: '#ef4444' },
  business: { label: 'Business', icon: Briefcase, color: '#3b82f6' },
  date_night: { label: 'Date Night', icon: Heart, color: '#a855f7' },
  celebration: { label: 'Celebration', icon: Cake, color: '#eab308' },
};

export function PreShiftReportFull({
  open,
  onClose,
  locationId,
  date,
  mealPeriod,
  mealPeriodLabel,
}: PreShiftReportFullProps) {
  const { data, isLoading } = usePreShiftReportFull(locationId, date, mealPeriod);

  if (!open) return null;

  // Build alerts from reservation data
  const alerts: Array<{ severity: 'high' | 'medium' | 'info'; message: string }> = [];
  if (data) {
    for (const res of data.reservations) {
      if (res.partySize >= 8) {
        alerts.push({ severity: 'high', message: `Large party (${res.partySize}) — ${res.guestName} at ${res.reservationTime}. May need combined tables.` });
      }
      if (res.specialRequests?.toLowerCase().includes('allerg')) {
        alerts.push({ severity: 'high', message: `Allergy alert — ${res.guestName}: "${res.specialRequests}"` });
      }
      if (res.occasion) {
        const level = (res.occasion === 'birthday' || res.occasion === 'anniversary') ? 'medium' : 'info';
        alerts.push({ severity: level, message: `${OCCASION_LABELS[res.occasion]?.label ?? res.occasion} — ${res.guestName} (party of ${res.partySize})` });
      }
      if (res.isVip) {
        alerts.push({ severity: 'medium', message: `VIP arriving — ${res.guestName} at ${res.reservationTime}` });
      }
      if (res.seatingPreference) {
        alerts.push({ severity: 'info', message: `Seating preference: ${res.seatingPreference} — ${res.guestName}` });
      }
    }
  }

  // Sort: high first, then medium, then info
  const severityOrder: Record<string, number> = { high: 0, medium: 1, info: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  const vipReservations = data?.reservations.filter((r) => r.isVip) ?? [];

  const content = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl shadow-xl m-4"
        style={{ backgroundColor: 'var(--fnb-bg-surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 sticky top-0 z-10"
          style={{ backgroundColor: 'var(--fnb-bg-surface)', borderBottom: 'var(--fnb-border-subtle)' }}
        >
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
              Pre-Shift Report
            </h2>
            <p className="text-xs" style={{ color: 'var(--fnb-text-muted)' }}>
              {date} · {mealPeriodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--fnb-bg-elevated)',
                color: 'var(--fnb-text-secondary)',
              }}
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center h-8 w-8 rounded-lg transition-colors"
              style={{ color: 'var(--fnb-text-muted)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-6 w-6 rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--fnb-info)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {data && !isLoading && (
          <div className="p-6 space-y-6 print:p-0 print:space-y-4">
            {/* Summary Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Calendar size={16} />} label="Reservations" value={data.totalReservations} />
              <StatCard icon={<Users size={16} />} label="Expected Covers" value={data.totalCovers} />
              <StatCard icon={<Star size={16} />} label="VIP Guests" value={data.vipCount} color="#f59e0b" />
              <StatCard icon={<Users size={16} />} label="Large Parties" value={data.largePartyCount} color="var(--fnb-warning)" />
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--fnb-text-muted)' }}>
                  Alerts & Notes
                </h3>
                <div className="space-y-1.5">
                  {alerts.map((alert, i) => (
                    <AlertRow key={i} severity={alert.severity} message={alert.message} />
                  ))}
                </div>
              </section>
            )}

            {/* VIP Arrivals */}
            {vipReservations.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--fnb-text-muted)' }}>
                  VIP Arrivals
                </h3>
                <div className="space-y-2">
                  {vipReservations.map((res) => (
                    <div
                      key={res.id}
                      className="rounded-lg p-3 flex items-start gap-3"
                      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
                    >
                      <span className="flex items-center justify-center h-8 w-8 rounded-full shrink-0" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)' }}>
                        <Star size={14} fill="#f59e0b" style={{ color: '#f59e0b' }} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--fnb-text-primary)' }}>
                            {res.guestName}
                          </span>
                          <span className="text-[10px] font-bold tabular-nums" style={{ color: '#f59e0b' }}>VIP</span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[11px]" style={{ color: 'var(--fnb-text-muted)' }}>
                            <Clock size={10} className="inline mr-0.5" />{res.reservationTime}
                          </span>
                          <span className="text-[11px]" style={{ color: 'var(--fnb-text-muted)' }}>
                            <Users size={10} className="inline mr-0.5" />Party of {res.partySize}
                          </span>
                          {res.seatingPreference && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa' }}>
                              {res.seatingPreference}
                            </span>
                          )}
                        </div>
                        {res.specialRequests && (
                          <p className="text-[11px] mt-1" style={{ color: 'var(--fnb-text-secondary)' }}>
                            {res.specialRequests}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full Reservation List */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--fnb-text-muted)' }}>
                All Reservations ({data.totalReservations})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: 'var(--fnb-border-subtle)' }}>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--fnb-text-muted)' }}>Time</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--fnb-text-muted)' }}>Guest</th>
                      <th className="text-center py-2 px-2 font-semibold" style={{ color: 'var(--fnb-text-muted)' }}>Party</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--fnb-text-muted)' }}>Status</th>
                      <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--fnb-text-muted)' }}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reservations.map((res) => (
                      <tr key={res.id} style={{ borderBottom: 'var(--fnb-border-subtle)' }}>
                        <td className="py-2 px-2 tabular-nums font-medium" style={{ color: 'var(--fnb-text-primary)' }}>
                          {res.reservationTime}
                        </td>
                        <td className="py-2 px-2">
                          <span className="font-medium" style={{ color: 'var(--fnb-text-primary)' }}>{res.guestName}</span>
                          {res.isVip && (
                            <Star size={10} fill="#f59e0b" className="inline ml-1" style={{ color: '#f59e0b' }} />
                          )}
                        </td>
                        <td className="py-2 px-2 text-center tabular-nums" style={{ color: 'var(--fnb-text-secondary)' }}>
                          {res.partySize}
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: getStatusBg(res.status),
                              color: getStatusColor(res.status),
                            }}
                          >
                            {res.status}
                          </span>
                        </td>
                        <td className="py-2 px-2 max-w-[200px] truncate" style={{ color: 'var(--fnb-text-muted)' }}>
                          {[
                            res.occasion && (OCCASION_LABELS[res.occasion]?.label ?? res.occasion),
                            res.seatingPreference,
                            res.specialRequests,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(.print-report) { display: none !important; }
          .print-report { position: static !important; }
        }
      `}</style>
    </div>
  );

  return createPortal(content, document.body);
}

// ── Helpers ─────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <div
      className="rounded-lg p-3 flex items-center gap-3"
      style={{ backgroundColor: 'var(--fnb-bg-elevated)' }}
    >
      <span style={{ color: color || 'var(--fnb-info)' }}>{icon}</span>
      <div>
        <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--fnb-text-primary)' }}>{value}</p>
        <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--fnb-text-muted)' }}>{label}</p>
      </div>
    </div>
  );
}

function AlertRow({ severity, message }: { severity: 'high' | 'medium' | 'info'; message: string }) {
  const config = {
    high: { bg: 'rgba(239, 68, 68, 0.1)', color: 'var(--fnb-danger)', icon: <AlertTriangle size={13} /> },
    medium: { bg: 'rgba(234, 179, 8, 0.1)', color: 'var(--fnb-warning)', icon: <AlertTriangle size={13} /> },
    info: { bg: 'rgba(59, 130, 246, 0.1)', color: 'var(--fnb-info)', icon: <Info size={13} /> },
  };
  const c = config[severity];
  return (
    <div className="flex items-start gap-2 rounded-md p-2" style={{ backgroundColor: c.bg }}>
      <span className="shrink-0 mt-0.5" style={{ color: c.color }}>{c.icon}</span>
      <span className="text-[11px]" style={{ color: c.color }}>{message}</span>
    </div>
  );
}

function getStatusBg(status: string): string {
  switch (status) {
    case 'confirmed': return 'rgba(59, 130, 246, 0.12)';
    case 'checked_in': return 'rgba(34, 197, 94, 0.12)';
    case 'seated': case 'completed': return 'rgba(34, 197, 94, 0.12)';
    case 'no_show': return 'rgba(234, 179, 8, 0.12)';
    case 'canceled': return 'rgba(239, 68, 68, 0.12)';
    default: return 'var(--fnb-bg-elevated)';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'confirmed': return 'var(--fnb-info)';
    case 'checked_in': case 'seated': case 'completed': return 'var(--fnb-success)';
    case 'no_show': return 'var(--fnb-warning)';
    case 'canceled': return 'var(--fnb-danger)';
    default: return 'var(--fnb-text-muted)';
  }
}
