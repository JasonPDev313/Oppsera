/**
 * KDS (Kitchen Display System) Constants
 *
 * Comprehensive settings, bump bar actions, view modes, alert tones,
 * and screen communication modes for the most advanced KDS on the market.
 */

// ═══════════════════════════════════════════════════════════════════
// Bump Bar Actions
// ═══════════════════════════════════════════════════════════════════

export const BUMP_BAR_ACTIONS = [
  // Navigation
  'select_next',
  'select_previous',
  'select_next_item',
  'select_previous_item',
  'page_left',
  'page_right',
  'home',
  'end',
  // Order Management
  'bump',
  'bump_item',
  'bump_ticket',
  'start_cooking',
  'mark_ready',
  // Recall & Review
  'recall_last',
  'recall_item',
  'review_last',
  // Hold & Fire
  'hold',
  'fire',
  'fire_all',
  'fire_item',
  // Priority & Rush
  'rush',
  'priority_up',
  'priority_down',
  // Display
  'toggle_all_day',
  'toggle_detail',
  'toggle_summary',
  // Misc
  'reprint',
  'void_item',
  'callback',
  'no_op',
] as const;

export type BumpBarAction = (typeof BUMP_BAR_ACTIONS)[number];

export interface BumpBarKeyMapping {
  buttonIndex: number;
  scanCode: number;
  action: BumpBarAction;
  label: string;
  color?: string;
}

/** Standard 10-button bump bar default layout */
export const DEFAULT_10_BUTTON_LAYOUT: BumpBarKeyMapping[] = [
  { buttonIndex: 0, scanCode: 49, action: 'select_previous', label: '◄ PREV', color: '#6366f1' },
  { buttonIndex: 1, scanCode: 50, action: 'select_next', label: 'NEXT ►', color: '#6366f1' },
  { buttonIndex: 2, scanCode: 51, action: 'page_left', label: 'PG ◄', color: '#64748b' },
  { buttonIndex: 3, scanCode: 52, action: 'page_right', label: 'PG ►', color: '#64748b' },
  { buttonIndex: 4, scanCode: 53, action: 'start_cooking', label: 'START', color: '#0ea5e9' },
  { buttonIndex: 5, scanCode: 54, action: 'rush', label: 'RUSH', color: '#f59e0b' },
  { buttonIndex: 6, scanCode: 55, action: 'recall_last', label: 'RECALL', color: '#a855f7' },
  { buttonIndex: 7, scanCode: 56, action: 'hold', label: 'HOLD', color: '#ef4444' },
  { buttonIndex: 8, scanCode: 57, action: 'fire', label: 'FIRE', color: '#f97316' },
  { buttonIndex: 9, scanCode: 13, action: 'bump', label: 'BUMP', color: '#22c55e' },
];

/** Extended 20-button bump bar default layout */
export const DEFAULT_20_BUTTON_LAYOUT: BumpBarKeyMapping[] = [
  // Top row (1-10)
  { buttonIndex: 0, scanCode: 49, action: 'select_previous', label: '◄ PREV', color: '#6366f1' },
  { buttonIndex: 1, scanCode: 50, action: 'select_next', label: 'NEXT ►', color: '#6366f1' },
  { buttonIndex: 2, scanCode: 51, action: 'select_previous_item', label: '▲ ITEM', color: '#818cf8' },
  { buttonIndex: 3, scanCode: 52, action: 'select_next_item', label: '▼ ITEM', color: '#818cf8' },
  { buttonIndex: 4, scanCode: 53, action: 'page_left', label: 'PG ◄', color: '#64748b' },
  { buttonIndex: 5, scanCode: 54, action: 'page_right', label: 'PG ►', color: '#64748b' },
  { buttonIndex: 6, scanCode: 55, action: 'home', label: 'HOME', color: '#64748b' },
  { buttonIndex: 7, scanCode: 56, action: 'end', label: 'END', color: '#64748b' },
  { buttonIndex: 8, scanCode: 57, action: 'toggle_all_day', label: 'ALL DAY', color: '#0284c7' },
  { buttonIndex: 9, scanCode: 48, action: 'toggle_detail', label: 'DETAIL', color: '#0284c7' },
  // Bottom row (11-20)
  { buttonIndex: 10, scanCode: 113, action: 'start_cooking', label: 'START', color: '#0ea5e9' },
  { buttonIndex: 11, scanCode: 114, action: 'rush', label: 'RUSH', color: '#f59e0b' },
  { buttonIndex: 12, scanCode: 115, action: 'priority_up', label: 'PRI ▲', color: '#eab308' },
  { buttonIndex: 13, scanCode: 116, action: 'priority_down', label: 'PRI ▼', color: '#eab308' },
  { buttonIndex: 14, scanCode: 117, action: 'hold', label: 'HOLD', color: '#ef4444' },
  { buttonIndex: 15, scanCode: 118, action: 'fire', label: 'FIRE', color: '#f97316' },
  { buttonIndex: 16, scanCode: 119, action: 'fire_all', label: 'FIRE ALL', color: '#f97316' },
  { buttonIndex: 17, scanCode: 120, action: 'recall_last', label: 'RECALL', color: '#a855f7' },
  { buttonIndex: 18, scanCode: 121, action: 'reprint', label: 'REPRINT', color: '#64748b' },
  { buttonIndex: 19, scanCode: 13, action: 'bump', label: 'BUMP', color: '#22c55e' },
];

