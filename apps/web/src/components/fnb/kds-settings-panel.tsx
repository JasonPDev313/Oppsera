'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Monitor, Route, Keyboard, Bell, Target, Clock,
  Plus, ChevronDown, ChevronRight, Settings2, Pencil,
  Volume2, VolumeX, AlertTriangle, CheckCircle2,
  Trash2, Power,
} from 'lucide-react';
import {
  KDS_VIEW_MODES, KDS_VIEW_MODE_LABELS, KDS_VIEW_MODE_DESCRIPTIONS,
  SCREEN_COMM_MODES, SCREEN_COMM_MODE_LABELS, SCREEN_COMM_MODE_DETAILS,
  KDS_THEMES, KDS_INPUT_MODES,
  KDS_ROUTING_RULE_TYPES,
  DEFAULT_10_BUTTON_LAYOUT,
} from '@oppsera/shared';
import type { KdsViewMode, ScreenCommMode } from '@oppsera/shared';
import {
  useBumpBarProfiles, useAlertProfiles,
  usePerformanceTargets, useItemPrepTimes,
  useRoutingRules,
} from '@/hooks/use-kds-settings';
import { useFnbSettings } from '@/hooks/use-fnb-settings';
import { useStationManagement } from '@/hooks/use-fnb-kitchen';

// ── Label helpers for plain string arrays ──────────────────────

const INPUT_MODE_LABELS: Record<string, string> = {
  touch: 'Touch',
  bump_bar: 'Bump Bar',
  both: 'Touch + Bump Bar',
};

const THEME_LABELS: Record<string, string> = {
  dark: 'Dark',
  light: 'Light',
};

const STATION_TYPE_LABELS: Record<string, string> = {
  prep: 'Prep',
  expo: 'Expo',
  bar: 'Bar',
  dessert: 'Dessert',
  salad: 'Salad',
  grill: 'Grill',
  fry: 'Fry',
  pizza: 'Pizza',
  custom: 'Custom',
};

const ROUTING_RULE_TYPE_LABELS: Record<string, string> = {
  item: 'Item',
  modifier: 'Modifier',
  department: 'Department',
  sub_department: 'Sub-Department',
  category: 'Category',
};

