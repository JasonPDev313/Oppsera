/**
 * Host Module Feature Roadmap — UserStory-ID Registry
 *
 * Naming convention: US-HOST-{CATEGORY}-{SEQ}
 * Categories:
 *   SMS      — Outbound/inbound SMS via Twilio or similar
 *   AI       — ML/AI-powered predictions and demand forecasting
 *   CHANNEL  — Third-party reservation channel integrations
 *   LOYALTY  — Loyalty program integration at host stand
 *   RT       — Real-time WebSocket/SSE communication
 *   OFFLINE  — Offline/degraded mode for connectivity loss
 *   PICKUP   — Pickup/takeout handoff and arrival tracking
 *   DEPOSIT  — Payment gateway integration for reservation deposits
 */

export interface FeatureStory {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: 'high' | 'medium' | 'low';
  targetPhase: string;
}

export const HOST_FEATURE_ROADMAP: FeatureStory[] = [
  // ── SMS ────────────────────────────────────────────────
  {
    id: 'US-HOST-SMS-01',
    title: 'Outbound SMS Delivery',
    description:
      'Send real SMS notifications via Twilio (table ready, reservation confirmation, reminders). Currently uses console logging in development.',
    category: 'SMS',
    priority: 'high',
    targetPhase: 'V2 — Requires Twilio account + phone number provisioning',
  },
  {
    id: 'US-HOST-SMS-02',
    title: 'Inbound SMS Keyword Routing',
    description:
      'Process guest replies via SMS keywords: "HERE" (arrival notification), "HELP" (support routing), "CANCEL" (self-service cancellation). Requires Twilio webhook endpoint.',
    category: 'SMS',
    priority: 'medium',
    targetPhase: 'V2 — Requires Twilio webhook + keyword parser',
  },

  // ── AI ─────────────────────────────────────────────────
  {
    id: 'US-HOST-AI-01',
    title: 'ML Demand Forecasting',
    description:
      'Predict covers by hour/day using historical data, weather, events, and seasonality. Powers optimal staffing recommendations and pacing adjustments.',
    category: 'AI',
    priority: 'medium',
    targetPhase: 'V3 — Requires ML model training pipeline + 90+ days historical data',
  },
  {
    id: 'US-HOST-AI-02',
    title: 'No-Show Prediction',
    description:
      'Score each reservation with a no-show probability based on guest history, party size, day of week, and booking lead time. Auto-overbook when confidence is high.',
    category: 'AI',
    priority: 'low',
    targetPhase: 'V3 — Requires sufficient historical no-show data for model accuracy',
  },
  {
    id: 'US-HOST-AI-03',
    title: 'Smart Wait Time (ML)',
    description:
      'Enhance wait time estimation with ML model trained on actual turn times, kitchen ticket velocity, and real-time course pacing. Current estimation uses weighted historical averages.',
    category: 'AI',
    priority: 'low',
    targetPhase: 'V3 — Current weighted-average estimator covers 80% of use cases',
  },

  // ── CHANNEL ────────────────────────────────────────────
  {
    id: 'US-HOST-CHANNEL-01',
    title: 'Google Reserve Integration',
    description:
      'Sync availability and accept reservations from Google Maps / Search "Reserve a Table" button. Two-way sync of bookings and cancellations.',
    category: 'CHANNEL',
    priority: 'high',
    targetPhase: 'V2 — Requires Google Reserve API partner enrollment',
  },
  {
    id: 'US-HOST-CHANNEL-02',
    title: 'OpenTable Sync',
    description:
      'Bidirectional reservation sync with OpenTable. Import bookings, push availability, handle cancellations and modifications across both systems.',
    category: 'CHANNEL',
    priority: 'medium',
    targetPhase: 'V2 — Requires OpenTable Connect API credentials',
  },
  {
    id: 'US-HOST-CHANNEL-03',
    title: 'Yelp Reservations Sync',
    description:
      'Sync reservations from Yelp guest management. Import bookings and guest contact info, push real-time table availability.',
    category: 'CHANNEL',
    priority: 'low',
    targetPhase: 'V3 — Lower priority than Google Reserve and OpenTable',
  },
  {
    id: 'US-HOST-CHANNEL-04',
    title: 'Public Reservation Widget',
    description:
      'Embeddable reservation form for the venue website. Guests select date, time, party size, and special requests. Respects pacing rules and availability.',
    category: 'CHANNEL',
    priority: 'high',
    targetPhase: 'V2 — Guest self-service infrastructure exists, needs public-facing form',
  },

  // ── LOYALTY ────────────────────────────────────────────
  {
    id: 'US-HOST-LOYALTY-01',
    title: 'Loyalty Tier Recognition',
    description:
      'Display member loyalty tier (Gold, Platinum, etc.) on waitlist and reservation cards. Auto-apply VIP status and seating preferences based on tier.',
    category: 'LOYALTY',
    priority: 'medium',
    targetPhase: 'V2 — Customer module has loyalty schema, needs host stand integration',
  },
  {
    id: 'US-HOST-LOYALTY-02',
    title: 'Points Redemption at Check-In',
    description:
      'Allow members to redeem loyalty points for priority seating, complimentary items, or deposit waivers during the check-in process.',
    category: 'LOYALTY',
    priority: 'low',
    targetPhase: 'V3 — Requires loyalty program configuration per venue',
  },

  // ── RT ─────────────────────────────────────────────────
  {
    id: 'US-HOST-RT-01',
    title: 'Real-Time Floor Plan Updates',
    description:
      'WebSocket-based live floor plan sync across multiple host stand devices. Table status changes appear instantly without polling. Currently polls every 15-30 seconds.',
    category: 'RT',
    priority: 'high',
    targetPhase: 'V2 — Requires WebSocket infrastructure (Stage 2+)',
  },
  {
    id: 'US-HOST-RT-02',
    title: 'Kitchen-to-Host Communication',
    description:
      'Server-Sent Events stream from KDS to host stand: course progress, table turn predictions, dessert-fired alerts for turnover timing.',
    category: 'RT',
    priority: 'medium',
    targetPhase: 'V2 — Requires SSE endpoint + KDS event forwarding',
  },

  // ── OFFLINE ────────────────────────────────────────────
  {
    id: 'US-HOST-OFFLINE-01',
    title: 'Offline Waitlist Management',
    description:
      'Continue managing the waitlist during internet outages. Queue operations locally and sync when connectivity is restored. Conflict resolution for concurrent edits.',
    category: 'OFFLINE',
    priority: 'medium',
    targetPhase: 'V2 — Offline queue infrastructure designed but not wired',
  },
  {
    id: 'US-HOST-OFFLINE-02',
    title: 'Local Data Persistence',
    description:
      'Cache floor plan, reservations, and waitlist in IndexedDB for instant load on app restart. Graceful degradation when API is unreachable.',
    category: 'OFFLINE',
    priority: 'medium',
    targetPhase: 'V2 — Service worker + IndexedDB storage layer',
  },

  // ── PICKUP ─────────────────────────────────────────────
  {
    id: 'US-HOST-PICKUP-01',
    title: 'Pickup Order Tracking Board',
    description:
      'Dedicated view for takeout/pickup orders with ETA countdown, order status, and customer name. Hosts can mark orders as "Ready for Pickup" and track guest arrivals.',
    category: 'PICKUP',
    priority: 'medium',
    targetPhase: 'V2 — Requires order module pickup status tracking',
  },
  {
    id: 'US-HOST-PICKUP-02',
    title: '"HERE" Arrival Flow',
    description:
      'Guest texts "HERE" or checks in via app → host stand shows arrival alert with order summary → host confirms handoff → order marked complete.',
    category: 'PICKUP',
    priority: 'medium',
    targetPhase: 'V2 — Requires US-HOST-SMS-02 (inbound SMS) + order status sync',
  },

  // ── DEPOSIT ────────────────────────────────────────────
  {
    id: 'US-HOST-DEPOSIT-01',
    title: 'Reservation Deposit Collection',
    description:
      'Charge deposits at booking time via CardPointe gateway. Settings UI exists (amounts, refund policy, no-show fees) but payment processing is not connected.',
    category: 'DEPOSIT',
    priority: 'high',
    targetPhase: 'V2 — Payment gateway foundation exists, needs reservation booking hook',
  },
];

