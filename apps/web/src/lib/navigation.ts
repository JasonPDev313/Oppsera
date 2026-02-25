import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  BarChart3,
  Settings,
  List,
  FolderTree,
  Receipt,
  UtensilsCrossed,
  ClipboardList,
  CreditCard,
  Crown,
  CalendarDays,
  FileBarChart,
  LayoutGrid,
  Flag,
  PackageCheck,
  Truck,
  Sparkles,
  MessageSquare,
  Layers,
  History,
  Landmark,
  BookOpen,
  Building2,
  Scale,
  DollarSign,
  Lock,
  Wallet,
  Hotel,
  BedDouble,
  DoorOpen,
  ConciergeBell,
  Brush,
  Shield,
  Globe,
  Rocket,
  Upload,
  Sliders,
  Tag,
  Wrench,
  TrendingUp,
  Star,
  GripVertical,
  ArrowLeftRight,
  AlertTriangle,
} from 'lucide-react';
import { accountingSections } from './accounting-navigation';

export interface SubNavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  moduleKey?: string;
  group?: string;
  /** Permission key required to see this item (checked via `can()`) */
  requiredPermission?: string;
  /** ERP workflow module key for tier-based visibility filtering */
  workflowModuleKey?: string;
  /** ERP workflow key for tier-based visibility filtering */
  workflowKey?: string;
}

export interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  moduleKey?: string;
  children?: SubNavItem[];
  /** When true, children with `group` fields render as collapsible accordion sections */
  collapsibleGroups?: boolean;
  /** Permission key required to see this item (checked via `can()`) */
  requiredPermission?: string;
  /** ERP workflow module key for tier-based visibility filtering */
  workflowModuleKey?: string;
  /** ERP workflow key for tier-based visibility filtering */
  workflowKey?: string;
}

