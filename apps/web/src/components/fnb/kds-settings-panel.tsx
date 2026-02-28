'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Monitor, Route, Keyboard, Bell, Target, Clock,
  Plus, ChevronDown, ChevronRight, Settings2, Pencil,
  Volume2, VolumeX, AlertTriangle, CheckCircle2,
  Trash2, Power, X as XIcon, Wand2, Check,
} from 'lucide-react';
import {
  KDS_VIEW_MODES, KDS_VIEW_MODE_LABELS, KDS_VIEW_MODE_DETAILS,
  SCREEN_COMM_MODES, SCREEN_COMM_MODE_LABELS, SCREEN_COMM_MODE_DETAILS,
  KDS_THEMES, KDS_THEME_LABELS, KDS_THEME_DETAILS, KDS_INPUT_MODES,
  KDS_ROUTING_RULE_TYPES,
  DEFAULT_10_BUTTON_LAYOUT,
  DEFAULT_20_BUTTON_LAYOUT,
} from '@oppsera/shared';
import type { KdsViewMode, KdsTheme, ScreenCommMode } from '@oppsera/shared';
import {
  useBumpBarProfiles, useAlertProfiles,
  usePerformanceTargets, useItemPrepTimes,
  useRoutingRules,
} from '@/hooks/use-kds-settings';
import { useFnbSettings } from '@/hooks/use-fnb-settings';
import { useStationManagement } from '@/hooks/use-fnb-kitchen';
import { useAllCategories, useDepartments, useSubDepartments, useCategories } from '@/hooks/use-catalog';
import { apiFetch } from '@/lib/api-client';
import {
  recommendRoutingForDepartments,
  findBestStation,
} from '@/lib/kds-routing-recommender';
import type { DepartmentForRecommendation, StationRecommendation } from '@/lib/kds-routing-recommender';

// ── Label helpers for plain string arrays ──────────────────────

const INPUT_MODE_LABELS: Record<string, string> = {
  touch: 'Touch',
  bump_bar: 'Bump Bar',
  both: 'Touch + Bump Bar',
};

// Theme labels now imported from @oppsera/shared as KDS_THEME_LABELS

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

// ── View Mode Detail Card ──────────────────────────────────────

function ViewModeDetailCard({ mode }: { mode: KdsViewMode }) {
  const detail = KDS_VIEW_MODE_DETAILS[mode];
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
          <div className="space-y-1.5">
            {detail.description.split('\n\n').map((p, i) => (
              <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{p}</p>
            ))}
          </div>

          <div>
            <h5 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1">Display behavior</h5>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{detail.displayBehavior}</p>
          </div>

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
        </div>
      )}
    </div>
  );
}

// ── Theme Detail Card ──────────────────────────────────────────

