/**
 * F&B POS UX Screen Map & Interaction Flows
 *
 * Encodes the complete UX specification for the F&B POS module as typed constants.
 * Used by: frontend navigation, route guards, permission checks, onboarding wizards.
 */

// ── Screen Definitions ────────────────────────────────────────────

export interface ScreenDefinition {
  id: string;
  name: string;
  path: string;
  description: string;
  primaryRole: 'server' | 'host' | 'manager' | 'kitchen' | 'cashier' | 'all';
  components: string[];
  dataSources: string[];
  sharedWithRetail: boolean;
  responsive: {
    primary: 'ipad_landscape' | 'ipad_portrait' | 'kds_display' | 'desktop';
    secondary?: 'ipad_portrait' | 'desktop';
  };
}

export const FNB_SCREENS: Record<string, ScreenDefinition> = {
  FLOOR_PLAN: {
    id: 'floor_plan',
    name: 'Floor Plan View',
    path: '/pos/fnb',
    description: 'Restaurant home screen with live table status grid',
    primaryRole: 'all',
    components: [
      'RoomSelector', 'TableGrid', 'TableCard', 'WaitlistSidebar',
      'FloorPlanCanvas', 'TableStatusBadge', 'ServerBadge',
    ],
    dataSources: [
      'getFloorPlanWithLiveStatus', 'listTables', 'listSections',
      'listServerAssignments', 'getHostStandView',
    ],
    sharedWithRetail: false,
    responsive: { primary: 'ipad_landscape', secondary: 'ipad_portrait' },
  },

  TAB_VIEW: {
    id: 'tab_view',
    name: 'Tab View',
    path: '/pos/fnb/tab/:tabId',
    description: 'Main ordering screen with menu browser, seat/course grid, and order summary',
    primaryRole: 'server',
    components: [
      'MenuBrowser', 'DepartmentTabs', 'SubDepartmentTabs', 'CategoryRail',
      'ItemGrid', 'SeatCourseGrid', 'TabSummary', 'ModifierDialog',
      'SeatSelector', 'CourseSelector', 'QuickActions',
    ],
    dataSources: [
      'getTabDetail', 'getCatalogForPOS', 'listAllergens',
      'listMenuPeriods', 'listEightySixed',
    ],
    sharedWithRetail: false,
    responsive: { primary: 'ipad_landscape', secondary: 'ipad_portrait' },
  },

  KDS_STATION: {
    id: 'kds_station',
    name: 'KDS Station View',
    path: '/pos/fnb/kds/:stationId',
    description: 'Kitchen display with ticket cards in time-order for a single station',
    primaryRole: 'kitchen',
    components: [
      'TicketCard', 'TicketItemRow', 'BumpButton', 'RecallButton',
      'StationHeader', 'PriorityIndicator', 'TicketTimer',
    ],
    dataSources: ['getKdsView', 'getStationDetail', 'getStationMetrics'],
    sharedWithRetail: false,
    responsive: { primary: 'kds_display' },
  },

  EXPO_VIEW: {
    id: 'expo_view',
    name: 'Expo View',
    path: '/pos/fnb/expo',
    description: 'All-station ticket view with per-item readiness indicators',
    primaryRole: 'kitchen',
    components: [
      'ExpoTicketCard', 'StationReadinessIndicator', 'TicketBumpButton',
      'CallBackButton', 'ExpoHeader',
    ],
    dataSources: ['getExpoView'],
    sharedWithRetail: false,
    responsive: { primary: 'kds_display' },
  },

  PAYMENT: {
    id: 'payment',
    name: 'Payment Screen',
    path: '/pos/fnb/pay/:tabId',
    description: 'Check summary with split options, tender selection, and tip prompt',
    primaryRole: 'server',
    components: [
      'CheckSummary', 'SplitOptions', 'TenderSelector', 'TipPrompt',
      'SplitCheckNav', 'CardReaderIndicator', 'ChangeDisplay',
    ],
    dataSources: [
      'getPaymentSession', 'getCheckSummary', 'getTabPreauths',
      'listAutoGratuityRules',
    ],
    sharedWithRetail: true, // TenderDialog is shared
    responsive: { primary: 'ipad_landscape', secondary: 'ipad_portrait' },
  },

  SERVER_DASHBOARD: {
    id: 'server_dashboard',
    name: 'Server Dashboard',
    path: '/pos/fnb/server',
    description: "Server's personal view: my tables, open tabs, tips today",
    primaryRole: 'server',
    components: [
      'MyTablesGrid', 'OpenTabsList', 'TipsTodayCard',
      'QuickActionBar', 'ServerMetrics',
    ],
    dataSources: [
      'listTables', 'listTabs', 'getServerPerformance',
      'listTipDeclarations',
    ],
    sharedWithRetail: false,
    responsive: { primary: 'ipad_portrait', secondary: 'ipad_landscape' },
  },

  HOST_STAND: {
    id: 'host_stand',
    name: 'Host Stand View',
    path: '/pos/fnb/host',
    description: 'Table availability board with rotation queue and server capacity',
    primaryRole: 'host',
    components: [
      'AvailabilityBoard', 'RotationQueue', 'CoverCountDisplay',
      'WaitlistPanel', 'SeatButton',
    ],
    dataSources: [
      'getHostStandView', 'getAvailableTables', 'listServerAssignments',
    ],
    sharedWithRetail: false,
    responsive: { primary: 'ipad_landscape' },
  },

  MANAGER_DASHBOARD: {
    id: 'manager_dashboard',
    name: 'Manager Dashboard',
    path: '/pos/fnb/manager',
    description: 'Live KPIs, 86 board, alert feed, and close batch launcher',
    primaryRole: 'manager',
    components: [
      'LiveKpiCards', 'EightySixBoard', 'AlertFeed', 'CloseBatchLauncher',
      'OpenTabsAlert', 'VoidAlertCard', 'WalkoutAlertCard',
    ],
    dataSources: [
      'getFnbDashboard', 'listEightySixed', 'listTabs',
      'getDiscountCompAnalysis', 'getCloseBatch',
    ],
    sharedWithRetail: false,
    responsive: { primary: 'desktop', secondary: 'ipad_landscape' },
  },

  CLOSE_BATCH: {
    id: 'close_batch',
    name: 'Close Batch Screen',
    path: '/pos/fnb/close-batch/:batchId',
    description: 'Cash count entry, over/short display, and batch posting',
    primaryRole: 'manager',
    components: [
      'OpenItemsList', 'CashCountForm', 'OverShortDisplay',
      'ServerCheckoutList', 'ConfirmPostButton', 'DepositSlip',
    ],
    dataSources: [
      'getCloseBatch', 'listServerCheckouts', 'getZReport',
      'listCashDrops', 'listCashPaidOuts',
    ],
    sharedWithRetail: false,
    responsive: { primary: 'ipad_landscape', secondary: 'desktop' },
  },

  SETTINGS: {
    id: 'settings',
    name: 'F&B Settings',
    path: '/settings/fnb',
    description: 'Configuration for all F&B POS settings submodules',
    primaryRole: 'manager',
    components: [
      'SettingsNav', 'GeneralSettingsForm', 'FloorSettingsForm',
      'OrderingSettingsForm', 'KitchenSettingsForm', 'PaymentSettingsForm',
      'TipsSettingsForm', 'AccountingSettingsForm', 'ReceiptsSettingsForm',
      'HardwareSettingsForm',
    ],
    dataSources: ['getFnbSettings', 'getFnbSettingsDefaults'],
    sharedWithRetail: false,
    responsive: { primary: 'desktop', secondary: 'ipad_landscape' },
  },
} as const;