// ═══════════════════════════════════════════════════════════════════
// View Modes
// ═══════════════════════════════════════════════════════════════════

export const KDS_VIEW_MODES = ['ticket', 'grid', 'split', 'all_day'] as const;
export type KdsViewMode = (typeof KDS_VIEW_MODES)[number];

export const KDS_VIEW_MODE_LABELS: Record<KdsViewMode, string> = {
  ticket: 'Ticket Rail',
  grid: 'Grid View',
  split: 'Split View',
  all_day: 'All Day',
};

export const KDS_VIEW_MODE_DESCRIPTIONS: Record<KdsViewMode, string> = {
  ticket: 'Classic horizontal ticket rail — scrolls left to right like a paper rail',
  grid: 'Fixed grid with configurable ticket sizes — best for large screens',
  split: 'Dual rows split by order type (e.g., dine-in top, takeout bottom)',
  all_day: 'Aggregated item totals for batch preparation planning',
};

// ═══════════════════════════════════════════════════════════════════
// Screen Communication Modes
// ═══════════════════════════════════════════════════════════════════

export const SCREEN_COMM_MODES = [
  'independent',
  'multi_clear',
  'prep_expo',
  'assembly_line',
  'mirror',
] as const;
export type ScreenCommMode = (typeof SCREEN_COMM_MODES)[number];

export const SCREEN_COMM_MODE_LABELS: Record<ScreenCommMode, string> = {
  independent: 'Independent',
  multi_clear: 'Multi-Clear',
  prep_expo: 'Prep → Expo',
  assembly_line: 'Assembly Line',
  mirror: 'Mirror',
};

export const SCREEN_COMM_MODE_DESCRIPTIONS: Record<ScreenCommMode, string> = {
  independent: 'Each station operates independently — no cross-station syncing',
  multi_clear: 'Bumping on one screen auto-bumps on all connected screens',
  prep_expo: 'Prep station bumps show as strikethrough on expo (item-level tracking)',
  assembly_line: 'Items flow sequentially through stations in defined order',
  mirror: 'Two or more screens fully synchronized — prevents duplicate prep',
};

// ── Detailed Operator-Facing Definitions ──────────────────────
// These help operators understand WHEN to use each mode, HOW it
// behaves, and what kitchen layout it's best suited for.

export interface ScreenCommModeDetail {
  /** Short label (for dropdowns) */
  label: string;
  /** One-sentence summary */
  summary: string;
  /** Multi-paragraph explanation for an operator who has never configured a KDS */
  description: string;
  /** Concrete kitchen layout examples where this mode shines */
  bestFor: string[];
  /** What happens when a cook bumps an item on their screen */
  bumpBehavior: string;
  /** Practical considerations / warnings */
  considerations: string[];
  /** Related mode the operator might confuse this with */
  notToBeConfusedWith?: string;
}