export const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, requiredPermission: 'dashboard.view' },
  { name: 'Retail POS', href: '/pos/retail', icon: ShoppingCart, moduleKey: 'pos_retail', requiredPermission: 'orders.create' },
  {
    name: 'F&B POS',
    href: '/pos/fnb',
    icon: UtensilsCrossed,
    moduleKey: 'pos_fnb',
    requiredPermission: 'pos_fnb.floor_plan.view',
    children: [
      { name: 'Floor Plan', href: '/pos/fnb', icon: LayoutGrid, requiredPermission: 'pos_fnb.floor_plan.view' },
      { name: 'KDS', href: '/kds', icon: ClipboardList, requiredPermission: 'pos_fnb.kds.view' },
      { name: 'Expo', href: '/expo', icon: PackageCheck, requiredPermission: 'pos_fnb.kds.view' },
      { name: 'Host Stand', href: '/host', icon: Users, requiredPermission: 'pos_fnb.floor_plan.view' },
      { name: 'Manager', href: '/fnb-manager', icon: Settings, requiredPermission: 'pos_fnb.reports.view' },
      { name: 'Close Batch', href: '/close-batch', icon: Lock, requiredPermission: 'pos_fnb.close_batch.manage' },
      { name: 'F&B Config', href: '/settings/fnb', icon: Sliders, group: 'F&B Settings', requiredPermission: 'pos_fnb.settings.manage' },
    ],
  },
  {
    name: 'Inventory',
    href: '/catalog',
    icon: Package,
    moduleKey: 'catalog',
    requiredPermission: 'catalog.view',
    children: [
      { name: 'Items', href: '/catalog', icon: List, requiredPermission: 'catalog.view' },
      { name: 'Hierarchy', href: '/catalog/hierarchy', icon: FolderTree, requiredPermission: 'catalog.manage' },
      { name: 'Taxes', href: '/catalog/taxes', icon: Receipt, requiredPermission: 'catalog.view' },
      { name: 'Modifiers', href: '/catalog/modifiers', icon: Sliders, requiredPermission: 'catalog.view' },
      { name: 'Receiving', href: '/inventory/receiving', icon: PackageCheck, requiredPermission: 'inventory.manage' },
      { name: 'Vendors', href: '/vendors', icon: Truck, requiredPermission: 'inventory.manage' },
    ],
  },
  { name: 'Sales History', href: '/orders', icon: ClipboardList, moduleKey: 'pos_retail', requiredPermission: 'orders.view' },
  {
    name: 'Payments',
    href: '/payments/transactions',
    icon: CreditCard,
    moduleKey: 'payments',
    requiredPermission: 'tenders.view',
    children: [
      { name: 'Transactions', href: '/payments/transactions', icon: ArrowLeftRight, requiredPermission: 'tenders.view' },
      { name: 'Failed Payments', href: '/payments/failed', icon: AlertTriangle, requiredPermission: 'tenders.view' },
      { name: 'ACH Status', href: '/payments/ach-status', icon: Landmark, requiredPermission: 'tenders.view' },
    ],
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: Users,
    moduleKey: 'customers',
    requiredPermission: 'customers.view',
    children: [
      { name: 'All Customers', href: '/customers', icon: Users, requiredPermission: 'customers.view' },
      { name: 'Tags', href: '/settings/tag-management', icon: Tag, requiredPermission: 'customers.manage' },
      { name: 'Memberships', href: '/customers/memberships', icon: Crown, requiredPermission: 'billing.view' },
      { name: 'Dues & Plans', href: '/membership/plans', icon: CalendarDays, requiredPermission: 'billing.manage' },
      { name: 'Billing', href: '/customers/billing', icon: CreditCard, requiredPermission: 'billing.view' },
    ],
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
    moduleKey: 'reporting',
    requiredPermission: 'reports.view',
    children: [
      { name: 'Overview', href: '/reports', icon: BarChart3, requiredPermission: 'reports.view' },
      { name: 'Modifiers', href: '/reports/modifiers', icon: Sliders, requiredPermission: 'reports.view' },
      { name: 'Custom Reports', href: '/reports/custom', icon: FileBarChart, requiredPermission: 'reports.custom.view' },
      { name: 'Dashboards', href: '/dashboards', icon: LayoutGrid, requiredPermission: 'reports.custom.view' },
    ],
  },
  {
    name: 'Golf',
    href: '/golf/analytics',
    icon: Flag,
    moduleKey: 'golf_ops',
    requiredPermission: 'golf.analytics.view',
    children: [
      { name: 'Analytics', href: '/golf/analytics', icon: BarChart3, requiredPermission: 'golf.analytics.view' },
    ],
  },
  {
    name: 'AI Insights',
    href: '/insights',
    icon: Sparkles,
    moduleKey: 'semantic',
    requiredPermission: 'semantic.view',
    children: [
      { name: 'Chat', href: '/insights', icon: MessageSquare, requiredPermission: 'semantic.query' },
      { name: 'Watchlist', href: '/insights/watchlist', icon: BarChart3, requiredPermission: 'semantic.view' },
      { name: 'Analysis Tools', href: '/insights/tools', icon: Sparkles, requiredPermission: 'semantic.query' },
      { name: 'Scheduled Reports', href: '/insights/reports', icon: CalendarDays, requiredPermission: 'semantic.manage' },
      { name: 'Lenses', href: '/insights/lenses', icon: Layers, requiredPermission: 'semantic.view' },
      { name: 'Embeds', href: '/insights/embeds', icon: Globe, requiredPermission: 'semantic.manage' },
      { name: 'Authoring', href: '/insights/authoring', icon: Sliders, requiredPermission: 'semantic.manage' },
      { name: 'History', href: '/insights/history', icon: History, requiredPermission: 'semantic.view' },
    ],
  },
  {
    name: 'Property Mgmt',
    href: '/pms',
    icon: Hotel,
    moduleKey: 'pms',
    collapsibleGroups: true,
    requiredPermission: 'pms.property.view',
    children: [
      // Operations
      { name: 'Calendar', href: '/pms/calendar', icon: CalendarDays, group: 'Operations', requiredPermission: 'pms.calendar.view' },
      { name: 'Reservations', href: '/pms/reservations', icon: BedDouble, group: 'Operations', requiredPermission: 'pms.reservations.view' },
      { name: 'Front Desk', href: '/pms/front-desk', icon: ConciergeBell, group: 'Operations', requiredPermission: 'pms.front_desk.check_in' },
      { name: 'Housekeeping', href: '/pms/housekeeping', icon: Brush, group: 'Operations', requiredPermission: 'pms.housekeeping.view' },
      { name: 'Maintenance', href: '/pms/maintenance', icon: Wrench, group: 'Operations', requiredPermission: 'pms.housekeeping.manage' },
      // Guest & Sales
      { name: 'Guests', href: '/pms/guests', icon: Users, group: 'Guest & Sales', requiredPermission: 'pms.guests.view' },
      { name: 'Groups', href: '/pms/groups', icon: Users, group: 'Guest & Sales', requiredPermission: 'pms.reservations.view' },
      { name: 'Corporate', href: '/pms/corporate', icon: Building2, group: 'Guest & Sales', requiredPermission: 'pms.rates.view' },
      { name: 'Loyalty', href: '/pms/loyalty', icon: Star, group: 'Guest & Sales', requiredPermission: 'pms.guests.view' },
      // Revenue & Rates
      { name: 'Revenue Mgmt', href: '/pms/revenue-management', icon: TrendingUp, group: 'Revenue & Rates', requiredPermission: 'pms.rates.manage' },
      { name: 'Rate Plans', href: '/pms/rate-plans', icon: DollarSign, group: 'Revenue & Rates', requiredPermission: 'pms.rates.view' },
      // Property Setup
      { name: 'Room Types', href: '/pms/room-types', icon: LayoutGrid, group: 'Property Setup', requiredPermission: 'pms.rooms.view' },
      { name: 'Rooms', href: '/pms/rooms', icon: DoorOpen, group: 'Property Setup', requiredPermission: 'pms.rooms.view' },
      // Reporting
      { name: 'Reports', href: '/pms/reports', icon: BarChart3, group: 'Reporting', requiredPermission: 'pms.property.view' },
    ],
  },
  {
    name: 'Accounting',
    href: '/accounting',
    icon: Landmark,
    moduleKey: 'accounting',
    requiredPermission: 'accounting.view',
    children: [
      { name: 'Dashboard', href: '/accounting', icon: Landmark, requiredPermission: 'accounting.view' },
      { name: 'General Ledger', href: '/accounting/gl', icon: BookOpen, requiredPermission: 'accounting.view' },
      { name: 'GL Mappings', href: '/accounting/mappings', icon: ArrowLeftRight, requiredPermission: 'accounting.mappings.manage' },
      { name: 'Payables', href: '/accounting/payables', icon: Receipt, moduleKey: 'ap', requiredPermission: 'ap.view' },
      { name: 'Receivables', href: '/accounting/receivables', icon: Wallet, moduleKey: 'ar', requiredPermission: 'ar.view' },
      { name: 'Banking', href: '/accounting/banking', icon: Building2, requiredPermission: 'accounting.banking.view' },
      { name: 'Revenue & Cost', href: '/accounting/revenue', icon: DollarSign, requiredPermission: 'accounting.revenue.view' },
      { name: 'Tax', href: '/accounting/tax', icon: FileBarChart, requiredPermission: 'accounting.tax.view' },
      { name: 'Financials', href: '/accounting/financials', icon: Scale, requiredPermission: 'accounting.financials.view' },
      { name: 'Period Close', href: '/accounting/period-close', icon: Lock, requiredPermission: 'accounting.period.close' },
    ],
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    requiredPermission: 'settings.view',
    children: [
      { name: 'Onboarding', href: '/settings/onboarding', icon: Rocket, requiredPermission: 'settings.update' },
      { name: 'General', href: '/settings/general', icon: Settings, requiredPermission: 'settings.view' },
      { name: 'Navigation', href: '/settings/navigation', icon: GripVertical, requiredPermission: 'settings.update' },
      { name: 'Profit Centers', href: '/settings/profit-centers', icon: Building2, requiredPermission: 'settings.update' },
      { name: 'Merchant Services', href: '/settings/merchant-services', icon: CreditCard, moduleKey: 'payments', requiredPermission: 'settings.update' },
      { name: 'ERP Configuration', href: '/settings/erp-config', icon: TrendingUp, requiredPermission: 'settings.update' },
      { name: 'Permissions', href: '/settings/permissions', icon: Shield, requiredPermission: 'users.manage' },
      { name: 'Room Layouts', href: '/settings/room-layouts', icon: LayoutDashboard, moduleKey: 'room_layouts', requiredPermission: 'room_layouts.view' },
      { name: 'Data Imports', href: '/settings/data-imports', icon: Upload, requiredPermission: 'settings.update' },
      { name: 'Web Apps', href: '/settings/web-apps', icon: Globe, requiredPermission: 'settings.update' },
    ],
  },
];