// ── Component Reuse Map ───────────────────────────────────────────

export interface ComponentReuse {
  component: string;
  sharedWithRetail: boolean;
  fnbOnly: boolean;
  description: string;
}

export const COMPONENT_REUSE_MAP: ComponentReuse[] = [
  // Shared with retail
  { component: 'TenderDialog', sharedWithRetail: true, fnbOnly: false, description: 'Cash/card tender flow' },
  { component: 'ModifierDialog', sharedWithRetail: true, fnbOnly: false, description: 'Item modifier selection' },
  { component: 'DepartmentTabs', sharedWithRetail: true, fnbOnly: false, description: 'Catalog top-level nav' },
  { component: 'SubDepartmentTabs', sharedWithRetail: true, fnbOnly: false, description: 'Catalog second-level nav' },
  { component: 'CategoryRail', sharedWithRetail: true, fnbOnly: false, description: 'Catalog third-level nav' },
  { component: 'ItemButton', sharedWithRetail: true, fnbOnly: false, description: 'Touchable item tile' },
  { component: 'CartTotals', sharedWithRetail: true, fnbOnly: false, description: 'Subtotal/tax/total display' },
  { component: 'PriceOverrideDialog', sharedWithRetail: true, fnbOnly: false, description: 'Manual price override' },
  { component: 'DiscountDialog', sharedWithRetail: true, fnbOnly: false, description: 'Apply discount to order' },
  { component: 'ServiceChargeDialog', sharedWithRetail: true, fnbOnly: false, description: 'Add service charge' },

  // F&B only
  { component: 'SeatCourseGrid', sharedWithRetail: false, fnbOnly: true, description: 'Seat columns × course rows' },
  { component: 'SeatSelector', sharedWithRetail: false, fnbOnly: true, description: 'Assign items to seats' },
  { component: 'CourseSelector', sharedWithRetail: false, fnbOnly: true, description: 'Set active course for next items' },
  { component: 'FloorPlanCanvas', sharedWithRetail: false, fnbOnly: true, description: 'Live table status canvas' },
  { component: 'TableCard', sharedWithRetail: false, fnbOnly: true, description: 'Table status card with actions' },
  { component: 'TicketCard', sharedWithRetail: false, fnbOnly: true, description: 'Kitchen ticket display card' },
  { component: 'BumpButton', sharedWithRetail: false, fnbOnly: true, description: 'Mark item/ticket ready' },
  { component: 'SplitOptions', sharedWithRetail: false, fnbOnly: true, description: 'Check split strategy picker' },
  { component: 'TipPrompt', sharedWithRetail: false, fnbOnly: true, description: 'Configurable tip suggestions' },
  { component: 'EightySixBoard', sharedWithRetail: false, fnbOnly: true, description: 'Unavailable items board' },
  { component: 'AvailabilityBoard', sharedWithRetail: false, fnbOnly: true, description: 'Table availability for host' },
  { component: 'RotationQueue', sharedWithRetail: false, fnbOnly: true, description: 'Next-up server rotation' },
  { component: 'CashCountForm', sharedWithRetail: false, fnbOnly: true, description: 'End-of-day cash count entry' },
  { component: 'OverShortDisplay', sharedWithRetail: false, fnbOnly: true, description: 'Cash over/short indicator' },
];