/** Group stories by category for display */
export function getStoriesByCategory(): Record<string, FeatureStory[]> {
  const grouped: Record<string, FeatureStory[]> = {};
  for (const story of HOST_FEATURE_ROADMAP) {
    if (!grouped[story.category]) grouped[story.category] = [];
    grouped[story.category]!.push(story);
  }
  return grouped;
}

/** Get a single story by ID */
export function getStory(id: string): FeatureStory | undefined {
  return HOST_FEATURE_ROADMAP.find((s) => s.id === id);
}

/** Category display labels */
export const CATEGORY_LABELS: Record<string, string> = {
  SMS: 'SMS Messaging',
  AI: 'AI & Machine Learning',
  CHANNEL: 'Reservation Channels',
  LOYALTY: 'Loyalty Integration',
  RT: 'Real-Time Sync',
  OFFLINE: 'Offline Mode',
  PICKUP: 'Pickup & Takeout',
  DEPOSIT: 'Deposit Collection',
};

/** Category icons (lucide-react icon names) */
export const CATEGORY_ICONS: Record<string, string> = {
  SMS: 'MessageSquare',
  AI: 'Brain',
  CHANNEL: 'Globe',
  LOYALTY: 'Award',
  RT: 'Zap',
  OFFLINE: 'WifiOff',
  PICKUP: 'ShoppingBag',
  DEPOSIT: 'CreditCard',
};
