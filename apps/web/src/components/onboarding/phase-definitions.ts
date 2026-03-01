import {
  Building2,
  Users,
  Package,
  Truck,
  UserCircle,
  Landmark,
  Monitor,
  UtensilsCrossed,
  BarChart3,
  Rocket,
  FolderTree,
  Receipt,
  Tags,
  Layers,
  Scale,
  Shield,
  MapPin,
  CreditCard,
  Crown,
  Warehouse,
  Ruler,
  Calculator,
  TrendingUp,
  PackageCheck,
  BookOpen,
  ArrowRightLeft,
  Zap,
  LayoutGrid,
  ClipboardList,
  Utensils,
  AlertTriangle,
  Timer,
  DollarSign,
  LayoutDashboard,
  FileBarChart,
  Sparkles,
  CheckCircle,
  ShoppingCart,
  Smartphone,
  Upload,
  Scissors,
  Calendar,
  Gift,
  type LucideIcon,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────

export interface OnboardingStepDef {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

export interface OnboardingPhaseDef {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Module key — phase is hidden if this module is not enabled */
  moduleKey?: string;
  steps: OnboardingStepDef[];
}

// ── Phase Definitions ────────────────────────────────────

export const ONBOARDING_PHASES: OnboardingPhaseDef[] = [
  // ── Phase 1: Organization & Locations ──
  {
    key: 'organization',
    label: 'Organization & Locations',
    description: 'Set up your physical locations, profit centers, and terminals',
    icon: Building2,
    steps: [
      {
        key: 'locations',
        label: 'Add Locations',
        description: 'Add your sites and venues. Each physical location where you operate needs a location record.',
        icon: MapPin,
        href: '/settings/profit-centers',
      },
      {
        key: 'profit_centers',
        label: 'Configure Profit Centers',
        description: 'Profit centers represent revenue-generating areas within a location (e.g., Pro Shop, Restaurant, Bar).',
        icon: Building2,
        href: '/settings/profit-centers',
      },
      {
        key: 'terminals',
        label: 'Set Up Terminals',
        description: 'Register each POS terminal or workstation. Terminals are assigned to profit centers.',
        icon: Monitor,
        href: '/settings/profit-centers',
      },
      {
        key: 'terminal_settings',
        label: 'Terminal Settings',
        description: 'Configure receipt headers, tip prompts, auto-logout timeouts, and signature requirements per terminal.',
        icon: Monitor,
        // TODO: href to terminal settings page when built
      },
    ],
  },

  // ── Phase 2: Users & Roles ──
  {
    key: 'users',
    label: 'Users & Roles',
    description: 'Invite your team and assign permissions',
    icon: Users,
    steps: [
      {
        key: 'invite_users',
        label: 'Invite Team Members',
        description: 'Add staff by email and assign them a role. They\'ll receive an invitation to join.',
        icon: Users,
        href: '/settings',
      },
      {
        key: 'import_staff',
        label: 'Import Staff from Legacy System',
        description: 'Have a staff export from your current system? Upload a CSV and we\'ll auto-map columns, detect duplicates, and show a preview before anything changes.',
        icon: Upload,
        href: '/settings/import/staff',
      },
      {
        key: 'custom_roles',
        label: 'Create Custom Roles',
        description: 'The system includes 6 default roles. Create custom roles if you need different permission combinations.',
        icon: Shield,
        href: '/settings',
      },
      {
        key: 'location_assignments',
        label: 'Location-Specific Permissions',
        description: 'Assign users to specific locations or grant tenant-wide access. Useful for multi-location businesses.',
        icon: MapPin,
        href: '/settings/permissions',
      },
    ],
  },

  // ── Phase 3: Catalog & Products ──
  {
    key: 'catalog',
    label: 'Catalog & Products',
    description: 'Build your product hierarchy and add items',
    icon: Package,
    moduleKey: 'catalog',
    steps: [
      {
        key: 'hierarchy',
        label: 'Department / Sub-Department / Category',
        description: 'Review and customize your product hierarchy. Starter categories were created during signup based on your business type.',
        icon: FolderTree,
        href: '/catalog/hierarchy',
      },
      {
        key: 'tax_config',
        label: 'Tax Categories & Rates',
        description: 'Configure your tax rates and tax groups. A default 8% sales tax was created — update it to match your jurisdiction.',
        icon: Receipt,
        href: '/catalog/taxes',
      },
      {
        key: 'items',
        label: 'Create Items',
        description: 'Add your products, services, and packages. You can enter them manually or import via CSV.',
        icon: Package,
        href: '/catalog',
      },
      {
        key: 'import_items',
        label: 'Import Inventory from CSV',
        description: 'Upload a CSV with your products from any system. We\'ll auto-match columns and you review before anything is imported.',
        icon: Upload,
        href: '/catalog?import=true',
      },
      {
        key: 'modifiers',
        label: 'Modifier Groups',
        description: 'Set up modifier groups for item customization (e.g., Size, Temperature, Add-ons).',
        icon: Tags,
        href: '/catalog',
      },
      {
        key: 'packages',
        label: 'Package Items',
        description: 'Create bundled packages with component items. Pricing can be fixed or sum-of-components.',
        icon: Layers,
        href: '/catalog',
      },
    ],
  },

  // ── Phase 4: Inventory & Vendors ──
  {
    key: 'inventory',
    label: 'Inventory & Vendors',
    description: 'Set up vendors, costs, and opening stock levels',
    icon: Truck,
    moduleKey: 'inventory',
    steps: [
      {
        key: 'vendors',
        label: 'Create Vendors',
        description: 'Add your suppliers and vendors. Vendor records are used for receiving, purchase orders, and AP bills.',
        icon: Truck,
        href: '/vendors',
      },
      {
        key: 'uom',
        label: 'Units of Measure',
        description: 'Configure UOMs and pack-to-base conversions (e.g., 1 Case = 24 Each). Used in receiving.',
        icon: Ruler,
        // TODO: UOM management UI
      },
      {
        key: 'costing',
        label: 'Costing Method',
        description: 'Set the costing method per item: Weighted Average or Last Cost. This affects how inventory is valued.',
        icon: Calculator,
        href: '/catalog',
      },
      {
        key: 'reorder_levels',
        label: 'Reorder Points & Par Levels',
        description: 'Set minimum stock thresholds. The system alerts you when stock falls below the reorder point.',
        icon: TrendingUp,
        href: '/catalog',
      },
      {
        key: 'opening_balances',
        label: 'Opening Stock Balances',
        description: 'Enter your current on-hand quantities. Create a receiving receipt or manual adjustment for each location.',
        icon: PackageCheck,
        href: '/inventory/receiving',
      },
    ],
  },

  // ── Phase 5: Customer Data ──
  {
    key: 'customers',
    label: 'Customer Data',
    description: 'Import customers, set up memberships and billing',
    icon: UserCircle,
    moduleKey: 'customers',
    steps: [
      {
        key: 'customer_records',
        label: 'Import or Create Customers',
        description: 'Import customer records from a CSV file or add them manually. Visit the Import Dashboard to use the guided import wizard.',
        icon: UserCircle,
        href: '/settings/import',
      },
      {
        key: 'membership_plans',
        label: 'Membership Plans',
        description: 'Create membership tiers with privileges, pricing, and billing cycles. Used for club memberships, loyalty programs.',
        icon: Crown,
        href: '/membership/plans',
      },
      {
        key: 'billing_accounts',
        label: 'Billing Accounts & Credit Limits',
        description: 'Set up house accounts with credit limits, spending caps, and authorized sub-accounts for member billing.',
        icon: CreditCard,
        href: '/customers/billing',
      },
    ],
  },

  // ── Phase 6: Import Your Data ──
  {
    key: 'data_import',
    label: 'Import Your Data',
    description: 'Upload spreadsheets from your current system — we\'ll map your columns automatically',
    icon: Upload,
    steps: [
      {
        key: 'import_overview',
        label: 'Choose Data to Import',
        description: 'Visit the Import Dashboard to see all available data types. Pick one and upload a file.',
        icon: Upload,
        href: '/settings/data-imports',
      },
      {
        key: 'first_import_complete',
        label: 'Complete Your First Import',
        description: 'Successfully import at least one file (customers, products, transactions, or chart of accounts).',
        icon: CheckCircle,
      },
    ],
  },

  // ── Phase 7: Accounting (FULLY WIRED) ──
  {
    key: 'accounting',
    label: 'Accounting',
    description: 'Set up your general ledger, chart of accounts, and GL mappings',
    icon: Landmark,
    moduleKey: 'accounting',
    steps: [
      {
        key: 'bootstrap',
        label: 'Bootstrap Chart of Accounts',
        description: 'Initialize your Chart of Accounts from a template matching your business type. Creates GL accounts, classifications, and default settings.',
        icon: BookOpen,
        href: '/accounting/accounts',
      },
      {
        key: 'import_coa',
        label: 'Import Chart of Accounts',
        description: 'Already have a chart of accounts? Import it from CSV instead of using a template.',
        icon: Upload,
        href: '/accounting/accounts?import=true',
      },
      {
        key: 'control_accounts',
        label: 'Configure Control Accounts',
        description: 'Set which accounts serve as control accounts for AP, AR, Sales Tax, and Retained Earnings.',
        icon: Shield,
        href: '/accounting/settings',
      },
      {
        key: 'mappings',
        label: 'Set Up GL Mappings',
        description: 'Map your POS departments, payment types, and tax groups to GL accounts for automatic posting.',
        icon: ArrowRightLeft,
        href: '/accounting/mappings',
      },
      {
        key: 'bank_accounts',
        label: 'Register Bank Accounts',
        description: 'Add your bank accounts and link them to GL cash accounts. Required for AP payments and AR receipts.',
        icon: Building2,
        href: '/accounting/banking',
      },
      {
        key: 'pos_posting',
        label: 'Enable POS Posting',
        description: 'Turn on automatic posting of POS transactions to the general ledger. Every tender will generate journal entries.',
        icon: Zap,
        href: '/accounting/settings',
      },
    ],
  },

  // ── Phase 7: POS Configuration ──
  {
    key: 'pos_config',
    label: 'POS Configuration',
    description: 'Configure your point-of-sale experience',
    icon: ShoppingCart,
    moduleKey: 'pos_retail',
    steps: [
      {
        key: 'pos_terminal_prefs',
        label: 'Terminal Preferences',
        description: 'Configure receipt headers, footers, and logos for each terminal.',
        icon: Monitor,
        // TODO: terminal config page
      },
      {
        key: 'quick_menu',
        label: 'Quick Menu / Favorites',
        description: 'Set up frequently-used items for fast access on the POS screen.',
        icon: LayoutGrid,
        href: '/pos/retail',
      },
      {
        key: 'drawer_defaults',
        label: 'Drawer Session Defaults',
        description: 'Configure starting drawer amount, cash drop thresholds, and over/short tolerance.',
        icon: DollarSign,
        // TODO: drawer config page
      },
      {
        key: 'tip_config',
        label: 'Tip Prompts',
        description: 'Configure tip suggestion percentages and tip prompt behavior at payment time.',
        icon: DollarSign,
        // TODO: tip config page
      },
    ],
  },

  // ── Phase 8: F&B Setup ──
  {
    key: 'fnb',
    label: 'F&B Setup',
    description: 'Configure floor plans, kitchen display, and restaurant operations',
    icon: UtensilsCrossed,
    moduleKey: 'pos_fnb',
    steps: [
      {
        key: 'floor_plans',
        label: 'Design Floor Plans',
        description: 'Create your restaurant floor layout with tables, sections, and service zones using the drag-and-drop editor.',
        icon: LayoutGrid,
        href: '/settings/room-layouts',
      },
      {
        key: 'sync_tables',
        label: 'Sync Tables from Floor Plan',
        description: 'After publishing a floor plan, sync table objects into the F&B system for service tracking.',
        icon: Warehouse,
        href: '/pos/fnb',
      },
      {
        key: 'kds_stations',
        label: 'KDS Stations',
        description: 'Set up kitchen display stations and configure routing rules for order tickets.',
        icon: ClipboardList,
        href: '/kds',
      },
      {
        key: 'menu_periods',
        label: 'Menu Periods / Dayparts',
        description: 'Define meal periods (Breakfast, Lunch, Dinner, Happy Hour) with availability windows.',
        icon: Timer,
        // TODO: menu periods page
      },
      {
        key: 'allergens',
        label: 'Allergens & Prep Notes',
        description: 'Configure allergen tags and prep note presets for kitchen communication.',
        icon: AlertTriangle,
        // TODO: allergens page
      },
      {
        key: 'tip_pools',
        label: 'Tip Pool Configuration',
        description: 'Set up tip pools with distribution methods (equal, points, hours) for front-of-house staff.',
        icon: Utensils,
        // TODO: tip pools page
      },
    ],
  },

  // ── Phase 9: Spa Management ──
  {
    key: 'spa',
    label: 'Spa Management',
    description: 'Set up services, providers, resources, and online booking for your spa',
    icon: Scissors,
    moduleKey: 'spa',
    steps: [
      {
        key: 'spa_settings',
        label: 'Configure Spa Settings',
        description: 'Set your spa operating hours, booking policies, deposit requirements, and cancellation rules.',
        icon: Scissors,
        href: '/spa/settings',
      },
      {
        key: 'service_categories',
        label: 'Create Service Categories',
        description: 'Organize your spa services into categories (e.g., Massage, Facials, Body Treatments, Nail Services).',
        icon: Tags,
        href: '/spa/services',
      },
      {
        key: 'spa_services',
        label: 'Add Services',
        description: 'Create your spa service menu with pricing, duration, and provider eligibility.',
        icon: ClipboardList,
        href: '/spa/services',
      },
      {
        key: 'spa_providers',
        label: 'Set Up Providers',
        description: 'Add your spa therapists and estheticians, set their availability schedules and service eligibility.',
        icon: Users,
        href: '/spa/providers',
      },
      {
        key: 'spa_resources',
        label: 'Configure Resources',
        description: 'Add treatment rooms, equipment, and other bookable resources that appointments require.',
        icon: Building2,
        href: '/spa/resources',
      },
      {
        key: 'spa_booking',
        label: 'Enable Online Booking',
        description: 'Configure your public booking portal so guests can browse services and book appointments online.',
        icon: Calendar,
        href: '/spa/settings',
      },
      {
        key: 'spa_packages',
        label: 'Create Packages',
        description: 'Build service packages with session bundles, expiration dates, and transferability options.',
        icon: Gift,
        href: '/spa/packages',
      },
      {
        key: 'spa_commissions',
        label: 'Set Up Commissions',
        description: 'Configure commission rules for providers — percentage, flat, tiered, or sliding scale with 6-level priority resolution.',
        icon: DollarSign,
        href: '/spa/commissions',
      },
      {
        key: 'spa_test_appointment',
        label: 'Book a Test Appointment',
        description: 'Create a test appointment to verify the full booking flow: service selection, provider assignment, and checkout.',
        icon: CheckCircle,
        href: '/spa/appointments/new',
      },
    ],
  },

  // ── Phase 10: Reporting & AI ──
  {
    key: 'reporting',
    label: 'Reporting & AI',
    description: 'Configure dashboards, reports, and AI insights',
    icon: BarChart3,
    moduleKey: 'reporting',
    steps: [
      {
        key: 'dashboard_widgets',
        label: 'Dashboard Widgets',
        description: 'Choose which KPI cards and widgets appear on your main dashboard.',
        icon: LayoutDashboard,
        href: '/settings',
      },
      {
        key: 'custom_reports',
        label: 'Custom Reports',
        description: 'Build custom reports with the drag-and-drop report builder. Choose metrics, dimensions, and chart types.',
        icon: FileBarChart,
        href: '/reports/custom',
      },
      {
        key: 'ai_lenses',
        label: 'AI Insights Lenses',
        description: 'Create custom AI lenses that focus analysis on specific areas of your business.',
        icon: Sparkles,
        href: '/insights/lenses',
      },
    ],
  },

  // ── Phase 11: Merchant Services ──
  {
    key: 'merchant_services',
    label: 'Merchant Services',
    description: 'Connect your payment processor and configure card acceptance',
    icon: CreditCard,
    moduleKey: 'payments',
    steps: [
      {
        key: 'add_provider',
        label: 'Add Payment Provider',
        description: 'Register your payment processor (e.g., CardPointe). Enter your API credentials and test the connection.',
        icon: CreditCard,
        href: '/settings/merchant-services',
      },
      {
        key: 'create_mid',
        label: 'Create Merchant Account (MID)',
        description: 'Add your processor-assigned merchant ID. You can create multiple MIDs for different locations or profit centers.',
        icon: Landmark,
        href: '/settings/merchant-services',
      },
      {
        key: 'assign_terminals',
        label: 'Assign Terminals to MIDs',
        description: 'Map each POS terminal to a merchant account so it knows which MID to use for card transactions.',
        icon: Monitor,
        href: '/settings/merchant-services',
      },
      {
        key: 'assign_devices',
        label: 'Register Payment Devices',
        description: 'Register your physical card readers by Hardware Serial Number (HSN) and assign them to POS terminals.',
        icon: Smartphone,
        href: '/settings/merchant-services',
      },
      {
        key: 'test_transaction',
        label: 'Run a Test Transaction',
        description: 'Process a test card payment to verify the full payment flow from terminal to processor.',
        icon: CheckCircle,
        href: '/pos/retail',
      },
    ],
  },

  // ── Phase 12: Go Live Checklist ──
  {
    key: 'go_live',
    label: 'Go Live Checklist',
    description: 'Final checks before taking your first real order',
    icon: Rocket,
    steps: [
      {
        key: 'all_phases_complete',
        label: 'All Setup Phases Complete',
        description: 'Verify that all required setup phases above are marked complete or intentionally skipped.',
        icon: CheckCircle,
      },
      {
        key: 'test_order',
        label: 'Run a Test Order',
        description: 'Place a test order through the POS to verify items, tax calculation, and payment flow.',
        icon: ShoppingCart,
        href: '/pos/retail',
      },
      {
        key: 'verify_gl',
        label: 'Verify GL Posting',
        description: 'If accounting is enabled, confirm that the test order generated the correct journal entries.',
        icon: Scale,
        href: '/accounting/gl',
      },
      {
        key: 'final_review',
        label: 'Final Review',
        description: 'You\'re ready to go live! Review any remaining items and start processing real transactions.',
        icon: Rocket,
      },
    ],
  },
];