const ALERT_TONE_LABELS: Record<string, string> = {
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
const BUMP_ACTION_LABELS: Record<string, string> = {
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
const COLOR_STYLES = {
  indigo: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-500' },
  amber:  { bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-500' },
  red:    { bg: 'bg-red-500/10',     border: 'border-red-500/30',    text: 'text-red-500' },
  orange: { bg: 'bg-orange-500/10',  border: 'border-orange-500/30', text: 'text-orange-500' },
  pink:   { bg: 'bg-pink-500/10',    border: 'border-pink-500/30',   text: 'text-pink-500' },
  blue:   { bg: 'bg-blue-500/10',    border: 'border-blue-500/30',   text: 'text-blue-500' },
  green:  { bg: 'bg-green-500/10',   border: 'border-green-500/30',  text: 'text-green-500' },
} as const;

// ── Main Panel ─────────────────────────────────────────────────

interface KdsSettingsPanelProps {
  locationId?: string;
}

type KdsSubTab = 'stations' | 'routing' | 'bump-bars' | 'alerts' | 'performance' | 'prep-times';

const SUB_TABS: { key: KdsSubTab; label: string; icon: typeof Monitor }[] = [
  { key: 'stations', label: 'Stations', icon: Monitor },
  { key: 'routing', label: 'Routing', icon: Route },
  { key: 'bump-bars', label: 'Bump Bars', icon: Keyboard },
  { key: 'alerts', label: 'Alerts', icon: Bell },
  { key: 'performance', label: 'Performance', icon: Target },
  { key: 'prep-times', label: 'Prep Times', icon: Clock },
];

export function KdsSettingsPanel({ locationId }: KdsSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<KdsSubTab>('stations');

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === key
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'stations' && <StationsTab locationId={locationId} />}
      {activeTab === 'routing' && <RoutingTab locationId={locationId} />}
      {activeTab === 'bump-bars' && <BumpBarsTab locationId={locationId} />}
      {activeTab === 'alerts' && <AlertsTab locationId={locationId} />}
      {activeTab === 'performance' && <PerformanceTab locationId={locationId} />}
      {activeTab === 'prep-times' && <PrepTimesTab locationId={locationId} />}
    </div>
  );
}

// ── Screen Communication Mode Detail Card ─────────────────────

function ScreenCommModeDetailCard({ mode }: { mode: ScreenCommMode }) {
  const detail = SCREEN_COMM_MODE_DETAILS[mode];
  if (!detail) return null;

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-400">{detail.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              {mode}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{detail.summary}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded-md hover:bg-indigo-500/10"
        >
          {expanded ? 'Less' : 'Learn more'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 pt-1 border-t border-indigo-500/10">
          {/* Full description */}
          <div className="space-y-1.5">
            {detail.description.split('\n\n').map((p, i) => (
              <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{p}</p>
            ))}
          </div>

          {/* Bump behavior */}
          <div>
            <h5 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1">When a cook bumps</h5>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{detail.bumpBehavior}</p>
          </div>

          {/* Best for */}
          <div>
            <h5 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1">Best for</h5>
            <ul className="space-y-0.5">
              {detail.bestFor.map((item, i) => (
                <li key={i} className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                  <span className="text-green-500 mt-0.5 shrink-0">&#x2713;</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Considerations */}
          <div>
            <h5 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1">Things to know</h5>
            <ul className="space-y-0.5">
              {detail.considerations.map((item, i) => (
                <li key={i} className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Not to be confused with */}
          {detail.notToBeConfusedWith && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-2">
              <p className="text-[11px] text-amber-400 leading-relaxed">
                <span className="font-semibold">Don&apos;t confuse with: </span>
                {detail.notToBeConfusedWith}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stations Tab ───────────────────────────────────────────────

function StationsTab({ locationId }: { locationId?: string }) {
  const { stations, isLoading, isActing, createStation, updateStation, deactivateStation } = useStationManagement({ locationId });
  const { settings: kitchenSettings, updateSettings } = useFnbSettings({ moduleKey: 'fnb_kitchen', locationId });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingStation, setEditingStation] = useState<typeof stations[number] | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);

  const handleCreate = useCallback(async (input: {
    name: string;
    displayName: string;
    stationType?: string;
    color?: string;
    warningThresholdSeconds?: number;
    criticalThresholdSeconds?: number;
  }) => {
    await createStation(input);
    setShowCreateDialog(false);
  }, [createStation]);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading stations...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">KDS Stations</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Configure kitchen display stations and their behavior</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={isActing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Station
        </button>
      </div>

      {showCreateDialog && (
        <CreateStationDialog
          onSubmit={handleCreate}
          onClose={() => setShowCreateDialog(false)}
          isActing={isActing}
        />
      )}

      {/* Global KDS settings */}
      <div className="bg-surface border border-border rounded-lg p-3 space-y-3">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Global KDS Settings</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Default View Mode</span>
            <select
              className="w-full bg-surface border border-input rounded-md px-2 py-1.5 text-xs text-foreground"
              value={(kitchenSettings?.kds_default_view_mode as string) ?? 'ticket'}
              onChange={(e) => updateSettings({ ...kitchenSettings, kds_default_view_mode: e.target.value })}
            >
              {KDS_VIEW_MODES.map((m) => (
                <option key={m} value={m}>{KDS_VIEW_MODE_LABELS[m as KdsViewMode] ?? m}</option>
              ))}
            </select>
          </label>
          <div className="space-y-1 col-span-2 md:col-span-1">
            <span className="text-xs text-muted-foreground">Screen Communication</span>
            <div className="space-y-1.5">
              {SCREEN_COMM_MODES.map((m) => {
                const isSelected = ((kitchenSettings?.default_screen_comm_mode as string) ?? 'independent') === m;
                const detail = SCREEN_COMM_MODE_DETAILS[m as ScreenCommMode];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateSettings({ ...kitchenSettings, default_screen_comm_mode: m })}
                    className={`w-full text-left px-2.5 py-2 rounded-md border transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40'
                        : 'border-border bg-surface hover:border-indigo-500/30 hover:bg-indigo-500/5'
                    }`}
                  >
                    <span className={`text-xs ${isSelected ? 'font-bold text-indigo-400' : 'font-medium text-foreground'}`}>
                      {SCREEN_COMM_MODE_LABELS[m as ScreenCommMode] ?? m}
                    </span>
                    {detail && (
                      <p className={`text-[10px] mt-0.5 leading-snug ${isSelected ? 'text-indigo-400/80' : 'text-muted-foreground'}`}>
                        {detail.summary}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Default Theme</span>
            <select
              className="w-full bg-surface border border-input rounded-md px-2 py-1.5 text-xs text-foreground"
              value={(kitchenSettings?.kds_default_theme as string) ?? 'dark'}
              onChange={(e) => updateSettings({ ...kitchenSettings, kds_default_theme: e.target.value })}
            >
              {KDS_THEMES.map((m) => (
                <option key={m} value={m}>{THEME_LABELS[m] ?? m}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Input Mode</span>
            <select
              className="w-full bg-surface border border-input rounded-md px-2 py-1.5 text-xs text-foreground"
              value={(kitchenSettings?.kds_default_input_mode as string) ?? 'touch'}
              onChange={(e) => updateSettings({ ...kitchenSettings, kds_default_input_mode: e.target.value })}
            >
              {KDS_INPUT_MODES.map((m) => (
                <option key={m} value={m}>{INPUT_MODE_LABELS[m] ?? m}</option>
              ))}
            </select>
          </label>
        </div>

        {/* View mode description */}
        {(() => {
          const vm = (kitchenSettings?.kds_default_view_mode as KdsViewMode) ?? 'ticket';
          const desc = KDS_VIEW_MODE_DESCRIPTIONS[vm];
          return desc ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">{desc}</p>
          ) : null;
        })()}

        {/* Screen communication mode detail card */}
        <ScreenCommModeDetailCard mode={(kitchenSettings?.default_screen_comm_mode as ScreenCommMode) ?? 'independent'} />
      </div>

      {/* Station list */}
      {stations.length === 0 ? (
        <div className="py-8 text-center">
          <Monitor className="h-8 w-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No KDS stations configured</p>
          <p className="text-xs text-muted-foreground mt-1">Add a station to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {stations.map((station) => (
            <div key={station.id} className="bg-surface border border-border rounded-lg p-3 flex items-center gap-3">
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: station.color || '#6366f1' }}
              >
                {(station.displayName || station.name).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{station.displayName || station.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/30">
                    {STATION_TYPE_LABELS[station.stationType] ?? station.stationType}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-muted-foreground">
                    Warning: {station.warningThresholdSeconds}s
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Critical: {station.criticalThresholdSeconds}s
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingStation(station)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit Station"
                >
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeactivate(station.id)}
                  className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                  title="Deactivate Station"
                >
                  <Power className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingStation && (
        <EditStationDialog
          station={editingStation}
          onSubmit={async (input) => {
            await updateStation(editingStation.id, input);
            setEditingStation(null);
          }}
          onClose={() => setEditingStation(null)}
          isActing={isActing}
        />
      )}

      {confirmDeactivate && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setConfirmDeactivate(null)}
        >
          <div
            className="bg-surface border border-border rounded-lg w-full max-w-sm mx-4 shadow-xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-foreground">Deactivate Station?</h3>
            <p className="text-xs text-muted-foreground">
              This station will be hidden from the KDS. Existing tickets routed to it will remain visible until bumped.
              You can reactivate it later by editing the station.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeactivate(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isActing}
                onClick={async () => {
                  await deactivateStation(confirmDeactivate);
                  setConfirmDeactivate(null);
                }}
                className="px-4 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isActing ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Create Station Dialog ─────────────────────────────────────

const STATION_COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

function CreateStationDialog({
  onSubmit,
  onClose,
  isActing,
}: {
  onSubmit: (input: {
    name: string;
    displayName: string;
    stationType?: string;
    color?: string;
    warningThresholdSeconds?: number;
    criticalThresholdSeconds?: number;
  }) => Promise<void>;
  onClose: () => void;
  isActing: boolean;
}) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [stationType, setStationType] = useState('prep');
  const [color, setColor] = useState('#6366f1');
  const [warningSeconds, setWarningSeconds] = useState(480);
  const [criticalSeconds, setCriticalSeconds] = useState(720);
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    await onSubmit({
      name: trimmedName,
      displayName: displayName.trim() || trimmedName,
      stationType,
      color,
      warningThresholdSeconds: warningSeconds,
      criticalThresholdSeconds: criticalSeconds,
    });
  }, [name, displayName, stationType, color, warningSeconds, criticalSeconds, onSubmit]);

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Add KDS Station</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Station Name <span className="text-red-500">*</span></span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grill, Cold Line, Expo"
              maxLength={50}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Display Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Defaults to station name"
              maxLength={100}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Station Type</span>
              <select
                value={stationType}
                onChange={(e) => setStationType(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                {Object.entries(STATION_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>

            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">Color</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {STATION_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-md border-2 transition-all ${
                      color === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Warning (seconds)</span>
              <input
                type="number"
                value={warningSeconds}
                onChange={(e) => setWarningSeconds(Number(e.target.value) || 0)}
                min={0}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              />
              <span className="text-[10px] text-muted-foreground">{formatSeconds(warningSeconds)}</span>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Critical (seconds)</span>
              <input
                type="number"
                value={criticalSeconds}
                onChange={(e) => setCriticalSeconds(Number(e.target.value) || 0)}
                min={0}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              />
              <span className="text-[10px] text-muted-foreground">{formatSeconds(criticalSeconds)}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || isActing}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isActing ? 'Creating...' : 'Create Station'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Edit Station Dialog ───────────────────────────────────────

function EditStationDialog({
  station,
  onSubmit,
  onClose,
  isActing,
}: {
  station: { id: string; name: string; displayName: string; stationType: string; color: string | null; warningThresholdSeconds: number; criticalThresholdSeconds: number; isActive?: boolean };
  onSubmit: (input: {
    displayName?: string;
    stationType?: string;
    color?: string | null;
    warningThresholdSeconds?: number;
    criticalThresholdSeconds?: number;
    isActive?: boolean;
  }) => Promise<void>;
  onClose: () => void;
  isActing: boolean;
}) {
  const [displayName, setDisplayName] = useState(station.displayName || station.name);
  const [stationType, setStationType] = useState(station.stationType);
  const [color, setColor] = useState(station.color || '#6366f1');
  const [warningSeconds, setWarningSeconds] = useState(station.warningThresholdSeconds);
  const [criticalSeconds, setCriticalSeconds] = useState(station.criticalThresholdSeconds);
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(async () => {
    await onSubmit({
      displayName: displayName.trim(),
      stationType,
      color,
      warningThresholdSeconds: warningSeconds,
      criticalThresholdSeconds: criticalSeconds,
    });
  }, [displayName, stationType, color, warningSeconds, criticalSeconds, onSubmit]);

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-lg w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Edit Station: {station.name}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Display Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={100}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Station Type</span>
              <select
                value={stationType}
                onChange={(e) => setStationType(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                {Object.entries(STATION_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>

            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">Color</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {STATION_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-md border-2 transition-all ${
                      color === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Warning (seconds)</span>
              <input
                type="number"
                value={warningSeconds}
                onChange={(e) => setWarningSeconds(Number(e.target.value) || 0)}
                min={0}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              />
              <span className="text-[10px] text-muted-foreground">{formatSeconds(warningSeconds)}</span>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Critical (seconds)</span>
              <input
                type="number"
                value={criticalSeconds}
                onChange={(e) => setCriticalSeconds(Number(e.target.value) || 0)}
                min={0}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              />
              <span className="text-[10px] text-muted-foreground">{formatSeconds(criticalSeconds)}</span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isActing}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isActing ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Routing Tab ────────────────────────────────────────────────

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine-In',
  takeout: 'Takeout',
  delivery: 'Delivery',
  bar: 'Bar',
};

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'POS',
  online: 'Online',
  kiosk: 'Kiosk',
  third_party: '3rd Party',
};

function RoutingTab({ locationId }: { locationId?: string }) {
  const {
    rules, isLoading, isActing,
    filterRuleType, setFilterRuleType,
    filterStationId, setFilterStationId,
    createRule, updateRule, deleteRule,
  } = useRoutingRules(locationId);
  const { stations } = useStationManagement({ locationId });
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<typeof rules[number] | null>(null);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading routing rules...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Item Routing Rules</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Route items to stations by category, sub-department, or individual item.
            Priority cascade: Item &rarr; Category &rarr; Sub-Department &rarr; Department &rarr; Modifier &rarr; Fallback.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDialog(true)}
          disabled={isActing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Rule
        </button>
      </div>

      {/* Routing priority explanation */}
      <div className="bg-surface border border-border rounded-lg p-3">
        <h4 className="text-xs font-semibold text-foreground mb-2">Routing Priority Cascade</h4>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
          {['Item-specific', 'Category', 'Sub-Department', 'Department', 'Modifier keyword', 'Fallback (expo/first station)'].map((level, i) => (
            <span key={level} className="flex items-center gap-1">
              <span className="font-mono bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded">{i + 1}</span>
              {level}
              {i < 5 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterRuleType(null)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
              !filterRuleType ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            All Types
          </button>
          {KDS_ROUTING_RULE_TYPES.map((rt) => (
            <button
              key={rt}
              type="button"
              onClick={() => setFilterRuleType(filterRuleType === rt ? null : rt)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
                filterRuleType === rt ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500' : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {ROUTING_RULE_TYPE_LABELS[rt] ?? rt}
            </button>
          ))}
        </div>

        {stations.length > 0 && (
          <select
            value={filterStationId ?? ''}
            onChange={(e) => setFilterStationId(e.target.value || null)}
            className="bg-surface border border-input rounded-md px-2 py-1 text-[10px] text-foreground"
          >
            <option value="">All Stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.displayName || s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Rules table */}
      {rules.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground text-xs">
          <Route className="h-6 w-6 mx-auto mb-2" aria-hidden="true" />
          {filterRuleType || filterStationId
            ? 'No routing rules match the current filters.'
            : 'No routing rules configured. Items will route to the first available station.'}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Name / Target</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Type</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Station</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">Priority</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Conditions</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">Active</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors">
                  <td className="px-3 py-2 text-foreground">
                    {rule.ruleName || <span className="text-muted-foreground italic">Unnamed</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/30">
                      {ROUTING_RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-foreground">{rule.stationName ?? rule.stationId}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-mono text-[10px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded">
                      {rule.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {rule.orderTypeCondition && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-500">
                          {ORDER_TYPE_LABELS[rule.orderTypeCondition] ?? rule.orderTypeCondition}
                        </span>
                      )}
                      {rule.channelCondition && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500">
                          {CHANNEL_LABELS[rule.channelCondition] ?? rule.channelCondition}
                        </span>
                      )}
                      {rule.timeConditionStart && rule.timeConditionEnd && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-green-500/10 text-green-500">
                          {rule.timeConditionStart}–{rule.timeConditionEnd}
                        </span>
                      )}
                      {!rule.orderTypeCondition && !rule.channelCondition && !rule.timeConditionStart && (
                        <span className="text-[9px] text-muted-foreground">None</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block h-2 w-2 rounded-full ${rule.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingRule(rule)}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                        title="Edit rule"
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRule(rule.id)}
                        disabled={isActing}
                        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                        title="Deactivate rule"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateDialog && (
        <CreateRoutingRuleDialog
          stations={stations}
          onSubmit={async (input) => {
            await createRule(input);
            setShowCreateDialog(false);
          }}
          onClose={() => setShowCreateDialog(false)}
          isActing={isActing}
        />
      )}

      {editingRule && (
        <EditRoutingRuleDialog
          rule={editingRule}
          stations={stations}
          onSubmit={async (input) => {
            await updateRule(editingRule.id, input);
            setEditingRule(null);
          }}
          onClose={() => setEditingRule(null)}
          isActing={isActing}
        />
      )}
    </div>
  );
}

// ── Create Routing Rule Dialog ────────────────────────────────

function CreateRoutingRuleDialog({
  stations,
  onSubmit,
  onClose,
  isActing,
}: {
  stations: Array<{ id: string; name: string; displayName: string }>;
  onSubmit: (input: {
    ruleName?: string;
    ruleType: string;
    catalogItemId?: string;
    modifierId?: string;
    departmentId?: string;
    subDepartmentId?: string;
    categoryId?: string;
    stationId: string;
    priority?: number;
    orderTypeCondition?: string;
    channelCondition?: string;
    timeConditionStart?: string;
    timeConditionEnd?: string;
    clientRequestId: string;
  }) => Promise<void>;
  onClose: () => void;
  isActing: boolean;
}) {
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState('department');
  const [targetId, setTargetId] = useState('');
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [priority, setPriority] = useState(0);
  const [orderType, setOrderType] = useState('');
  const [channel, setChannel] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const backdropRef = useRef<HTMLDivElement>(null);

  const targetLabel = ruleType === 'item' ? 'Catalog Item ID'
    : ruleType === 'modifier' ? 'Modifier ID'
    : ruleType === 'category' ? 'Category ID'
    : ruleType === 'sub_department' ? 'Sub-Department ID'
    : 'Department ID';

  const targetKey = ruleType === 'item' ? 'catalogItemId'
    : ruleType === 'modifier' ? 'modifierId'
    : ruleType === 'category' ? 'categoryId'
    : ruleType === 'sub_department' ? 'subDepartmentId'
    : 'departmentId';

  const handleSubmit = useCallback(async () => {
    if (!stationId) return;
    const input: Record<string, unknown> = {
      ruleType,
      stationId,
      priority,
      clientRequestId: `create-rr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
    if (ruleName.trim()) input.ruleName = ruleName.trim();
    if (targetId.trim()) input[targetKey] = targetId.trim();
    if (orderType) input.orderTypeCondition = orderType;
    if (channel) input.channelCondition = channel;
    if (timeStart && timeEnd) {
      input.timeConditionStart = timeStart;
      input.timeConditionEnd = timeEnd;
    }
    await onSubmit(input as any);
  }, [ruleName, ruleType, targetId, targetKey, stationId, priority, orderType, channel, timeStart, timeEnd, onSubmit]);

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-lg w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Add Routing Rule</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Rule Name</span>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. All Grilled Items to Grill 1"
              maxLength={100}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Rule Type <span className="text-red-500">*</span></span>
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                {Object.entries(ROUTING_RULE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Target Station <span className="text-red-500">*</span></span>
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName || s.name}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">{targetLabel}</span>
            <input
              type="text"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={`Enter ${targetLabel.toLowerCase()}`}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Priority (0-100, higher = evaluated first)</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
              min={0}
              max={100}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
            />
          </label>

          <div className="border-t border-border pt-3">
            <h4 className="text-xs font-semibold text-foreground mb-3">Optional Conditions</h4>
            <div className="grid grid-cols-2 gap-4">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Order Type</span>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Any</option>
                  {Object.entries(ORDER_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Channel</span>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Any</option>
                  {Object.entries(CHANNEL_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Time Window Start</span>
                <input
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">Time Window End</span>
                <input
                  type="time"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!stationId || isActing}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isActing ? 'Creating...' : 'Create Rule'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Edit Routing Rule Dialog ──────────────────────────────────

function EditRoutingRuleDialog({
  rule,
  stations,
  onSubmit,
  onClose,
  isActing,
}: {
  rule: { id: string; ruleName: string | null; stationId: string; priority: number; orderTypeCondition: string | null; channelCondition: string | null; timeConditionStart: string | null; timeConditionEnd: string | null; isActive: boolean };
  stations: Array<{ id: string; name: string; displayName: string }>;
  onSubmit: (input: {
    ruleName?: string;
    stationId?: string;
    priority?: number;
    orderTypeCondition?: string | null;
    channelCondition?: string | null;
    timeConditionStart?: string | null;
    timeConditionEnd?: string | null;
    isActive?: boolean;
    clientRequestId?: string;
  }) => Promise<void>;
  onClose: () => void;
  isActing: boolean;
}) {
  const [ruleName, setRuleName] = useState(rule.ruleName ?? '');
  const [stationId, setStationId] = useState(rule.stationId);
  const [priority, setPriority] = useState(rule.priority);
  const [orderType, setOrderType] = useState(rule.orderTypeCondition ?? '');
  const [channel, setChannel] = useState(rule.channelCondition ?? '');
  const [timeStart, setTimeStart] = useState(rule.timeConditionStart ?? '');
  const [timeEnd, setTimeEnd] = useState(rule.timeConditionEnd ?? '');
  const [isActive, setIsActive] = useState(rule.isActive);
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(async () => {
    await onSubmit({
      ruleName: ruleName.trim() || undefined,
      stationId,
      priority,
      orderTypeCondition: orderType || null,
      channelCondition: channel || null,
      timeConditionStart: timeStart || null,
      timeConditionEnd: timeEnd || null,
      isActive,
      clientRequestId: `update-rr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }, [ruleName, stationId, priority, orderType, channel, timeStart, timeEnd, isActive, onSubmit]);

  return createPortal(
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-surface border border-border rounded-lg w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Edit Routing Rule</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Rule Name</span>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              maxLength={100}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Target Station</span>
              <select
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName || s.name}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Priority</span>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 0)}
                min={0}
                max={100}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Order Type</span>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="">Any</option>
                {Object.entries(ORDER_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Channel</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="">Any</option>
                {Object.entries(CHANNEL_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Time Start</span>
              <input
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Time End</span>
              <input
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-input text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-medium text-foreground">Active</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isActing}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isActing ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Bump Bars Tab ──────────────────────────────────────────────

function BumpBarsTab({ locationId }: { locationId?: string }) {
  const { profiles, isLoading, isActing, createProfile } = useBumpBarProfiles(locationId);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);

  const handleCreateProfile = useCallback(() => {
    // Build a simple keyMap from the default 10-button layout
    const keyMap: Record<string, string> = {};
    for (const mapping of DEFAULT_10_BUTTON_LAYOUT) {
      keyMap[String(mapping.buttonIndex)] = mapping.action;
    }
    createProfile({
      profileName: `Profile ${profiles.length + 1}`,
      buttonCount: 10,
      keyMap,
      isDefault: profiles.length === 0,
      clientRequestId: `create-bbp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }, [createProfile, profiles.length]);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading bump bar profiles...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Bump Bar Profiles</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure physical bump bar button layouts. Supports 10-button and 20-button configurations.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateProfile}
          disabled={isActing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Profile
        </button>
      </div>

      {/* Profiles list */}
      {profiles.length === 0 ? (
        <div className="py-8 text-center">
          <Keyboard className="h-8 w-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No bump bar profiles</p>
          <p className="text-xs text-muted-foreground mt-1">Create a profile to configure physical bump bar buttons</p>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <BumpBarProfileCard
              key={profile.id}
              profile={profile}
              isExpanded={selectedProfile === profile.id}
              onToggle={() => setSelectedProfile(selectedProfile === profile.id ? null : profile.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BumpBarProfileCard({
  profile,
  isExpanded,
  onToggle,
}: {
  profile: { id: string; profileName: string; buttonCount: number; keyMap: Record<string, string>; isDefault: boolean };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">{profile.profileName}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500">
            {profile.buttonCount}-button
          </span>
          {profile.isDefault && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/30">
              Default
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
          aria-label={isExpanded ? 'Collapse profile details' : 'Expand profile details'}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border">
          <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Button Layout</h5>
          <div className={`grid gap-1.5 ${profile.buttonCount === 20 ? 'grid-cols-4 sm:grid-cols-5 md:grid-cols-10' : 'grid-cols-5'}`}>
            {Object.entries(profile.keyMap || {}).map(([pos, action]) => (
              <div
                key={pos}
                className="bg-surface border border-border rounded px-2 py-1.5 text-center"
              >
                <div className="text-[9px] text-muted-foreground font-mono">B{pos}</div>
                <div className="text-[10px] text-foreground font-medium truncate mt-0.5">
                  {BUMP_ACTION_LABELS[action] ?? action}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Alerts Tab ─────────────────────────────────────────────────

const ALERT_TYPES = [
  { key: 'newTicketAlert', label: 'New Ticket', icon: Plus, color: 'indigo' },
  { key: 'warningAlert', label: 'Warning', icon: AlertTriangle, color: 'amber' },
  { key: 'criticalAlert', label: 'Critical', icon: AlertTriangle, color: 'red' },
  { key: 'rushAlert', label: 'Rush Order', icon: Clock, color: 'orange' },
  { key: 'allergyAlert', label: 'Allergy', icon: AlertTriangle, color: 'pink' },
  { key: 'modificationAlert', label: 'Modification', icon: Pencil, color: 'blue' },
  { key: 'completeAlert', label: 'Complete', icon: CheckCircle2, color: 'green' },
] as const;

function AlertsTab({ locationId }: { locationId?: string }) {
  const { profiles, isLoading, isActing, createProfile } = useAlertProfiles(locationId);

  const handleCreateProfile = useCallback(() => {
    createProfile({
      profileName: `Alert Profile ${profiles.length + 1}`,
      newTicketAlert: { enabled: true, tone: 'chime', volume: 70 },
      warningAlert: { enabled: true, tone: 'warning', volume: 80 },
      criticalAlert: { enabled: true, tone: 'urgent', volume: 100 },
      isDefault: profiles.length === 0,
      clientRequestId: `create-ap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }, [createProfile, profiles.length]);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading alert profiles...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Alert Profiles</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure audio alerts for KDS events. Uses Web Audio API — no external files needed.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateProfile}
          disabled={isActing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Profile
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="py-8 text-center">
          <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No alert profiles</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <AlertProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}

interface AlertProfileData {
  id: string;
  profileName: string;
  isDefault: boolean;
  newTicketAlert: { enabled: boolean; tone: string; volume: number } | null;
  warningAlert: { enabled: boolean; tone: string; volume: number } | null;
  criticalAlert: { enabled: boolean; tone: string; volume: number } | null;
  rushAlert: { enabled: boolean; tone: string; volume: number } | null;
  allergyAlert: { enabled: boolean; tone: string; volume: number } | null;
  modificationAlert: { enabled: boolean; tone: string; volume: number } | null;
  completeAlert: { enabled: boolean; tone: string; volume: number } | null;
}

function AlertProfileCard({
  profile,
}: {
  profile: AlertProfileData;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">{profile.profileName}</span>
          {profile.isDefault && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/30">
              Default
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {ALERT_TYPES.map(({ key, label, color }) => {
          const alertData = profile[key as keyof AlertProfileData] as { enabled: boolean; tone: string; volume: number } | null | undefined;
          const isEnabled = alertData?.enabled ?? false;

          // Static color lookup — Tailwind cannot resolve template-literal class names.
          const colorStyles = COLOR_STYLES[color] ?? COLOR_STYLES.indigo;

          return (
            <div
              key={key}
              className={`rounded-md border p-2 ${
                isEnabled
                  ? `${colorStyles.bg} ${colorStyles.border}`
                  : 'bg-surface border-border opacity-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-foreground">{label}</span>
                {isEnabled ? (
                  <Volume2 className={`h-3 w-3 ${colorStyles.text}`} aria-hidden="true" />
                ) : (
                  <VolumeX className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              {isEnabled && alertData && (
                <div className="text-[9px] text-muted-foreground">
                  {ALERT_TONE_LABELS[alertData.tone] ?? alertData.tone} &middot; {alertData.volume}%
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Performance Tab ────────────────────────────────────────────

function PerformanceTab({ locationId }: { locationId?: string }) {
  const { targets, isLoading, isActing, upsertTarget } = usePerformanceTargets(locationId);

  const handleAddTarget = useCallback(() => {
    upsertTarget({
      targetPrepSeconds: 300,
      warningPrepSeconds: 480,
      criticalPrepSeconds: 720,
      speedOfServiceGoalSeconds: 600,
      clientRequestId: `create-pt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  }, [upsertTarget]);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading performance targets...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Performance Targets</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set speed-of-service goals per station and order type. Used for timer color thresholds and reporting.
          </p>
        </div>
        <button
          type="button"
          onClick={handleAddTarget}
          disabled={isActing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Target
        </button>
      </div>

      {targets.length === 0 ? (
        <div className="py-8 text-center">
          <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No performance targets</p>
          <p className="text-xs text-muted-foreground mt-1">Add targets to set speed-of-service goals</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Station</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Order Type</th>
                <th className="text-center px-3 py-2 text-green-500 font-medium">Target</th>
                <th className="text-center px-3 py-2 text-amber-500 font-medium">Warning</th>
                <th className="text-center px-3 py-2 text-red-500 font-medium">Critical</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">SOS Goal</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors">
                  <td className="px-3 py-2 text-foreground">{target.stationName ?? 'All Stations'}</td>
                  <td className="px-3 py-2 text-foreground">{target.orderType ?? 'All Types'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {formatSeconds(target.targetPrepSeconds)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {formatSeconds(target.warningPrepSeconds)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {formatSeconds(target.criticalPrepSeconds)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground font-mono">
                    {target.speedOfServiceGoalSeconds != null
                      ? formatSeconds(target.speedOfServiceGoalSeconds)
                      : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Prep Times Tab ─────────────────────────────────────────────

function PrepTimesTab({ locationId }: { locationId?: string }) {
  const { items, isLoading, isActing, upsertPrepTime } = useItemPrepTimes();
  const { stations } = useStationManagement({ locationId });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<typeof items[number] | null>(null);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground text-sm">Loading prep times...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Item Prep Times</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estimated preparation time per item, optionally per station. Used for meal pacing and order time estimates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Prep Time
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center">
          <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No item prep times configured</p>
          <p className="text-xs text-muted-foreground mt-1">Add prep times to enable meal pacing and time estimates</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Item</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium">Station</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium">Prep Time</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors">
                  <td className="px-3 py-2 text-foreground">{item.catalogItemName ?? item.catalogItemId}</td>
                  <td className="px-3 py-2 text-foreground">{item.stationName ?? 'All Stations'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded text-[10px] font-mono">
                      {formatSeconds(item.estimatedPrepSeconds)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Edit prep time"
                    >
                      <Pencil className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddDialog && (
        <AddPrepTimeDialog
          stations={stations.filter((s) => s.isActive)}
          onSave={async (input) => {
            await upsertPrepTime({
              catalogItemId: input.catalogItemId,
              stationId: input.stationId || undefined,
              estimatedPrepSeconds: input.estimatedPrepSeconds,
              clientRequestId: `prep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            });
            setShowAddDialog(false);
          }}
          onClose={() => setShowAddDialog(false)}
          isActing={isActing}
        />
      )}

      {editingItem && (
        <EditPrepTimeDialog
          item={editingItem}
          stations={stations.filter((s) => s.isActive)}
          onSave={async (input) => {
            await upsertPrepTime({
              catalogItemId: input.catalogItemId,
              stationId: input.stationId || undefined,
              estimatedPrepSeconds: input.estimatedPrepSeconds,
              clientRequestId: `prep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            });
            setEditingItem(null);
          }}
          onClose={() => setEditingItem(null)}
          isActing={isActing}
        />
      )}
    </div>
  );
}

// ── Add Prep Time Dialog ─────────────────────────────────────────

function AddPrepTimeDialog({
  stations,
  onSave,
  onClose,
  isActing,
}: {
  stations: { id: string; displayName: string }[];
  onSave: (input: { catalogItemId: string; stationId: string; estimatedPrepSeconds: number }) => Promise<void>;
  onClose: () => void;
  isActing: boolean;
}) {
  const [catalogItemId, setCatalogItemId] = useState('');
  const [stationId, setStationId] = useState('');
  const [prepMinutes, setPrepMinutes] = useState(5);

  const handleSubmit = () => {
    if (!catalogItemId.trim()) return;
    void onSave({
      catalogItemId: catalogItemId.trim(),
      stationId,
      estimatedPrepSeconds: prepMinutes * 60,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Add Item Prep Time</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Catalog Item ID *</label>
            <input
              type="text"
              value={catalogItemId}
              onChange={(e) => setCatalogItemId(e.target.value)}
              placeholder="Enter catalog item ID"
              className="w-full px-3 py-1.5 text-xs bg-surface border border-input rounded-md text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">The ULID of the catalog item</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Station (optional)</label>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-surface border border-input rounded-md text-foreground"
            >
              <option value="">All Stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.displayName}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-0.5">Leave empty for a global default</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Prep Time (minutes)</label>
            <input
              type="number"
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(Math.max(1, Number(e.target.value)))}
              min={1}
              max={120}
              className="w-full px-3 py-1.5 text-xs bg-surface border border-input rounded-md text-foreground"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isActing || !catalogItemId.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isActing ? 'Saving...' : 'Add Prep Time'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Edit Prep Time Dialog ────────────────────────────────────────

function EditPrepTimeDialog({
  item,
  stations,
  onSave,
  onClose,
  isActing,
}: {
  item: { id: string; catalogItemId: string; catalogItemName: string | null; stationId: string | null; estimatedPrepSeconds: number };
  stations: { id: string; displayName: string }[];
  onSave: (input: { catalogItemId: string; stationId: string; estimatedPrepSeconds: number }) => Promise<void>;
  onClose: () => void;
  isActing: boolean;
}) {
  const [stationId, setStationId] = useState(item.stationId ?? '');
  const [prepMinutes, setPrepMinutes] = useState(Math.ceil(item.estimatedPrepSeconds / 60));

  const handleSubmit = () => {
    void onSave({
      catalogItemId: item.catalogItemId,
      stationId,
      estimatedPrepSeconds: prepMinutes * 60,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Edit Prep Time</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Item</label>
            <div className="px-3 py-1.5 text-xs bg-surface border border-input rounded-md text-foreground opacity-75">
              {item.catalogItemName ?? item.catalogItemId}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Station</label>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-surface border border-input rounded-md text-foreground"
            >
              <option value="">All Stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.displayName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Prep Time (minutes)</label>
            <input
              type="number"
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(Math.max(1, Number(e.target.value)))}
              min={1}
              max={120}
              className="w-full px-3 py-1.5 text-xs bg-surface border border-input rounded-md text-foreground"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isActing}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {isActing ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Helpers ────────────────────────────────────────────────────

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
