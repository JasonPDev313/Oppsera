// ── Finance Format Helpers ──────────────────────────────────────
// Shared formatting utilities for the Financial Support Hub.
// All API responses return monetary amounts as INTEGER cents.

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '$0.00';
  return '$' + (cents / 100).toFixed(2);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function hoursOpen(startStr: string | null | undefined): string {
  if (!startStr) return '\u2014';
  const diff = Date.now() - new Date(startStr).getTime();
  const hrs = diff / (1000 * 60 * 60);
  if (hrs < 1) return `${Math.floor(hrs * 60)}m`;
  return `${hrs.toFixed(1)}h`;
}