/** Searchable entry for command palette */
export interface SearchableNavEntry {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  breadcrumb: string;
  moduleKeys: string[];
  requiredPermission?: string;
}

/** Flatten navigation into searchable entries for the command palette */
export function flattenNavigation(nav: NavItem[]): SearchableNavEntry[] {
  const entries: SearchableNavEntry[] = [];

  for (const item of nav) {
    const parentModuleKeys = item.moduleKey ? [item.moduleKey] : [];

    if (item.children) {
      for (const child of item.children) {
        const childModuleKeys = child.moduleKey
          ? [...parentModuleKeys, child.moduleKey]
          : parentModuleKeys;
        const breadcrumb = child.group
          ? `${item.name} > ${child.group}`
          : item.name;
        entries.push({
          label: child.name,
          href: child.href,
          icon: child.icon,
          breadcrumb,
          moduleKeys: childModuleKeys,
          requiredPermission: child.requiredPermission ?? item.requiredPermission,
        });
      }
    } else {
      entries.push({
        label: item.name,
        href: item.href,
        icon: item.icon,
        breadcrumb: '',
        moduleKeys: parentModuleKeys,
        requiredPermission: item.requiredPermission,
      });
    }
  }

  // Add Level-2 accounting tabs (e.g. "Chart of Accounts" under "Accounting > General Ledger")
  for (const section of accountingSections) {
    const sectionModuleKeys = ['accounting'];
    if (section.moduleKey) sectionModuleKeys.push(section.moduleKey);

    for (const tab of section.tabs) {
      const tabModuleKeys = tab.moduleKey
        ? [...sectionModuleKeys, tab.moduleKey]
        : sectionModuleKeys;
      entries.push({
        label: tab.label,
        href: `${section.href}?tab=${tab.id}`,
        icon: tab.icon,
        breadcrumb: `Accounting > ${section.label}`,
        moduleKeys: tabModuleKeys,
        requiredPermission: (tab as { requiredPermission?: string }).requiredPermission,
      });
    }
  }

  // Deduplicate by href (some children share href with parent, e.g. /catalog)
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.href)) return false;
    seen.add(e.href);
    return true;
  });
}
