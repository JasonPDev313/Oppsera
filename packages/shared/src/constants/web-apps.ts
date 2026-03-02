export type WebAppCategory = 'customer_facing' | 'staff_tools' | 'integrations';
export type WebAppStatus = 'active' | 'coming_soon';
export type WebAppUrlSource = 'env' | 'origin';

export interface WebAppDefinition {
  /** Unique identifier */
  key: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Lucide icon name (resolved in frontend) */
  icon: string;
  /** Grouping category */
  category: WebAppCategory;
  /** Module keys shown as tags on the card */
  associatedModules: string[];
  /** At least one must be enabled for the app to be visible */
  requiredModules: string[];
  /** How to resolve the app URL */
  urlSource: WebAppUrlSource;
  /** Env var name when urlSource === 'env' */
  envVar?: string;
  /** Path suffix when urlSource === 'origin' */
  urlPath?: string;
  /** Help text when the app is active */
  helpTextActive?: string;
  /** Help text when the app is not configured */
  helpTextNotConfigured?: string;
  /** Sort order within category */
  sortOrder: number;
  /** Default availability status */
  defaultStatus: WebAppStatus;
  /** Dashboard route for configuring this app's settings */
  settingsRoute?: string;
}

export const WEB_APP_REGISTRY: readonly WebAppDefinition[] = [
  // ── CUSTOMER-FACING ─────────────────────────────────────────
  {
    key: 'member-portal',
    name: 'Member Portal',
    description: 'Self-service portal for members — billing, statements, spending analysis.',
    icon: 'UserCircle',
    category: 'customer_facing',
    associatedModules: ['customers', 'club_membership'],
    requiredModules: ['customers'],
    urlSource: 'env',
    envVar: 'NEXT_PUBLIC_MEMBER_PORTAL_URL',
    helpTextActive: 'Members can access their account, view statements, and manage autopay.',
    helpTextNotConfigured: 'Set the NEXT_PUBLIC_MEMBER_PORTAL_URL environment variable to enable.',
    sortOrder: 10,
    defaultStatus: 'active',
  },
  {
    key: 'pay-at-table',
    name: 'Pay at Table',
    description: 'QR code payment — guests scan to view check, add tip, and pay.',
    icon: 'QrCode',
    category: 'customer_facing',
    associatedModules: ['pos_fnb', 'pos_retail', 'payments'],
    requiredModules: ['payments'],
    urlSource: 'origin',
    urlPath: '/pay',
    helpTextActive: 'Guests scan QR codes to view their check and pay from their phone.',
    sortOrder: 20,
    defaultStatus: 'active',
  },
  {
    key: 'guest-waitlist',
    name: 'Guest Waitlist',
    description: 'Public waitlist — guests join and track their position in real time.',
    icon: 'ClipboardList',
    category: 'customer_facing',
    associatedModules: ['pos_fnb'],
    requiredModules: ['pos_fnb'],
    urlSource: 'origin',
    urlPath: '/waitlist',
    helpTextActive: 'Guests can join the waitlist and see their position from their phone.',
    sortOrder: 30,
    defaultStatus: 'active',
  },
  {
    key: 'online-shop',
    name: 'Online Shop',
    description: 'E-commerce storefront for retail items and gift cards.',
    icon: 'ShoppingCart',
    category: 'customer_facing',
    associatedModules: ['catalog', 'pos_retail'],
    requiredModules: ['catalog'],
    sortOrder: 40,
    defaultStatus: 'coming_soon',
    urlSource: 'origin',
  },
  {
    key: 'event-registration',
    name: 'Event Registration',
    description: 'Public event sign-up, ticketing, and guest management.',
    icon: 'CalendarCheck',
    category: 'customer_facing',
    associatedModules: ['customers'],
    requiredModules: ['customers'],
    sortOrder: 50,
    defaultStatus: 'coming_soon',
    urlSource: 'origin',
  },
  {
    key: 'guest-portal',
    name: 'Guest Portal',
    description: 'Pre-check-in, folio review, and self-service for hotel guests.',
    icon: 'Hotel',
    category: 'customer_facing',
    associatedModules: ['pms'],
    requiredModules: ['pms'],
    sortOrder: 60,
    defaultStatus: 'coming_soon',
    urlSource: 'origin',
  },
  {
    key: 'online-booking',
    name: 'Online Booking',
    description: 'Appointment scheduling and service booking for spa and wellness.',
    icon: 'CalendarDays',
    category: 'customer_facing',
    associatedModules: ['spa'],
    requiredModules: ['spa'],
    sortOrder: 70,
    defaultStatus: 'active',
    urlSource: 'origin',
    urlPath: '/book/{tenantSlug}/spa',
    helpTextActive: 'Guests can browse services, select providers, and book appointments online. Embed this on your website with an iframe.',
    settingsRoute: '/spa/booking',
  },
  {
    key: 'reservation-portal',
    name: 'Reservation Portal',
    description: 'Online table reservations with real-time availability.',
    icon: 'UtensilsCrossed',
    category: 'customer_facing',
    associatedModules: ['pos_fnb'],
    requiredModules: ['pos_fnb'],
    sortOrder: 80,
    defaultStatus: 'coming_soon',
    urlSource: 'origin',
  },

  // ── STAFF TOOLS ─────────────────────────────────────────────
  {
    key: 'kds-display',
    name: 'KDS Display',
    description: 'Kitchen display screen — ticket queue, bump bar, timers.',
    icon: 'Monitor',
    category: 'staff_tools',
    associatedModules: ['kds'],
    requiredModules: ['kds'],
    urlSource: 'origin',
    urlPath: '/kds',
    helpTextActive: 'Open on a kitchen display to show ticket queue with bump controls.',
    sortOrder: 10,
    defaultStatus: 'active',
  },
  {
    key: 'expo-display',
    name: 'Expo Display',
    description: 'Expeditor screen — cross-station order readiness and plating.',
    icon: 'LayoutGrid',
    category: 'staff_tools',
    associatedModules: ['kds'],
    requiredModules: ['kds'],
    urlSource: 'origin',
    urlPath: '/expo',
    helpTextActive: 'Open on the expo station to coordinate cross-station order assembly.',
    sortOrder: 20,
    defaultStatus: 'active',
  },
  {
    key: 'host-stand',
    name: 'Host Stand',
    description: 'Waitlist, reservations, table assignments, and guest notifications.',
    icon: 'DoorOpen',
    category: 'staff_tools',
    associatedModules: ['pos_fnb'],
    requiredModules: ['pos_fnb'],
    urlSource: 'origin',
    urlPath: '/host',
    helpTextActive: 'Open on the host stand tablet for waitlist and seating management.',
    sortOrder: 30,
    defaultStatus: 'active',
  },
] as const;