export const SCREEN_COMM_MODE_DETAILS: Record<ScreenCommMode, ScreenCommModeDetail> = {
  independent: {
    label: 'Independent',
    summary: 'Every station is its own island — bumping on one screen has zero effect on any other screen.',
    description:
      'In Independent mode, each KDS station receives its own copy of the items it is responsible for and manages them entirely on its own. ' +
      'When a cook bumps an item at the grill station, it disappears from that screen only. The expo, salad station, and every other screen are completely unaffected. ' +
      'The expo chef must independently track which items are done by watching their own screen or communicating verbally with the line.\n\n' +
      'This is the simplest mode and works well in small kitchens where one person can see the whole line, or in operations where each station prepares and plates its own dishes without a central expeditor.',
    bestFor: [
      'Small kitchens with 1-2 stations where the chef can see the whole line',
      'Food trucks or counter-service operations with no expo position',
      'Bars operating as a standalone station (drinks have no cross-station dependency)',
      'Operations where each station plates and delivers its own dishes',
    ],
    bumpBehavior: 'Item disappears from ONLY the station that bumped it. No other screen is notified.',
    considerations: [
      'The expo station has no automatic visibility into prep station progress — they must check verbally or visually',
      'There is no duplicate-prep prevention — if two stations both receive the same item, both will prepare it unless they communicate',
      'Best paired with clear verbal communication ("Ordering!", "Behind!") since the screens do not coordinate',
    ],
  },

  multi_clear: {
    label: 'Multi-Clear',
    summary: 'Bumping an order on ANY connected screen automatically clears it from ALL other screens showing that order.',
    description:
      'Multi-Clear links two or more screens so that when an order (or item) is bumped on one, it is automatically bumped on all the others. ' +
      'This is useful when the same ticket appears on multiple screens — for example, a ticket with both a burger (grill station) and a salad (cold station). ' +
      'When the LAST item on a ticket is bumped at any station, the entire ticket clears from every connected screen simultaneously.\n\n' +
      'Multi-Clear prevents the common problem of "ghost tickets" — orders that were completed and plated but still show as open on another screen because nobody remembered to bump them there. ' +
      'It keeps all screens in sync without requiring a separate expo step.',
    bestFor: [
      'Kitchens with 2-4 stations where tickets are shared across multiple screens',
      'Operations without a dedicated expo position — the system acts as a virtual expeditor',
      'Fast-casual or quick-service restaurants where speed matters more than course pacing',
      'Any setup where ghost tickets (stale orders stuck on screens) are a recurring problem',
    ],
    bumpBehavior: 'When all items for an order are bumped across any combination of stations, the entire order clears from EVERY connected screen at once.',
    considerations: [
      'All connected stations must be configured in the same communication group — a station outside the group is unaffected',
      'Works at the ORDER level, not the item level. If Station A bumps their items but Station B has not, the order remains on Station B until they bump too',
      'Does NOT guarantee items were actually prepared — it only guarantees screens stay in sync. Pair with verbal "All day!" calls for confirmation',
    ],
    notToBeConfusedWith: 'Mirror mode also syncs screens, but Mirror shows identical content on all screens. Multi-Clear shows different items per station and syncs the bump action only.',
  },

  prep_expo: {
    label: 'Prep \u2192 Expo',
    summary: 'Prep stations bump items as they finish; the expo screen shows each item\'s status with strikethrough so the expeditor knows what\'s ready.',
    description:
      'Prep-to-Expo creates a two-tier relationship between preparation stations and a central expo (expeditor) screen. ' +
      'Each prep station (grill, fry, salad, etc.) sees only the items routed to it. When a cook finishes an item and bumps it, the item is NOT removed from the expo screen — instead, it appears with a strikethrough line through it, visually indicating "this item is done."\n\n' +
      'The expo chef watches their screen for the moment when ALL items on a ticket show strikethrough — that means every station has finished, and the order is ready to plate and run to the table. ' +
      'The expo then bumps the complete ticket, which clears it from every screen.\n\n' +
      'This is the gold standard for full-service restaurants. It gives the expo chef real-time visibility into kitchen progress without leaving the pass, ' +
      'and prevents food from dying in the window because one station didn\'t realize the rest of the order was waiting.',
    bestFor: [
      'Full-service restaurants with a dedicated expo/expeditor position',
      'Kitchens with 3+ prep stations where order timing and coordination are critical',
      'Fine dining or high-volume operations where the expo needs real-time item-level progress',
      'Any kitchen where "food dying in the window" is a problem — the expo can see exactly which station is holding up an order',
    ],
    bumpBehavior: 'Prep station bump: item gets a strikethrough on the expo screen (still visible, marked as done). Expo bump: entire ticket clears from ALL screens.',
    considerations: [
      'Requires a dedicated expo station — without one, tickets will accumulate with strikethroughs but nobody clears them',
      'The expo chef is the ONLY person who should bump the final ticket — train prep cooks to bump items, not tickets',
      'If a prep station bumps an item by mistake, the expo will think it is ready. Use the Recall button to un-bump',
      'This mode is item-level, not ticket-level — individual items show as done, giving the expo granular visibility',
    ],
    notToBeConfusedWith: 'Multi-Clear also syncs across stations, but it has no concept of "done vs. cleared." Prep-to-Expo adds the intermediate strikethrough state that the expo needs.',
  },

  assembly_line: {
    label: 'Assembly Line',
    summary: 'Items flow through stations in a defined sequence — each station bumps to send the item to the NEXT station in the chain.',
    description:
      'Assembly Line mode creates a linear workflow where items move from one station to the next in a predefined order, like a conveyor belt. ' +
      'When Station 1 (e.g., Grill) bumps an item, it does not disappear — it moves to Station 2 (e.g., Garnish). ' +
      'When Station 2 bumps, it moves to Station 3 (e.g., Expo/Window). Only when the final station bumps does the item fully clear.\n\n' +
      'The order of stations is defined by the "Assembly Line Order" number on each station (1, 2, 3...). ' +
      'Items always flow forward through the chain. This mirrors physical assembly-line kitchens where a dish is built progressively — ' +
      'proteins are cooked first, then sauces are added, then garnish, then it hits the window.\n\n' +
      'This mode is ideal for operations where every dish goes through the same set of steps in the same order, such as pizza (dough → sauce → toppings → oven → box) ' +
      'or sandwich shops (bread → protein → toppings → wrap).',
    bestFor: [
      'Pizza operations: dough station \u2192 sauce/toppings \u2192 oven \u2192 cut/box \u2192 window',
      'Sub/sandwich shops: bread \u2192 protein \u2192 toppings \u2192 wrap \u2192 expedite',
      'Sushi preparation lines with sequential steps',
      'Any operation where dishes follow a fixed sequence of preparation stages',
    ],
    bumpBehavior: 'Bumping moves the item to the NEXT station in the chain (by assembly line order number). Only the LAST station\'s bump fully clears the item.',
    considerations: [
      'Every station in the chain MUST have a unique "Assembly Line Order" number (1, 2, 3...) — gaps are allowed but items always go to the next higher number',
      'Not ideal for kitchens where different dishes skip stations — a salad should not flow through the grill station. Use Prep-to-Expo or Independent for mixed menus',
      'If a station is offline or unstaffed, items pile up there and block the chain. Designate a fallback station or use the "skip" action',
      'Works best when every item on the menu follows the same general preparation flow',
    ],
    notToBeConfusedWith: 'Prep-to-Expo also creates a flow from prep to expo, but it is a hub-and-spoke model (many prep stations → one expo). Assembly Line is strictly sequential (Station 1 → 2 → 3).',
  },

  mirror: {
    label: 'Mirror',
    summary: 'Two or more screens show identical content — bumping on one instantly bumps on all. Used for duplicate displays of the same station.',
    description:
      'Mirror mode makes two or more screens behave as exact copies of each other. They show the same tickets, in the same order, with the same timers. ' +
      'When any screen bumps a ticket, it disappears from all mirrored screens immediately.\n\n' +
      'This is NOT meant for different stations — it is for placing multiple displays for the SAME station. ' +
      'For example, a long grill line where the cook at the far end can\'t see the main screen, so you mount a second monitor that mirrors it. ' +
      'Or a bar with two bartenders who both need to see the drink queue.\n\n' +
      'Mirror mode also prevents duplicate prep: because both screens show the same queue, two cooks looking at mirrored screens will never accidentally prepare the same item twice — ' +
      'when one of them bumps it, it vanishes from both screens simultaneously.',
    bestFor: [
      'Long cook lines where a second monitor is needed for visibility (e.g., opposite end of a 12-foot grill)',
      'Bars with two or more bartenders sharing one drink queue',
      'Drive-through kitchens where both the assembler and the bagger need to see the same orders',
      'Training setups where a trainer and trainee share a screen view',
    ],
    bumpBehavior: 'Bump on ANY mirrored screen instantly removes the item/ticket from ALL mirrored screens. Content is always identical.',
    considerations: [
      'Mirror is for the SAME station only — do not mirror a grill screen with a salad screen. Use Multi-Clear or Prep-to-Expo for cross-station coordination',
      'All mirrored screens must be configured to mirror the same source station',
      'Network latency between screens should be minimal (<100ms) to avoid two cooks grabbing the same ticket in the brief sync delay',
      'If one mirrored screen goes offline, the other(s) continue operating independently until it reconnects',
    ],
    notToBeConfusedWith: 'Multi-Clear also clears across screens, but Multi-Clear is for DIFFERENT stations seeing DIFFERENT items. Mirror is for the SAME station seeing IDENTICAL content.',
  },
};

