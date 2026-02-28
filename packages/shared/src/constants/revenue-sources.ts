/**
 * Revenue Source Registry
 *
 * Central registry of all revenue sources in the system. Each source
 * populates rm_revenue_activity via event consumers. New modules just
 * add an entry here — no frontend code changes needed.
 */

export interface RevenueSourceDefinition {
  /** DB value stored in rm_revenue_activity.source_sub_type / source */
  key: string;
  /** Full label for filters, e.g. "Retail POS" */
  label: string;
  /** Short label for table cells, e.g. "POS Sale" */
  shortLabel: string;
  /** lucide-react icon name */
  icon: string;
  /** Tailwind color token for badge/dot */
  color: string;
  /** Entitlement module key for visibility gating */
  moduleKey: string;
  /** Display sort order */
  sortOrder: number;
}

export const REVENUE_SOURCES: Record<string, RevenueSourceDefinition> = {
  pos_retail: {
    key: 'pos_retail',
    label: 'Retail POS',
    shortLabel: 'POS Sale',
    icon: 'ShoppingCart',
    color: 'blue',
    moduleKey: 'pos_retail',
    sortOrder: 1,
  },
  pos_fnb: {
    key: 'pos_fnb',
    label: 'F&B POS',
    shortLabel: 'F&B Sale',
    icon: 'UtensilsCrossed',
    color: 'orange',
    moduleKey: 'pos_fnb',
    sortOrder: 2,
  },
  pms_folio: {
    key: 'pms_folio',
    label: 'PMS Folio Charges',
    shortLabel: 'Room Charge',
    icon: 'Building2',
    color: 'purple',
    moduleKey: 'pms',
    sortOrder: 3,
  },
  ar_invoice: {
    key: 'ar_invoice',
    label: 'AR Invoices',
    shortLabel: 'AR Invoice',
    icon: 'FileText',
    color: 'emerald',
    moduleKey: 'ar',
    sortOrder: 4,
  },
  membership: {
    key: 'membership',
    label: 'Membership Charges',
    shortLabel: 'Membership',
    icon: 'CreditCard',
    color: 'amber',
    moduleKey: 'customers',
    sortOrder: 5,
  },
  voucher: {
    key: 'voucher',
    label: 'Vouchers',
    shortLabel: 'Voucher Sale',
    icon: 'Ticket',
    color: 'pink',
    moduleKey: 'orders',
    sortOrder: 6,
  },
  voucher_redemption: {
    key: 'voucher_redemption',
    label: 'Voucher Redemptions',
    shortLabel: 'Voucher Redeem',
    icon: 'TicketCheck',
    color: 'teal',
    moduleKey: 'orders',
    sortOrder: 7,
  },
  voucher_expiration: {
    key: 'voucher_expiration',
    label: 'Voucher Expirations',
    shortLabel: 'Voucher Expired',
    icon: 'TicketX',
    color: 'rose',
    moduleKey: 'orders',
    sortOrder: 8,
  },
  pos_return: {
    key: 'pos_return',
    label: 'POS Returns',
    shortLabel: 'Return',
    icon: 'RotateCcw',
    color: 'red',
    moduleKey: 'orders',
    sortOrder: 9,
  },
};

/** Get a source definition by key, falling back to a generic entry */
export function getSourceDef(key: string): RevenueSourceDefinition {
  return REVENUE_SOURCES[key] ?? {
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    shortLabel: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: 'CircleDot',
    color: 'gray',
    moduleKey: key,
    sortOrder: 99,
  };
}

/** Get source definitions sorted by sortOrder */
export function getSortedSources(): RevenueSourceDefinition[] {
  return Object.values(REVENUE_SOURCES).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** All valid source keys */
export const REVENUE_SOURCE_KEYS = Object.keys(REVENUE_SOURCES);