export type WebAppKey = (typeof WEB_APP_REGISTRY)[number]['key'];

export const WEB_APP_CATEGORY_LABELS: Record<WebAppCategory, string> = {
  customer_facing: 'Customer-Facing',
  staff_tools: 'Staff Tools',
  integrations: 'Integrations',
};

/** Look up a single web app by key */
export function getWebApp(key: string): WebAppDefinition | undefined {
  return WEB_APP_REGISTRY.find((a) => a.key === key);
}

/** Get all web apps sorted by category then sortOrder */
export function getSortedWebApps(): WebAppDefinition[] {
  const categoryOrder: WebAppCategory[] = ['customer_facing', 'staff_tools', 'integrations'];
  return [...WEB_APP_REGISTRY].sort((a, b) => {
    const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    if (catDiff !== 0) return catDiff;
    return a.sortOrder - b.sortOrder;
  });
}

/** Get the unique set of module keys referenced across all web apps */
export function getWebAppModuleKeys(): string[] {
  const keys = new Set<string>();
  for (const app of WEB_APP_REGISTRY) {
    for (const m of app.associatedModules) keys.add(m);
  }
  return [...keys];
}

/** Get web apps that list a given module in associatedModules */
export function getWebAppsByModule(moduleKey: string): WebAppDefinition[] {
  return WEB_APP_REGISTRY.filter((a) => a.associatedModules.includes(moduleKey));
}

/** Get web apps in a given category, sorted by sortOrder */
export function getWebAppsByCategory(category: WebAppCategory): WebAppDefinition[] {
  return WEB_APP_REGISTRY.filter((a) => a.category === category).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}