// ═══════════════════════════════════════════════════════════════════
// Themes, Font Sizes, Ticket Sizes
// ═══════════════════════════════════════════════════════════════════

export const KDS_THEMES = ['dark', 'light'] as const;
export type KdsTheme = (typeof KDS_THEMES)[number];

export const KDS_FONT_SIZES = ['small', 'medium', 'large', 'xlarge'] as const;
export type KdsFontSize = (typeof KDS_FONT_SIZES)[number];

export const KDS_FONT_SIZE_SCALE: Record<KdsFontSize, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
  xlarge: 1.4,
};

export const KDS_TICKET_SIZES = ['small', 'medium', 'large', 'dynamic'] as const;
export type KdsTicketSize = (typeof KDS_TICKET_SIZES)[number];

export const KDS_TICKET_SIZE_GRID: Record<KdsTicketSize, { cols: number; rows: number }> = {
  small: { cols: 5, rows: 2 },
  medium: { cols: 4, rows: 2 },
  large: { cols: 3, rows: 2 },
  dynamic: { cols: 0, rows: 0 }, // auto-calculated
};

// ═══════════════════════════════════════════════════════════════════
// Modifier Display Modes
// ═══════════════════════════════════════════════════════════════════

export const MODIFIER_DISPLAY_MODES = ['vertical', 'horizontal', 'inline'] as const;
export type ModifierDisplayMode = (typeof MODIFIER_DISPLAY_MODES)[number];