// ── Permission Matrix ─────────────────────────────────────────────

export type FnbRole = 'owner' | 'manager' | 'supervisor' | 'server' | 'host' | 'cashier' | 'kitchen' | 'staff';

export interface ScreenPermission {
  screenId: string;
  allowedRoles: FnbRole[];
  requiredPermission: string;
}

export const FNB_SCREEN_PERMISSIONS: ScreenPermission[] = [
  { screenId: 'floor_plan', allowedRoles: ['owner', 'manager', 'supervisor', 'server', 'host', 'cashier'], requiredPermission: 'pos_fnb.floor_plan.view' },
  { screenId: 'tab_view', allowedRoles: ['owner', 'manager', 'supervisor', 'server', 'cashier'], requiredPermission: 'pos_fnb.tabs.view' },
  { screenId: 'kds_station', allowedRoles: ['owner', 'manager', 'supervisor', 'kitchen'], requiredPermission: 'pos_fnb.kds.view' },
  { screenId: 'expo_view', allowedRoles: ['owner', 'manager', 'supervisor', 'kitchen'], requiredPermission: 'pos_fnb.kds.view' },
  { screenId: 'payment', allowedRoles: ['owner', 'manager', 'supervisor', 'server', 'cashier'], requiredPermission: 'pos_fnb.payments.create' },
  { screenId: 'server_dashboard', allowedRoles: ['owner', 'manager', 'supervisor', 'server'], requiredPermission: 'pos_fnb.tabs.view' },
  { screenId: 'host_stand', allowedRoles: ['owner', 'manager', 'supervisor', 'host'], requiredPermission: 'pos_fnb.floor_plan.view' },
  { screenId: 'manager_dashboard', allowedRoles: ['owner', 'manager', 'supervisor'], requiredPermission: 'pos_fnb.reports.view' },
  { screenId: 'close_batch', allowedRoles: ['owner', 'manager'], requiredPermission: 'pos_fnb.close_batch.manage' },
  { screenId: 'settings', allowedRoles: ['owner', 'manager'], requiredPermission: 'pos_fnb.settings.manage' },
];

// ── Navigation Structure ──────────────────────────────────────────

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  children?: NavItem[];
  requiredPermission: string;
  badge?: 'count' | 'alert' | null;
}