function ThemeDetailCard({ theme }: { theme: KdsTheme }) {
  const detail = KDS_THEME_DETAILS[theme];
  if (!detail) return null;

  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-400">{detail.label}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
              {theme}
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
          <div className="space-y-1.5">
            {detail.description.split('\n\n').map((p, i) => (
              <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">{p}</p>
            ))}
          </div>

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Default View Mode — card selector */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Default View Mode</span>
            <div className="space-y-1.5">
              {KDS_VIEW_MODES.map((m) => {
                const isSelected = ((kitchenSettings?.kds_default_view_mode as string) ?? 'ticket') === m;
                const detail = KDS_VIEW_MODE_DETAILS[m as KdsViewMode];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateSettings({ ...kitchenSettings, kds_default_view_mode: m })}
                    className={`w-full text-left px-2.5 py-2 rounded-md border transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40'
                        : 'border-border bg-surface hover:border-indigo-500/30 hover:bg-indigo-500/5'
                    }`}
                  >
                    <span className={`text-xs ${isSelected ? 'font-bold text-indigo-400' : 'font-medium text-foreground'}`}>
                      {KDS_VIEW_MODE_LABELS[m as KdsViewMode] ?? m}
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

          {/* Screen Communication — card selector */}
          <div className="space-y-1">
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

          {/* Default Theme + Input Mode column */}
          <div className="space-y-3">
            {/* Default Theme — card selector */}
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Default Theme</span>
              <div className="space-y-1.5">
                {KDS_THEMES.map((m) => {
                  const isSelected = ((kitchenSettings?.kds_default_theme as string) ?? 'dark') === m;
                  const detail = KDS_THEME_DETAILS[m as KdsTheme];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateSettings({ ...kitchenSettings, kds_default_theme: m })}
                      className={`w-full text-left px-2.5 py-2 rounded-md border transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40'
                          : 'border-border bg-surface hover:border-indigo-500/30 hover:bg-indigo-500/5'
                      }`}
                    >
                      <span className={`text-xs ${isSelected ? 'font-bold text-indigo-400' : 'font-medium text-foreground'}`}>
                        {KDS_THEME_LABELS[m as KdsTheme] ?? m}
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

            {/* Input Mode — stays as dropdown (only 2 basic options) */}
            <label className="space-y-1 block">
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
        </div>

        {/* View mode detail card */}
        <ViewModeDetailCard mode={(kitchenSettings?.kds_default_view_mode as KdsViewMode) ?? 'ticket'} />

        {/* Screen communication mode detail card */}
        <ScreenCommModeDetailCard mode={(kitchenSettings?.default_screen_comm_mode as ScreenCommMode) ?? 'independent'} />

        {/* Theme detail card */}
        <ThemeDetailCard theme={(kitchenSettings?.kds_default_theme as KdsTheme) ?? 'dark'} />
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
  const [error, setError] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        displayName: displayName.trim() || trimmedName,
        stationType,
        color,
        warningThresholdSeconds: warningSeconds,
        criticalThresholdSeconds: criticalSeconds,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create station';
      setError(msg);
    }
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
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {error && (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
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
            <XIcon className="h-4 w-4" />
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
  const [showRecommendations, setShowRecommendations] = useState(false);

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRecommendations(!showRecommendations)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              showRecommendations
                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                : 'border border-border text-muted-foreground hover:text-foreground hover:bg-accent'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Smart Routing
          </button>
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
      </div>

      {/* Smart Routing Recommendations */}
      {showRecommendations && (
        <RoutingRecommendationPanel
          stations={stations}
          existingRules={rules}
          onCreateRule={createRule}
          isActing={isActing}
        />
      )}

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
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-foreground">
                        {rule.ruleName
                          || rule.departmentName
                          || rule.subDepartmentName
                          || rule.categoryName
                          || rule.catalogItemName
                          || rule.modifierId
                          || <span className="text-muted-foreground italic">Unnamed</span>}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/30 w-fit">
                        {ROUTING_RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType}
                      </span>
                    </div>
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

// ── Smart Routing Recommendation Panel ────────────────────────

const CONFIDENCE_STYLES = {
  high: { bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/30', label: 'High' },
  medium: { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/30', label: 'Medium' },
  low: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/30', label: 'Low' },
} as const;

interface RecommendationRow {
  /** The catalog category ID (department or sub-department) */
  categoryId: string;
  categoryName: string;
  parentDeptName?: string;
  ruleType: 'department' | 'sub_department';
  recommendedStationType: string;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
  /** Resolved station from the available station list */
  resolvedStation: { id: string; name: string } | null;
  /** User has overridden the station selection */
  overrideStationId?: string;
  /** User has accepted or dismissed this recommendation */
  status: 'pending' | 'accepted' | 'dismissed';
}

function RoutingRecommendationPanel({
  stations,
  existingRules,
  onCreateRule,
  isActing,
}: {
  stations: Array<{ id: string; name: string; displayName: string; stationType: string; isActive: boolean }>;
  existingRules: Array<{ departmentId: string | null; subDepartmentId: string | null; ruleType: string }>;
  onCreateRule: (input: {
    ruleName?: string;
    ruleType: string;
    departmentId?: string;
    subDepartmentId?: string;
    stationId: string;
    priority?: number;
    clientRequestId: string;
  }) => Promise<void>;
  isActing: boolean;
}) {
  const { data: allCategories, isLoading: catLoading } = useAllCategories();
  const [rows, setRows] = useState<RecommendationRow[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);

  // Build department hierarchy from flat categories
  const departments = useCallback((): DepartmentForRecommendation[] => {
    if (!allCategories) return [];
    const topLevel = allCategories.filter((c) => c.parentId === null);
    return topLevel.map((dept) => {
      const children = allCategories
        .filter((c) => c.parentId === dept.id)
        .map((sub) => ({ id: sub.id, name: sub.name, itemCount: sub.itemCount }));
      return {
        id: dept.id,
        name: dept.name,
        children: children.length > 0 ? children : undefined,
        itemCount: dept.itemCount,
      };
    });
  }, [allCategories]);

  const generateRecommendations = useCallback(() => {
    const depts = departments();
    if (depts.length === 0) return;

    const recommendations = recommendRoutingForDepartments(depts);

    // Flatten into rows, filtering out departments that already have rules
    const existingDeptIds = new Set(
      existingRules
        .filter((r) => r.ruleType === 'department' && r.departmentId)
        .map((r) => r.departmentId!),
    );
    const existingSubDeptIds = new Set(
      existingRules
        .filter((r) => r.ruleType === 'sub_department' && r.subDepartmentId)
        .map((r) => r.subDepartmentId!),
    );

    const newRows: RecommendationRow[] = [];
    for (const rec of recommendations) {
      if (rec.subDepartmentRecommendations && rec.subDepartmentRecommendations.length > 0) {
        // If department has sub-departments, recommend at sub-department level
        for (const subRec of rec.subDepartmentRecommendations) {
          if (existingSubDeptIds.has(subRec.id)) continue;
          const resolved = findBestStation(subRec.recommendedStationType, stations);
          newRows.push({
            categoryId: subRec.id,
            categoryName: subRec.name,
            parentDeptName: rec.departmentName,
            ruleType: 'sub_department',
            recommendedStationType: subRec.recommendedStationType,
            confidence: subRec.confidence,
            matchedKeywords: subRec.matchedKeywords,
            resolvedStation: resolved,
            status: 'pending',
          });
        }
      } else {
        // No sub-departments — recommend at department level
        if (existingDeptIds.has(rec.departmentId)) continue;
        const resolved = findBestStation(rec.recommendedStationType, stations);
        newRows.push({
          categoryId: rec.departmentId,
          categoryName: rec.departmentName,
          ruleType: 'department',
          recommendedStationType: rec.recommendedStationType,
          confidence: rec.confidence,
          matchedKeywords: rec.matchedKeywords,
          resolvedStation: resolved,
          status: 'pending',
        });
      }
    }

    setRows(newRows);
    setHasGenerated(true);
    setAppliedCount(0);
  }, [departments, stations, existingRules]);

  const handleOverrideStation = useCallback((categoryId: string, stationId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.categoryId === categoryId ? { ...r, overrideStationId: stationId } : r,
      ),
    );
  }, []);

  const handleDismiss = useCallback((categoryId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.categoryId === categoryId ? { ...r, status: 'dismissed' as const } : r,
      ),
    );
  }, []);

  const handleAcceptSingle = useCallback(async (row: RecommendationRow) => {
    const stationId = row.overrideStationId || row.resolvedStation?.id;
    if (!stationId) return;

    const input: Parameters<typeof onCreateRule>[0] = {
      ruleName: row.parentDeptName
        ? `${row.parentDeptName} → ${row.categoryName}`
        : row.categoryName,
      ruleType: row.ruleType,
      stationId,
      priority: 50,
      clientRequestId: `smart-route-${row.categoryId}-${Date.now()}`,
    };
    if (row.ruleType === 'department') {
      (input as Record<string, unknown>).departmentId = row.categoryId;
    } else {
      (input as Record<string, unknown>).subDepartmentId = row.categoryId;
    }

    await onCreateRule(input);
    setRows((prev) =>
      prev.map((r) =>
        r.categoryId === row.categoryId ? { ...r, status: 'accepted' as const } : r,
      ),
    );
    setAppliedCount((c) => c + 1);
  }, [onCreateRule]);

  const handleAcceptAll = useCallback(async () => {
    const pending = rows.filter(
      (r) => r.status === 'pending' && (r.overrideStationId || r.resolvedStation),
    );
    if (pending.length === 0) return;

    setIsApplying(true);
    let applied = 0;
    for (const row of pending) {
      try {
        await handleAcceptSingle(row);
        applied++;
      } catch {
        // continue with next
      }
    }
    setIsApplying(false);
    setAppliedCount((c) => c + applied);
  }, [rows, handleAcceptSingle]);

  const pendingRows = rows.filter((r) => r.status === 'pending');
  const acceptedRows = rows.filter((r) => r.status === 'accepted');

  if (catLoading) {
    return (
      <div className="bg-surface border border-amber-500/30 rounded-lg p-4">
        <div className="text-sm text-muted-foreground text-center">Loading catalog departments...</div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-amber-500/30 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <div>
            <h4 className="text-sm font-semibold text-foreground">Smart Routing Recommendations</h4>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Analyzes your menu departments and suggests which KDS station each should route to.
            </p>
          </div>
        </div>
        {!hasGenerated ? (
          <button
            type="button"
            onClick={generateRecommendations}
            disabled={!allCategories || allCategories.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/30 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Generate Recommendations
          </button>
        ) : pendingRows.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {pendingRows.length} pending
            </span>
            <button
              type="button"
              onClick={handleAcceptAll}
              disabled={isActing || isApplying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              {isApplying ? 'Applying...' : `Accept All (${pendingRows.length})`}
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-green-500 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {appliedCount > 0 ? `${appliedCount} rules created` : 'All processed'}
          </span>
        )}
      </div>

      {hasGenerated && rows.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          All departments already have routing rules configured. Nothing to recommend.
        </div>
      )}

      {hasGenerated && rows.length > 0 && (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <RecommendationRowItem
              key={row.categoryId}
              row={row}
              stations={stations}
              onOverrideStation={handleOverrideStation}
              onAccept={() => handleAcceptSingle(row)}
              onDismiss={() => handleDismiss(row.categoryId)}
              isActing={isActing || isApplying}
            />
          ))}
        </div>
      )}

      {acceptedRows.length > 0 && pendingRows.length === 0 && rows.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-green-500/5">
          <p className="text-xs text-green-500 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {acceptedRows.length} routing rule{acceptedRows.length !== 1 ? 's' : ''} created from recommendations.
          </p>
        </div>
      )}
    </div>
  );
}

function RecommendationRowItem({
  row,
  stations,
  onOverrideStation,
  onAccept,
  onDismiss,
  isActing,
}: {
  row: RecommendationRow;
  stations: Array<{ id: string; name: string; displayName: string; stationType: string; isActive: boolean }>;
  onOverrideStation: (categoryId: string, stationId: string) => void;
  onAccept: () => Promise<void>;
  onDismiss: () => void;
  isActing: boolean;
}) {
  const confStyle = CONFIDENCE_STYLES[row.confidence];
  const currentStationId = row.overrideStationId || row.resolvedStation?.id || '';
  const currentStationName = row.overrideStationId
    ? stations.find((s) => s.id === row.overrideStationId)?.displayName
      || stations.find((s) => s.id === row.overrideStationId)?.name
      || '?'
    : row.resolvedStation?.name || 'No matching station';

  if (row.status === 'accepted') {
    return (
      <div className="px-4 py-2.5 flex items-center gap-3 bg-green-500/5">
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground">
            {row.parentDeptName ? `${row.parentDeptName} → ` : ''}
            <span className="text-foreground font-medium">{row.categoryName}</span>
            {' → '}
            <span className="text-green-500">{currentStationName}</span>
          </span>
        </div>
        <span className="text-[10px] text-green-500">Created</span>
      </div>
    );
  }

  if (row.status === 'dismissed') {
    return (
      <div className="px-4 py-2.5 flex items-center gap-3 opacity-50">
        <XIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground line-through">
            {row.parentDeptName ? `${row.parentDeptName} → ` : ''}
            {row.categoryName}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">Skipped</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      {/* Department info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground truncate">
            {row.parentDeptName && (
              <span className="text-muted-foreground font-normal">{row.parentDeptName} → </span>
            )}
            {row.categoryName}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${confStyle.bg} ${confStyle.text} ${confStyle.border}`}>
            {confStyle.label}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/30">
            {STATION_TYPE_LABELS[row.recommendedStationType] ?? row.recommendedStationType}
          </span>
        </div>
        {row.matchedKeywords.length > 0 && (
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-muted-foreground">Matched:</span>
            {row.matchedKeywords.slice(0, 5).map((kw) => (
              <span key={kw} className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-500">
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Station selector */}
      <select
        value={currentStationId}
        onChange={(e) => onOverrideStation(row.categoryId, e.target.value)}
        className="bg-surface border border-input rounded-md px-2 py-1 text-[11px] text-foreground w-36 shrink-0"
      >
        {stations.filter((s) => s.isActive).map((s) => (
          <option key={s.id} value={s.id}>{s.displayName || s.name}</option>
        ))}
      </select>

      {/* Accept / Dismiss */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onAccept}
          disabled={!currentStationId || isActing}
          className="p-1.5 rounded-md bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors disabled:opacity-50"
          title="Accept recommendation"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
          title="Dismiss"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Target Selector Component (multi-select checkboxes) ──────

function TargetSelector({
  ruleType,
  selectedIds,
  onToggle,
}: {
  ruleType: string;
  selectedIds: Set<string>;
  onToggle: (id: string, name: string) => void;
}) {
  const { data: departments, isLoading: deptLoading } = useDepartments();
  const [parentDeptId, setParentDeptId] = useState<string>('');
  const { data: subDepts } = useSubDepartments(parentDeptId || undefined);
  const [parentSubDeptId, setParentSubDeptId] = useState<string>('');
  const { data: categories } = useCategories(parentSubDeptId || undefined);

  // Reset cascading selections when rule type changes
  useEffect(() => {
    setParentDeptId('');
    setParentSubDeptId('');
  }, [ruleType]);

  if (ruleType === 'item' || ruleType === 'modifier') {
    return null; // handled separately as text input
  }

  if (deptLoading) {
    return <div className="text-xs text-muted-foreground py-2">Loading catalog...</div>;
  }

  if (ruleType === 'department') {
    return (
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">
          Select Departments <span className="text-red-500">*</span>
        </span>
        <div className="border border-border rounded-md max-h-48 overflow-y-auto">
          {departments.length === 0 ? (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">No departments found in catalog</div>
          ) : (
            departments.map((dept) => (
              <label
                key={dept.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors border-b border-border last:border-0"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(dept.id)}
                  onChange={() => onToggle(dept.id, dept.name)}
                  className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-foreground">{dept.name}</span>
              </label>
            ))
          )}
        </div>
      </div>
    );
  }

  if (ruleType === 'sub_department') {
    return (
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground">Department</span>
          <select
            value={parentDeptId}
            onChange={(e) => { setParentDeptId(e.target.value); setParentSubDeptId(''); }}
            className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
          >
            <option value="">Select a department...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        {parentDeptId && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              Select Sub-Departments <span className="text-red-500">*</span>
            </span>
            <div className="border border-border rounded-md max-h-48 overflow-y-auto">
              {subDepts.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No sub-departments under this department</div>
              ) : (
                subDepts.map((sd) => (
                  <label
                    key={sd.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors border-b border-border last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(sd.id)}
                      onChange={() => onToggle(sd.id, sd.name)}
                      className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-foreground">{sd.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (ruleType === 'category') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Department</span>
            <select
              value={parentDeptId}
              onChange={(e) => { setParentDeptId(e.target.value); setParentSubDeptId(''); }}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
            >
              <option value="">Select...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Sub-Department</span>
            <select
              value={parentSubDeptId}
              onChange={(e) => setParentSubDeptId(e.target.value)}
              className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground"
              disabled={!parentDeptId}
            >
              <option value="">Select...</option>
              {subDepts.map((sd) => (
                <option key={sd.id} value={sd.id}>{sd.name}</option>
              ))}
            </select>
          </label>
        </div>
        {parentSubDeptId && (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-foreground">
              Select Categories <span className="text-red-500">*</span>
            </span>
            <div className="border border-border rounded-md max-h-48 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No categories under this sub-department</div>
              ) : (
                categories.map((cat) => (
                  <label
                    key={cat.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer transition-colors border-b border-border last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(cat.id)}
                      onChange={() => onToggle(cat.id, cat.name)}
                      className="rounded border-input text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-foreground">{cat.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
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
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [priority, setPriority] = useState(0);
  const [orderType, setOrderType] = useState('');
  const [channel, setChannel] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Multi-select state for department/sub_department/category
  const [selectedTargets, setSelectedTargets] = useState<Map<string, string>>(new Map()); // id → name
  // Text input for item/modifier types
  const [targetId, setTargetId] = useState('');

  const usesMultiSelect = ruleType === 'department' || ruleType === 'sub_department' || ruleType === 'category';

  const targetKey = ruleType === 'item' ? 'catalogItemId'
    : ruleType === 'modifier' ? 'modifierId'
    : ruleType === 'category' ? 'categoryId'
    : ruleType === 'sub_department' ? 'subDepartmentId'
    : 'departmentId';

  // Reset selections when rule type changes
  useEffect(() => {
    setSelectedTargets(new Map());
    setTargetId('');
  }, [ruleType]);

  const handleToggleTarget = useCallback((id: string, name: string) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, name);
      }
      return next;
    });
  }, []);

  const selectedCount = usesMultiSelect ? selectedTargets.size : (targetId.trim() ? 1 : 0);

  const handleSubmit = useCallback(async () => {
    if (!stationId || selectedCount === 0) return;
    setIsSubmitting(true);
    try {
      if (usesMultiSelect) {
        // Create one rule per selected target
        const entries = Array.from(selectedTargets.entries());
        for (let i = 0; i < entries.length; i++) {
          const [id, name] = entries[i]!;
          const input: Record<string, unknown> = {
            ruleType,
            stationId,
            priority,
            ruleName: ruleName.trim() || name,
            [targetKey]: id,
            clientRequestId: `create-rr-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          };
          if (orderType) input.orderTypeCondition = orderType;
          if (channel) input.channelCondition = channel;
          if (timeStart && timeEnd) {
            input.timeConditionStart = timeStart;
            input.timeConditionEnd = timeEnd;
          }
          await onSubmit(input as any);
        }
      } else {
        // Single rule for item/modifier
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
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }, [ruleName, ruleType, targetId, targetKey, stationId, priority, orderType, channel, timeStart, timeEnd, selectedTargets, selectedCount, usesMultiSelect, onSubmit, onClose]);

  const submitLabel = isSubmitting
    ? 'Creating...'
    : usesMultiSelect && selectedCount > 1
      ? `Create ${selectedCount} Rules`
      : 'Create Rule';

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
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
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

          {/* Multi-select target picker for department/sub_department/category */}
          {usesMultiSelect ? (
            <TargetSelector
              ruleType={ruleType}
              selectedIds={new Set(selectedTargets.keys())}
              onToggle={handleToggleTarget}
            />
          ) : (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">
                {ruleType === 'item' ? 'Catalog Item ID' : 'Modifier ID'}
              </span>
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder={`Enter ${ruleType === 'item' ? 'catalog item ID' : 'modifier ID'}`}
                className="w-full bg-surface border border-input rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          )}

          {/* Selected targets summary */}
          {usesMultiSelect && selectedTargets.size > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedTargets.entries()).map(([id, name]) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/30"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => handleToggleTarget(id, name)}
                    className="hover:text-red-500 transition-colors"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Rule Name</span>
            <input
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder={usesMultiSelect ? 'Optional — defaults to target name' : 'e.g. Salmon to Grill'}
              maxLength={100}
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
            disabled={!stationId || selectedCount === 0 || isActing || isSubmitting}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {submitLabel}
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
            <XIcon className="h-4 w-4" />
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
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);

  const handleCreateProfile = useCallback((buttonCount: 10 | 20) => {
    createProfile({
      profileName: `${buttonCount}-Button Profile ${profiles.length + 1}`,
      buttonCount,
      keyMappings: buttonCount === 20 ? DEFAULT_20_BUTTON_LAYOUT : DEFAULT_10_BUTTON_LAYOUT,
      isDefault: profiles.length === 0,
      clientRequestId: `create-bbp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    setShowCreateMenu(false);
  }, [createProfile, profiles.length]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showCreateMenu) return;
    const handler = (e: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCreateMenu]);

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
        <div className="relative" ref={createMenuRef}>
          <button
            type="button"
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            disabled={isActing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Profile
            <ChevronDown className="h-3 w-3 ml-0.5" />
          </button>
          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg z-20 py-1">
              <button
                type="button"
                onClick={() => handleCreateProfile(10)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
              >
                <div className="font-medium text-foreground">10-Button Layout</div>
                <div className="text-muted-foreground mt-0.5">Standard bump bar</div>
              </button>
              <button
                type="button"
                onClick={() => handleCreateProfile(20)}
                className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
              >
                <div className="font-medium text-foreground">20-Button Layout</div>
                <div className="text-muted-foreground mt-0.5">Extended bump bar (2 rows)</div>
              </button>
            </div>
          )}
        </div>
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
  profile: { id: string; profileName: string; buttonCount: number; keyMappings: Array<{ buttonIndex: number; scanCode: number; action: string; label: string; color?: string }>; isDefault: boolean };
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
            {(profile.keyMappings || []).map((mapping) => (
              <div
                key={mapping.buttonIndex}
                className="bg-surface border border-border rounded px-2 py-1.5 text-center"
                style={mapping.color ? { borderColor: `${mapping.color}40` } : undefined}
              >
                <div className="text-[9px] text-muted-foreground font-mono">B{mapping.buttonIndex}</div>
                <div className="text-[10px] text-foreground font-medium truncate mt-0.5">
                  {mapping.label || BUMP_ACTION_LABELS[mapping.action] || mapping.action}
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
      newTicketAlert: { tone: 'chime', volume: 0.7, flash: true, repeat: 1 },
      warningAlert: { tone: 'warning', volume: 0.8, flash: true, repeat: 1 },
      criticalAlert: { tone: 'urgent', volume: 1.0, flash: true, repeat: 2 },
      rushAlert: { tone: 'rush', volume: 0.9, flash: true, repeat: 2 },
      allergyAlert: { tone: 'allergy', volume: 1.0, flash: true, flashColor: '#ff0066', repeat: 3 },
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

interface AlertEventConfigData {
  tone: string;
  volume: number;
  flash: boolean;
  flashColor?: string;
  repeat: number;
}

interface AlertProfileData {
  id: string;
  profileName: string;
  isDefault: boolean;
  newTicketAlert: AlertEventConfigData | null;
  warningAlert: AlertEventConfigData | null;
  criticalAlert: AlertEventConfigData | null;
  rushAlert: AlertEventConfigData | null;
  allergyAlert: AlertEventConfigData | null;
  modificationAlert: AlertEventConfigData | null;
  completeAlert: AlertEventConfigData | null;
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
          const alertData = profile[key as keyof AlertProfileData] as AlertEventConfigData | null | undefined;
          const isEnabled = alertData != null;

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
                  {ALERT_TONE_LABELS[alertData.tone] ?? alertData.tone} &middot; {Math.round(alertData.volume * 100)}%
                  {alertData.flash && ' · Flash'}
                  {alertData.repeat > 1 && ` · ×${alertData.repeat}`}
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

interface CatalogItemSearchResult {
  id: string;
  name: string;
  sku: string | null;
  itemType: string;
}

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
  const [selectedItem, setSelectedItem] = useState<CatalogItemSearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CatalogItemSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [stationId, setStationId] = useState('');
  const [prepMinutes, setPrepMinutes] = useState(5);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSelectedItem(null);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch<{ data: { items: CatalogItemSearchResult[] } }>(
          `/api/v1/catalog/items?search=${encodeURIComponent(query.trim())}&limit=10`,
        );
        const items = res.data?.items ?? [];
        setSearchResults(items);
        setShowDropdown(items.length > 0);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleSelectItem = useCallback((item: CatalogItemSearchResult) => {
    setSelectedItem(item);
    setSearchQuery(item.name);
    setShowDropdown(false);
  }, []);

  const handleSubmit = () => {
    if (!selectedItem) return;
    void onSave({
      catalogItemId: selectedItem.id,
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
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Search Item *</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => { if (searchResults.length > 0 && !selectedItem) setShowDropdown(true); }}
              placeholder="Type to search by name or SKU..."
              className="w-full px-3 py-1.5 text-xs bg-surface border border-input rounded-md text-foreground placeholder:text-muted-foreground"
            />
            {isSearching && (
              <div className="absolute right-2 top-7 text-[10px] text-muted-foreground">Searching...</div>
            )}
            {selectedItem && (
              <p className="text-[10px] text-green-500 mt-0.5">
                Selected: {selectedItem.name}{selectedItem.sku ? ` (${selectedItem.sku})` : ''}
              </p>
            )}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors border-b border-border last:border-0"
                  >
                    <div className="font-medium text-foreground">{item.name}</div>
                    {item.sku && <div className="text-[10px] text-muted-foreground mt-0.5">SKU: {item.sku}</div>}
                  </button>
                ))}
              </div>
            )}
            {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && !selectedItem && (
              <p className="text-[10px] text-muted-foreground mt-0.5">No items found</p>
            )}
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
            disabled={isActing || !selectedItem}
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
  item: { id: string; catalogItemId: string; catalogItemName?: string | null; stationId: string | null; stationName?: string | null; estimatedPrepSeconds: number };
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
            <XIcon className="h-4 w-4" />
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