// ═══════════════════════════════════════════════════════════════════
// Input Modes (Touch vs Bump Bar)
// ═══════════════════════════════════════════════════════════════════

export const KDS_INPUT_MODES = ['touch', 'bump_bar', 'both'] as const;
export type KdsInputMode = (typeof KDS_INPUT_MODES)[number];

// ═══════════════════════════════════════════════════════════════════
// Alert Tones
// ═══════════════════════════════════════════════════════════════════

export const KDS_ALERT_TONES = [
  'chime',
  'ding',
  'alert',
  'warning',
  'urgent',
  'rush',
  'allergy',
  'complete',
  'bell',
  'none',
] as const;
export type KdsAlertTone = (typeof KDS_ALERT_TONES)[number];

/** Tone → frequency mapping for Web Audio API */
export const KDS_TONE_FREQUENCIES: Record<KdsAlertTone, { freq: number; duration: number; pattern?: number[] }> = {
  chime:   { freq: 523, duration: 200 },                    // C5
  ding:    { freq: 659, duration: 150 },                    // E5
  alert:   { freq: 880, duration: 300 },                    // A5
  warning: { freq: 880, duration: 200, pattern: [200, 100, 200] }, // double beep
  urgent:  { freq: 1200, duration: 400, pattern: [300, 100, 300, 100, 300] }, // triple
  rush:    { freq: 1047, duration: 250, pattern: [250, 80, 250] }, // C6 double
  allergy: { freq: 1400, duration: 500, pattern: [500, 200, 500, 200, 500] }, // high triple
  complete: { freq: 440, duration: 200 },                   // A4
  bell:    { freq: 784, duration: 300 },                    // G5
  none:    { freq: 0, duration: 0 },
};

