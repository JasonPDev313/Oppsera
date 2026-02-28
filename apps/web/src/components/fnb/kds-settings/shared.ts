// ── Shared types, constants, and helpers for KDS Settings tabs ──

// ── Types ──────────────────────────────────────────────────────

export type KdsSubTab = 'stations' | 'routing' | 'bump-bars' | 'alerts' | 'performance' | 'prep-times';

// ── Label Maps ─────────────────────────────────────────────────

export const INPUT_MODE_LABELS: Record<string, string> = {
  touch: 'Touch',
  bump_bar: 'Bump Bar',
  both: 'Touch + Bump Bar',
};

export const STATION_TYPE_LABELS: Record<string, string> = {
  prep: 'Prep',
  expo: 'Expo',
  bar: 'Bar',
  dessert: 'Dessert',
  salad: 'Salad',
  grill: 'Grill',
  fry: 'Fry',
  pizza: 'Pizza',
  custom: 'Custom',
  none: 'No KDS',
};

export const ROUTING_RULE_TYPE_LABELS: Record<string, string> = {
  item: 'Item',
  modifier: 'Modifier',
  department: 'Department',
  sub_department: 'Sub-Department',
  category: 'Category',
};

export const ALERT_TONE_LABELS: Record<string, string> = {
  chime: 'Chime',
  ding: 'Ding',
  alert: 'Alert',
  warning: 'Warning Beep',
  urgent: 'Urgent Triple',
  rush: 'Rush Double',
  allergy: 'Allergy High',
  complete: 'Complete',
  bell: 'Bell',
  none: 'None',
};

/** Map bump bar action strings to human-readable labels */
export const BUMP_ACTION_LABELS: Record<string, string> = {
  select_next: 'Next',
  select_previous: 'Prev',
  select_next_item: 'Next Item',
  select_previous_item: 'Prev Item',
  page_left: 'Page Left',
  page_right: 'Page Right',
  home: 'Home',
  end: 'End',
  bump: 'Bump',
  bump_item: 'Bump Item',
  bump_ticket: 'Bump Ticket',
  start_cooking: 'Start',
  mark_ready: 'Ready',
  recall_last: 'Recall',
  recall_item: 'Recall Item',
  review_last: 'Review',
  hold: 'Hold',
  fire: 'Fire',
  fire_all: 'Fire All',
  fire_item: 'Fire Item',
  rush: 'Rush',
  priority_up: 'Priority Up',
  priority_down: 'Priority Down',
  toggle_all_day: 'All Day',
  toggle_detail: 'Detail',
  toggle_summary: 'Summary',
  reprint: 'Reprint',
  void_item: 'Void',
  callback: 'Callback',
  no_op: 'No Op',
};

/** Static color class map for alert badges — avoids Tailwind template-literal purge issues */
export const COLOR_STYLES = {
  indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-500' },
  amber:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-500' },
  red:    { bg: 'bg-red-500/10',     border: 'border-red-500/30',    text: 'text-red-500' },
  orange: { bg: 'bg-orange-500/10',  border: 'border-orange-500/30', text: 'text-orange-500' },
  pink:   { bg: 'bg-pink-500/10',    border: 'border-pink-500/30',   text: 'text-pink-500' },
  blue:   { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',   text: 'text-blue-500' },
  green:  { bg: 'bg-green-500/10',   border: 'border-green-500/30',  text: 'text-green-500' },
} as const;

// ── Helpers ────────────────────────────────────────────────────

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
