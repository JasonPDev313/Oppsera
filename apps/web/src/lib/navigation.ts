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
  /** ERP workflow module key for tier-based visibility filtering */
  workflowModuleKey?: string;
  /** ERP workflow key for tier-based visibility filtering */
  workflowKey?: string;
}

export const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Retail POS', href: '/pos/retail', icon: ShoppingCart, moduleKey: 'pos_retail' },
  {
    name: 'F&B POS',
    href: '/pos/fnb',
    icon: UtensilsCrossed,
    moduleKey: 'pos_fnb',
    children: [
      { name: 'Floor Plan', href: '/pos/fnb', icon: LayoutGrid },
      { name: 'KDS', href: '/kds', icon: ClipboardList },
      { name: 'Expo', href: '/expo', icon: PackageCheck },
      { name: 'Host Stand', href: '/host', icon: Users },
      { name: 'Manager', href: '/fnb-manager', icon: Settings },
      { name: 'Close Batch', href: '/close-batch', icon: Lock },
      { name: 'F&B Config', href: '/settings/fnb', icon: Sliders, group: 'F&B Settings' },
    ],
  },
  {
    name: 'Inventory',
    href: '/catalog',
    icon: Package,
    moduleKey: 'catalog',
    children: [
      { name: 'Items', href: '/catalog', icon: List },
      { name: 'Hierarchy', href: '/catalog/hierarchy', icon: FolderTree },
      { name: 'Taxes', href: '/catalog/taxes', icon: Receipt },
      { name: 'Modifiers', href: '/catalog/modifiers', icon: Sliders },
      { name: 'Receiving', href: '/inventory/receiving', icon: PackageCheck },
      { name: 'Vendors', href: '/vendors', icon: Truck },
    ],
  },
  { name: 'Sales History', href: '/orders', icon: ClipboardList, moduleKey: 'pos_retail' },
  {
    name: 'Payments',
    href: '/payments/transactions',
    icon: CreditCard,
    moduleKey: 'payments',
    children: [
      { name: 'Transactions', href: '/payments/transactions', icon: ArrowLeftRight },
      { name: 'Failed Payments', href: '/payments/failed', icon: AlertTriangle },
      { name: 'ACH Status', href: '/payments/ach-status', icon: Landmark },
    ],
  },
  {
    name: 'Customers',
    href: '/customers',
    icon: Users,
    moduleKey: 'customers',
    children: [
      { name: 'All Customers', href: '/customers', icon: Users },
      { name: 'Tags', href: '/settings/tag-management', icon: Tag },
      { name: 'Memberships', href: '/customers/memberships', icon: Crown },
      { name: 'Dues & Plans', href: '/membership/plans', icon: CalendarDays },
      { name: 'Billing', href: '/customers/billing', icon: CreditCard },
    ],
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: BarChart3,
    moduleKey: 'reporting',
    children: [
      { name: 'Overview', href: '/reports', icon: BarChart3 },
      { name: 'Modifiers', href: '/reports/modifiers', icon: Sliders },
      { name: 'Custom Reports', href: '/reports/custom', icon: FileBarChart },
      { name: 'Dashboards', href: '/dashboards', icon: LayoutGrid },
    ],
  },
  {
    name: 'Golf',
    href: '/golf/analytics',
    icon: Flag,
    moduleKey: 'golf_ops',
    children: [
      { name: 'Analytics', href: '/golf/analytics', icon: BarChart3 },
    ],
  },
  {
    name: 'AI Insights',
    href: '/insights',
    icon: Sparkles,
    moduleKey: 'semantic',
    children: [
      { name: 'Chat', href: '/insights', icon: MessageSquare },
      { name: 'Watchlist', href: '/insights/watchlist', icon: BarChart3 },
      { name: 'Analysis Tools', href: '/insights/tools', icon: Sparkles },
      { name: 'Scheduled Reports', href: '/insights/reports', icon: CalendarDays },
      { name: 'Lenses', href: '/insights/lenses', icon: Layers },
      { name: 'Embeds', href: '/insights/embeds', icon: Globe },
      { name: 'Authoring', href: '/insights/authoring', icon: Sliders },
      { name: 'History', href: '/insights/history', icon: History },
    ],
  },
  {
    name: 'Property Mgmt',
    href: '/pms',
    icon: Hotel,
    moduleKey: 'pms',
    collapsibleGroups: true,
    children: [
      // Operations
      { name: 'Calendar', href: '/pms/calendar', icon: CalendarDays, group: 'Operations' },
      { name: 'Reservations', href: '/pms/reservations', icon: BedDouble, group: 'Operations' },
      { name: 'Front Desk', href: '/pms/front-desk', icon: ConciergeBell, group: 'Operations' },
      { name: 'Housekeeping', href: '/pms/housekeeping', icon: Brush, group: 'Operations' },
      { name: 'Maintenance', href: '/pms/maintenance', icon: Wrench, group: 'Operations' },
      // Guest & Sales
      { name: 'Guests', href: '/pms/guests', icon: Users, group: 'Guest & Sales' },
      { name: 'Groups', href: '/pms/groups', icon: Users, group: 'Guest & Sales' },
      { name: 'Corporate', href: '/pms/corporate', icon: Building2, group: 'Guest & Sales' },
      { name: 'Loyalty', href: '/pms/loyalty', icon: Star, group: 'Guest & Sales' },
      // Revenue & Rates
      { name: 'Revenue Mgmt', href: '/pms/revenue-management', icon: TrendingUp, group: 'Revenue & Rates' },
      { name: 'Rate Plans', href: '/pms/rate-plans', icon: DollarSign, group: 'Revenue & Rates' },
      // Property Setup
      { name: 'Room Types', href: '/pms/room-types', icon: LayoutGrid, group: 'Property Setup' },
      { name: 'Rooms', href: '/pms/rooms', icon: DoorOpen, group: 'Property Setup' },
      // Reporting
      { name: 'Reports', href: '/pms/reports', icon: BarChart3, group: 'Reporting' },
    ],
  },
  {
    name: 'Accounting',
    href: '/accounting',
    icon: Landmark,
    moduleKey: 'accounting',
    workflowModuleKey: 'accounting',
    workflowKey: 'journal_posting',
    children: [
      { name: 'Dashboard', href: '/accounting', icon: Landmark },
      { name: 'General Ledger', href: '/accounting/gl', icon: BookOpen },
      { name: 'Payables', href: '/accounting/payables', icon: Receipt, moduleKey: 'ap' },
      { name: 'Receivables', href: '/accounting/receivables', icon: Wallet, moduleKey: 'ar' },
      { name: 'Banking', href: '/accounting/banking', icon: Building2, workflowModuleKey: 'accounting', workflowKey: 'bank_reconciliation' },
      { name: 'Revenue & Cost', href: '/accounting/revenue', icon: DollarSign },
      { name: 'Tax', href: '/accounting/tax', icon: FileBarChart },
      { name: 'Financials', href: '/accounting/financials', icon: Scale },
      { name: 'Period Close', href: '/accounting/period-close', icon: Lock, workflowModuleKey: 'accounting', workflowKey: 'period_close' },
    ],
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    children: [
      { name: 'Onboarding', href: '/settings/onboarding', icon: Rocket },
      { name: 'General', href: '/settings', icon: Settings },
      { name: 'Navigation', href: '/settings/navigation', icon: GripVertical },
      { name: 'Profit Centers', href: '/settings/profit-centers', icon: Building2 },
      { name: 'Merchant Processing', href: '/settings/merchant-processing', icon: CreditCard, moduleKey: 'payments' },
      { name: 'ERP Configuration', href: '/settings/erp-config', icon: TrendingUp },
      { name: 'Permissions', href: '/settings/permissions', icon: Shield },
      { name: 'Room Layouts', href: '/settings/room-layouts', icon: LayoutDashboard, moduleKey: 'room_layouts' },
      { name: 'Data Imports', href: '/settings/data-imports', icon: Upload },
      { name: 'Web Apps', href: '/settings/web-apps', icon: Globe },
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
        });
      }
    } else {
      entries.push({
        label: item.name,
        href: item.href,
        icon: item.icon,
        breadcrumb: '',
        moduleKeys: parentModuleKeys,
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