// ═══════════════════════════════════════════════════════════════════
// Station Types (extended)
// ═══════════════════════════════════════════════════════════════════

export const KDS_STATION_TYPES = ['prep', 'expo', 'bar', 'dessert', 'salad', 'grill', 'fry', 'pizza', 'custom'] as const;
export type KdsStationType = (typeof KDS_STATION_TYPES)[number];

export const KDS_STATION_TYPE_ICONS: Record<string, string> = {
  prep: '🔪',
  expo: '📋',
  bar: '🍸',
  dessert: '🍰',
  salad: '🥗',
  grill: '🔥',
  fry: '🍟',
  pizza: '🍕',
  custom: '⚙️',
};

// ═══════════════════════════════════════════════════════════════════
// Order Types and Channels for routing/filtering
// ═══════════════════════════════════════════════════════════════════

export const KDS_ORDER_TYPES = ['dine_in', 'takeout', 'delivery', 'bar'] as const;
export type KdsOrderType = (typeof KDS_ORDER_TYPES)[number];

export const KDS_CHANNELS = ['pos', 'online', 'kiosk', 'third_party'] as const;
export type KdsChannel = (typeof KDS_CHANNELS)[number];

// ═══════════════════════════════════════════════════════════════════
// Timer Color Thresholds
// ═══════════════════════════════════════════════════════════════════

export const KDS_TIMER_COLORS = {
  onTime: '#22c55e',      // green-500
  caution: '#f59e0b',     // amber-500
  warning: '#f97316',     // orange-500
  critical: '#ef4444',    // red-500
} as const;

// ═══════════════════════════════════════════════════════════════════
// Priority Levels (Oracle MICROS style, 0-8)
// ═══════════════════════════════════════════════════════════════════

export const KDS_PRIORITY_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type KdsPriorityLevel = (typeof KDS_PRIORITY_LEVELS)[number];

export const KDS_PRIORITY_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'Low',
  2: 'Medium-Low',
  3: 'Medium',
  4: 'Medium-High',
  5: 'High',
  6: 'Urgent',
  7: 'Critical',
  8: 'RUSH',
};

export const KDS_PRIORITY_COLORS: Record<number, string> = {
  0: '#64748b',   // slate
  1: '#06b6d4',   // cyan
  2: '#0ea5e9',   // sky
  3: '#3b82f6',   // blue
  4: '#8b5cf6',   // violet
  5: '#f59e0b',   // amber
  6: '#f97316',   // orange
  7: '#ef4444',   // red
  8: '#dc2626',   // red-600
};

// ═══════════════════════════════════════════════════════════════════
// Routing Rule Types
// ═══════════════════════════════════════════════════════════════════

export const KDS_ROUTING_RULE_TYPES = [
  'item',
  'modifier',
  'department',
  'sub_department',
  'category',
] as const;
export type KdsRoutingRuleType = (typeof KDS_ROUTING_RULE_TYPES)[number];

// ═══════════════════════════════════════════════════════════════════
// Keyboard Shortcuts for KDS (when in touch+keyboard mode)
// ═══════════════════════════════════════════════════════════════════

export const KDS_KEYBOARD_SHORTCUTS: Record<string, BumpBarAction> = {
  Enter: 'bump',
  Space: 'bump_item',
  ArrowRight: 'select_next',
  ArrowLeft: 'select_previous',
  ArrowUp: 'select_previous_item',
  ArrowDown: 'select_next_item',
  'r': 'recall_last',
  'h': 'hold',
  'f': 'fire',
  'F': 'fire_all',
  's': 'start_cooking',
  '!': 'rush',
  'a': 'toggle_all_day',
  'p': 'reprint',
  Escape: 'no_op',
};