export const FNB_NAV_ITEMS: NavItem[] = [
  {
    id: 'floor_plan',
    label: 'Floor Plan',
    icon: 'LayoutGrid',
    path: '/pos/fnb',
    requiredPermission: 'pos_fnb.floor_plan.view',
    badge: null,
  },
  {
    id: 'server_dashboard',
    label: 'My Tables',
    icon: 'User',
    path: '/pos/fnb/server',
    requiredPermission: 'pos_fnb.tabs.view',
    badge: 'count',
  },
  {
    id: 'host_stand',
    label: 'Host Stand',
    icon: 'ClipboardList',
    path: '/pos/fnb/host',
    requiredPermission: 'pos_fnb.floor_plan.view',
    badge: null,
  },
  {
    id: 'kds',
    label: 'Kitchen Display',
    icon: 'ChefHat',
    path: '/pos/fnb/kds',
    requiredPermission: 'pos_fnb.kds.view',
    badge: 'count',
    children: [
      { id: 'kds_expo', label: 'Expo', icon: 'Eye', path: '/pos/fnb/expo', requiredPermission: 'pos_fnb.kds.view' },
    ],
  },
  {
    id: 'manager',
    label: 'Manager',
    icon: 'BarChart3',
    path: '/pos/fnb/manager',
    requiredPermission: 'pos_fnb.reports.view',
    badge: 'alert',
    children: [
      { id: 'close_batch', label: 'Close Batch', icon: 'Lock', path: '/pos/fnb/close-batch', requiredPermission: 'pos_fnb.close_batch.manage' },
      { id: 'eighty_six', label: '86 Board', icon: 'Ban', path: '/pos/fnb/86', requiredPermission: 'pos_fnb.menu.manage' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'Settings',
    path: '/settings/fnb',
    requiredPermission: 'pos_fnb.settings.manage',
    badge: null,
  },
];

// ── Interaction Flows ─────────────────────────────────────────────

export interface FlowStep {
  stepNumber: number;
  screen: string;
  action: string;
  result: string;
  events?: string[];
}

export interface InteractionFlow {
  id: string;
  name: string;
  description: string;
  steps: FlowStep[];
}

export const FNB_INTERACTION_FLOWS: InteractionFlow[] = [
  {
    id: 'dine_in_full',
    name: 'Seat Guests → Order → Send → Fire → Split Pay → Close',
    description: 'Full dine-in lifecycle from seating to payment',
    steps: [
      { stepNumber: 1, screen: 'floor_plan', action: 'Host selects available table', result: 'Table status modal opens', events: [] },
      { stepNumber: 2, screen: 'floor_plan', action: 'Tap "Seat" with party size', result: 'Table → occupied, new tab created', events: ['fnb.table.status_changed.v1', 'fnb.tab.opened.v1'] },
      { stepNumber: 3, screen: 'tab_view', action: 'Server selects seat, adds items from menu', result: 'Items added to tab with seat and course assignment', events: [] },
      { stepNumber: 4, screen: 'tab_view', action: 'Tap "Send" to fire course 1', result: 'Kitchen ticket created, sent to KDS', events: ['fnb.ticket.created.v1', 'fnb.course.sent.v1'] },
      { stepNumber: 5, screen: 'kds_station', action: 'Cook bumps items as ready', result: 'Items marked completed per station', events: ['fnb.item.bumped.v1'] },
      { stepNumber: 6, screen: 'tab_view', action: 'Server fires course 2', result: 'Second ticket created', events: ['fnb.course.fired.v1', 'fnb.ticket.created.v1'] },
      { stepNumber: 7, screen: 'expo_view', action: 'Expo bumps ticket when all stations ready', result: 'Ticket marked for service', events: ['fnb.ticket.bumped.v1'] },
      { stepNumber: 8, screen: 'payment', action: 'Server presents check, guest splits by seat', result: 'Split checks created', events: ['fnb.check.presented.v1'] },
      { stepNumber: 9, screen: 'payment', action: 'Each seat pays via card', result: 'Tenders applied, payment complete', events: ['fnb.tender.applied.v1', 'fnb.payment.completed.v1'] },
      { stepNumber: 10, screen: 'floor_plan', action: 'Tab auto-closes, table cleared', result: 'Table → available', events: ['fnb.tab.closed.v1', 'fnb.table.status_changed.v1'] },
    ],
  },
  {
    id: 'bar_tab_preauth',
    name: 'Open Bar Tab with Card → Add Items → Present Check → Tip Adjust → Close',
    description: 'Pre-auth bar tab workflow',
    steps: [
      { stepNumber: 1, screen: 'tab_view', action: 'Bartender opens new bar tab', result: 'Tab created with bar type', events: ['fnb.tab.opened.v1'] },
      { stepNumber: 2, screen: 'tab_view', action: 'Swipe card to pre-authorize', result: 'Pre-auth created, card on file', events: ['fnb.preauth.created.v1'] },
      { stepNumber: 3, screen: 'tab_view', action: 'Add drinks as ordered throughout night', result: 'Items added to tab', events: [] },
      { stepNumber: 4, screen: 'payment', action: 'Present check to customer', result: 'Check presented with pre-auth balance', events: ['fnb.check.presented.v1'] },
      { stepNumber: 5, screen: 'payment', action: 'Capture pre-auth with tip', result: 'Pre-auth captured, tip recorded', events: ['fnb.preauth.captured.v1', 'fnb.tip.collected.v1'] },
      { stepNumber: 6, screen: 'tab_view', action: 'Tab auto-closes after capture', result: 'Tab closed', events: ['fnb.tab.closed.v1'] },
    ],
  },
  {
    id: 'transfer_tab',
    name: 'Transfer Tab Between Servers',
    description: 'Server handoff mid-service',
    steps: [
      { stepNumber: 1, screen: 'floor_plan', action: 'Manager selects occupied table', result: 'Table detail shown', events: [] },
      { stepNumber: 2, screen: 'floor_plan', action: 'Tap "Transfer" and select new server', result: 'Transfer confirmation dialog', events: [] },
      { stepNumber: 3, screen: 'floor_plan', action: 'Confirm transfer', result: 'Tab moved to new server, section updated', events: ['fnb.tab.transferred.v1'] },
    ],
  },
  {
    id: 'void_after_send',
    name: 'Void Item After Kitchen Send (Delta Chit)',
    description: 'Voiding an item after it was sent to kitchen',
    steps: [
      { stepNumber: 1, screen: 'tab_view', action: 'Server selects sent item', result: 'Item options shown', events: [] },
      { stepNumber: 2, screen: 'tab_view', action: 'Tap "Void" with reason', result: 'Void confirmation dialog (requires manager PIN)', events: [] },
      { stepNumber: 3, screen: 'tab_view', action: 'Manager approves void', result: 'Delta chit (VOID type) created, sent to KDS', events: ['fnb.delta_chit.created.v1'] },
      { stepNumber: 4, screen: 'kds_station', action: 'Cook sees VOID delta chit', result: 'Item cancelled on station display', events: [] },
    ],
  },
  {
    id: 'close_batch_gl',
    name: 'End-of-Day Close Batch and GL Posting',
    description: 'Night-end close-out workflow',
    steps: [
      { stepNumber: 1, screen: 'manager_dashboard', action: 'Manager taps "Close Batch"', result: 'Close batch created, checklist shown', events: ['fnb.close_batch.started.v1'] },
      { stepNumber: 2, screen: 'close_batch', action: 'Each server checks out', result: 'Server checkouts recorded', events: ['fnb.server.checked_out.v1'] },
      { stepNumber: 3, screen: 'close_batch', action: 'Manager enters cash count', result: 'Over/short calculated', events: [] },
      { stepNumber: 4, screen: 'close_batch', action: 'Manager reconciles and confirms', result: 'Batch reconciled', events: ['fnb.close_batch.reconciled.v1'] },
      { stepNumber: 5, screen: 'close_batch', action: 'Tap "Post to GL"', result: 'GL journal entry created', events: ['fnb.close_batch.posted.v1', 'fnb.gl_posting.created.v1'] },
    ],
  },
  {
    id: 'eighty_six_mid_service',
    name: '86 an Item Mid-Service',
    description: 'Real-time menu item removal',
    steps: [
      { stepNumber: 1, screen: 'manager_dashboard', action: 'Manager opens 86 Board', result: '86 board displayed with current items', events: [] },
      { stepNumber: 2, screen: 'manager_dashboard', action: 'Search and select item to 86', result: '86 confirmation dialog', events: [] },
      { stepNumber: 3, screen: 'manager_dashboard', action: 'Confirm 86 with reason', result: 'Item marked as 86ed across all terminals', events: ['fnb.item.eighty_sixed.v1'] },
      { stepNumber: 4, screen: 'tab_view', action: 'Server tries to add 86ed item', result: 'Item shown as unavailable in menu, blocked from adding', events: [] },
    ],
  },
];

// ── Wireframe Descriptions ────────────────────────────────────────

export interface WireframeDescription {
  screenId: string;
  layout: string;
  panels: Array<{
    name: string;
    position: string;
    width: string;
    content: string[];
  }>;
}

export const FNB_WIREFRAMES: WireframeDescription[] = [
  {
    screenId: 'floor_plan',
    layout: 'Full screen with top room tabs and bottom action bar',
    panels: [
      {
        name: 'Room Tabs',
        position: 'top',
        width: '100%',
        content: ['Horizontal tab bar for each dining room/area', 'Active tab highlighted', 'Tab count badge showing open tables'],
      },
      {
        name: 'Table Grid',
        position: 'center',
        width: '100%',
        content: [
          'Canvas or grid layout matching floor plan',
          'Tables colored by status: green=available, blue=occupied, yellow=check_presented, red=needs_attention',
          'Each table shows: number, server initials, party size, elapsed time',
          'Tap to select, long-press for quick actions',
        ],
      },
      {
        name: 'Action Bar',
        position: 'bottom',
        width: '100%',
        content: ['Seat Table | View Tab | Transfer | Combine | Split | Clear'],
      },
    ],
  },
  {
    screenId: 'tab_view',
    layout: 'Three-panel: left menu (30%), center order grid (40%), right summary (30%)',
    panels: [
      {
        name: 'Menu Browser',
        position: 'left',
        width: '30%',
        content: [
          'Department tabs across top',
          'SubDepartment tabs below',
          'Category rail (vertical scroll)',
          'Item grid (3-column, large touch targets)',
          '86ed items grayed out with strikethrough',
          'Search bar at top',
        ],
      },
      {
        name: 'Seat × Course Grid',
        position: 'center',
        width: '40%',
        content: [
          'Columns = seats (Seat 1, Seat 2, ...)',
          'Rows = courses (Course 1, Course 2, ...)',
          'Items in cells with qty, mods, special instructions',
          'Active course highlighted',
          'Sent items in italic with checkmark',
          'Voided items in strikethrough with red',
          'Tap item for options: void, move seat, add mod',
        ],
      },
      {
        name: 'Tab Summary',
        position: 'right',
        width: '30%',
        content: [
          'Table # and server name at top',
          'Party size badge',
          'Item list with prices (scrollable)',
          'Subtotal, tax, service charge, discount, total',
          'Quick actions: Send All | Hold | Fire | Present Check',
          'Split/Transfer/Void buttons at bottom',
        ],
      },
    ],
  },
  {
    screenId: 'kds_station',
    layout: 'Horizontal ticket queue, full screen, no scrolling (auto-fit)',
    panels: [
      {
        name: 'Station Header',
        position: 'top',
        width: '100%',
        content: [
          'Station name (e.g., "GRILL")',
          'Pending tickets count',
          'Average ticket time',
          'Alert indicator (tickets past threshold)',
        ],
      },
      {
        name: 'Ticket Queue',
        position: 'center',
        width: '100%',
        content: [
          'Horizontal card layout: oldest on left, newest on right',
          'Each card: ticket #, table #, server name, elapsed timer',
          'Items with quantity, name, modifiers (indented)',
          'Priority color: normal=white, rush=orange, VIP=gold',
          'Allergen flags in red',
          'Per-item bump button (checkmark)',
          'Full-ticket bump button at bottom of card',
          'All-bumped cards flash green before removing',
        ],
      },
    ],
  },
];

// ── Responsive Breakpoints ────────────────────────────────────────

export const FNB_BREAKPOINTS = {
  kds_display: { minWidth: 1920, orientation: 'landscape', description: 'Wall-mounted kitchen display' },
  ipad_landscape: { minWidth: 1024, orientation: 'landscape', description: 'POS terminal (iPad Pro)' },
  ipad_portrait: { minWidth: 768, orientation: 'portrait', description: 'Server handheld (iPad Mini)' },
  desktop: { minWidth: 1280, orientation: 'landscape', description: 'Manager desktop browser' },
} as const;

// ── Mode Switching ────────────────────────────────────────────────

export const MODE_SWITCHING = {
  mechanism: 'css_toggle',
  description: 'Both Retail and F&B POS mount in pos/layout.tsx and toggle via CSS. No route transition. isActive prop gates interactions.',
  terminalConfig: 'localStorage (V1)',
  switchPath: '/pos',
  retailPath: '/pos/retail',
  fnbPath: '/pos/fnb',
} as const;
