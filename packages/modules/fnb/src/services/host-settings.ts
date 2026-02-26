import { z } from 'zod';

// ── Host Settings Schema ───────────────────────────────────────
// Comprehensive host stand configuration informed by competitor
// platforms (OpenTable, Resy, Yelp Guest Manager, Toast Tables,
// SevenRooms, Eat App, Hostme, TouchBistro).

export const hostSettingsSchema = z.object({
  // ── Reservations ──────────────────────────────────────────
  reservations: z.object({
    slotMinutes: z.number().min(15).max(60).default(30),
    maxPartySize: z.number().min(1).max(99).default(20),
    advanceBookingDays: z.number().min(1).max(365).default(30),
    sameDayEnabled: z.boolean().default(true),
    requirePhone: z.boolean().default(false),
    requireEmail: z.boolean().default(false),
    allowSpecialRequests: z.boolean().default(true),
    confirmationRequired: z.boolean().default(false),
    autoConfirmUpToParty: z.number().min(0).max(99).default(0),
    defaultDurationMinutes: z.object({
      breakfast: z.number().default(45),
      brunch: z.number().default(60),
      lunch: z.number().default(60),
      dinner: z.number().default(90),
    }).default({}),
    bufferMinutes: z.number().min(0).max(30).default(10),
    overbookPercent: z.number().min(0).max(50).default(0),
    minLeadTimeMinutes: z.number().min(0).max(1440).default(60),
  }).default({}),

  // ── Pacing & Capacity ─────────────────────────────────────
  pacing: z.object({
    enabled: z.boolean().default(false),
    coversPerInterval: z.number().min(1).max(200).default(20),
    intervalMinutes: z.number().min(15).max(60).default(15),
    onlinePacingPercent: z.number().min(0).max(100).default(50),
    perMealPeriod: z.object({
      breakfast: z.object({ maxCovers: z.number().default(0), maxReservations: z.number().default(0) }).default({}),
      brunch: z.object({ maxCovers: z.number().default(0), maxReservations: z.number().default(0) }).default({}),
      lunch: z.object({ maxCovers: z.number().default(0), maxReservations: z.number().default(0) }).default({}),
      dinner: z.object({ maxCovers: z.number().default(0), maxReservations: z.number().default(0) }).default({}),
    }).default({}),
  }).default({}),

  // ── Waitlist ──────────────────────────────────────────────
  waitlist: z.object({
    maxSize: z.number().min(1).max(200).default(50),
    noShowGraceMinutes: z.number().min(5).max(60).default(15),
    notifyExpiryMinutes: z.number().min(3).max(30).default(10),
    autoRemoveAfterExpiryMinutes: z.number().min(5).max(60).default(15),
    allowQuotedTime: z.boolean().default(true),
    priorityEnabled: z.boolean().default(false),
    priorityTags: z.array(z.string()).default(['VIP', 'Regular', 'First Time']),
    requirePartySize: z.boolean().default(true),
    maxWaitMinutes: z.number().min(15).max(240).default(120),
  }).default({}),

  // ── Turn Time & Estimation ────────────────────────────────
  estimation: z.object({
    enabled: z.boolean().default(true),
    defaultTurnMinutes: z.object({
      small: z.number().default(45),
      medium: z.number().default(60),
      large: z.number().default(75),
      xlarge: z.number().default(90),
    }).default({}),
    byTableType: z.object({
      bar: z.number().min(0).default(0),
      booth: z.number().min(0).default(0),
      patio: z.number().min(0).default(0),
      highTop: z.number().min(0).default(0),
    }).default({}),
    dayOfWeekMultiplier: z.object({
      sun: z.number().min(0.5).max(2.0).default(1.0),
      mon: z.number().min(0.5).max(2.0).default(1.0),
      tue: z.number().min(0.5).max(2.0).default(1.0),
      wed: z.number().min(0.5).max(2.0).default(1.0),
      thu: z.number().min(0.5).max(2.0).default(1.0),
      fri: z.number().min(0.5).max(2.0).default(1.15),
      sat: z.number().min(0.5).max(2.0).default(1.15),
    }).default({}),
    useHistoricalData: z.boolean().default(true),
    historicalWeight: z.number().min(0).max(1).default(0.7),
  }).default({ defaultTurnMinutes: {}, byTableType: {}, dayOfWeekMultiplier: {} }),

  // ── Deposits & No-Show Protection ─────────────────────────
  deposits: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(['per_person', 'flat', 'percentage']).default('per_person'),
    amountCents: z.number().min(0).default(2500),
    percentOfEstimate: z.number().min(0).max(100).default(0),
    minPartySizeForDeposit: z.number().min(1).max(99).default(6),
    refundableUntilHoursBefore: z.number().min(0).max(72).default(24),
    noShowFeeEnabled: z.boolean().default(false),
    noShowFeeCents: z.number().min(0).default(2500),
    lateCancellationEnabled: z.boolean().default(false),
    lateCancellationHoursBefore: z.number().min(1).max(72).default(4),
    lateCancellationFeeCents: z.number().min(0).default(1500),
  }).default({}),

  // ── Notifications ─────────────────────────────────────────
  notifications: z.object({
    smsEnabled: z.boolean().default(false),
    emailEnabled: z.boolean().default(true),
    autoConfirmation: z.boolean().default(false),
    autoReminder: z.boolean().default(false),
    reminderHoursBefore: z.number().min(1).max(48).default(4),
    secondReminderHoursBefore: z.number().min(0).max(24).default(0),
    smsFromNumber: z.string().nullable().default(null),
    templates: z.object({
      confirmationSms: z.string().default('Hi {guest_name}, your reservation for {party_size} at {restaurant_name} on {date} at {time} is confirmed.'),
      confirmationEmail: z.string().default('Your reservation is confirmed for {party_size} guests on {date} at {time}.'),
      reminderSms: z.string().default('Reminder: Your reservation at {restaurant_name} is tomorrow at {time} for {party_size} guests.'),
      waitlistReadySms: z.string().default('Hi {guest_name}, your table is ready at {restaurant_name}! Please check in within {expiry_minutes} minutes.'),
      waitlistAddedSms: z.string().default('Hi {guest_name}, you\'ve been added to the waitlist at {restaurant_name}. Estimated wait: {wait_time}.'),
      cancellationSms: z.string().default('Your reservation at {restaurant_name} on {date} at {time} has been cancelled.'),
      noShowSms: z.string().default(''),
    }).default({}),
    waitlistReadyAlert: z.boolean().default(true),
    sendOnCancellation: z.boolean().default(true),
    sendOnModification: z.boolean().default(true),
  }).default({}),

  // ── Table Management ──────────────────────────────────────
  tableManagement: z.object({
    autoAssignEnabled: z.boolean().default(false),
    allowCombinations: z.boolean().default(true),
    maxCombinedTables: z.number().min(2).max(10).default(4),
    holdTimeMinutes: z.number().min(5).max(30).default(15),
    lateArrivalGraceMinutes: z.number().min(5).max(30).default(15),
    autoReleaseAfterGraceMinutes: z.number().min(0).max(60).default(0),
    preferenceWeights: z.object({
      capacityFit: z.number().min(0).max(1).default(0.4),
      seatingPreference: z.number().min(0).max(1).default(0.2),
      serverBalance: z.number().min(0).max(1).default(0.3),
      vipPreference: z.number().min(0).max(1).default(0.1),
    }).default({}),
    minCapacityUtilization: z.number().min(0).max(1).default(0.5),
    maxCapacityOverflow: z.number().min(0).max(4).default(2),
  }).default({}),

  // ── Server Rotation ───────────────────────────────────────
  serverRotation: z.object({
    method: z.enum(['round_robin', 'cover_balance', 'manual']).default('round_robin'),
    trackCoversPerServer: z.boolean().default(true),
    maxCoverDifference: z.number().min(0).max(50).default(10),
    skipCutServers: z.boolean().default(true),
    rebalanceOnCut: z.boolean().default(false),
  }).default({}),

  // ── Guest Self-Service ────────────────────────────────────
  guestSelfService: z.object({
    waitlistEnabled: z.boolean().default(false),
    reservationEnabled: z.boolean().default(false),
    qrCodeEnabled: z.boolean().default(false),
    showMenuWhileWaiting: z.boolean().default(true),
    showEstimatedWait: z.boolean().default(true),
    showQueuePosition: z.boolean().default(false),
    allowCancellation: z.boolean().default(true),
    requirePhoneVerification: z.boolean().default(false),
  }).default({}),

  // ── Schedule & Exceptions ─────────────────────────────────
  schedule: z.object({
    blackoutDates: z.array(z.string()).default([]),
    specialHours: z.array(z.object({
      date: z.string(),
      label: z.string().default(''),
      overrides: z.object({
        breakfast: z.object({ start: z.string(), end: z.string() }).nullable().default(null),
        brunch: z.object({ start: z.string(), end: z.string() }).nullable().default(null),
        lunch: z.object({ start: z.string(), end: z.string() }).nullable().default(null),
        dinner: z.object({ start: z.string(), end: z.string() }).nullable().default(null),
      }),
    })).default([]),
    closedDays: z.array(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).default([]),
    holidayAutoClose: z.boolean().default(false),
  }).default({}),

  // ── Display Options ───────────────────────────────────────
  display: z.object({
    defaultView: z.enum(['map', 'grid']).default('map'),
    showElapsedTime: z.boolean().default(true),
    showServerOnTables: z.boolean().default(true),
    showCoverCount: z.boolean().default(true),
    showTableStatus: z.boolean().default(true),
    autoSelectMealPeriod: z.boolean().default(true),
    colorCodeByStatus: z.boolean().default(true),
    colorCodeByServer: z.boolean().default(false),
    compactMode: z.boolean().default(false),
    refreshIntervalSeconds: z.number().min(5).max(120).default(30),
    mealPeriodSchedule: z.object({
      breakfast: z.object({ start: z.string().default('06:00'), end: z.string().default('10:30') }).default({}),
      brunch: z.object({ start: z.string().default('10:00'), end: z.string().default('14:00') }).default({}),
      lunch: z.object({ start: z.string().default('11:00'), end: z.string().default('15:00') }).default({}),
      dinner: z.object({ start: z.string().default('17:00'), end: z.string().default('22:00') }).default({}),
    }).default({}),
  }).default({}),

  // ── Sounds & Alerts ───────────────────────────────────────
  alerts: z.object({
    soundEnabled: z.boolean().default(true),
    newReservationSound: z.boolean().default(true),
    waitlistEntrySound: z.boolean().default(true),
    tableReadySound: z.boolean().default(true),
    noShowAlertMinutes: z.number().min(5).max(30).default(15),
    capacityWarningPercent: z.number().min(50).max(100).default(90),
    longWaitAlertMinutes: z.number().min(15).max(120).default(45),
    overdueReservationMinutes: z.number().min(5).max(30).default(10),
  }).default({}),

  // ── Guest Tags & Custom Fields ────────────────────────────
  guestProfile: z.object({
    enableTags: z.boolean().default(true),
    defaultTags: z.array(z.string()).default(['VIP', 'Regular', 'First Time', 'Birthday', 'Anniversary', 'Allergy', 'High Chair']),
    occasionOptions: z.array(z.string()).default(['Birthday', 'Anniversary', 'Date Night', 'Business', 'Celebration', 'Holiday']),
    seatingPreferences: z.array(z.string()).default(['Indoor', 'Outdoor', 'Bar', 'Booth', 'Window', 'Quiet', 'High Top']),
    trackVisitHistory: z.boolean().default(true),
    showGuestNotes: z.boolean().default(true),
  }).default({}),
});

export type HostSettings = z.infer<typeof hostSettingsSchema>;
export type HostSettingsInput = z.input<typeof hostSettingsSchema>;

export function getDefaultHostSettings(): HostSettings {
  return hostSettingsSchema.parse({});
}

/** Deep-merge partial updates into existing settings (2 levels deep) */
export function mergeHostSettings(
  existing: HostSettings,
  updates: Partial<HostSettingsInput>,
): HostSettings {
  const merged: Record<string, unknown> = { ...existing };
  for (const [sectionKey, sectionValue] of Object.entries(updates)) {
    if (sectionValue === undefined || sectionValue === null || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) continue;
    const existingSection = (existing as Record<string, unknown>)[sectionKey];
    if (!existingSection || typeof existingSection !== 'object' || Array.isArray(existingSection)) {
      merged[sectionKey] = sectionValue;
      continue;
    }
    // Deep merge: for each field in the update section, if both old and new are plain objects, merge one more level
    const mergedSection: Record<string, unknown> = { ...(existingSection as Record<string, unknown>) };
    for (const [fieldKey, fieldValue] of Object.entries(sectionValue as Record<string, unknown>)) {
      const existingField = mergedSection[fieldKey];
      if (
        fieldValue !== null && typeof fieldValue === 'object' && !Array.isArray(fieldValue) &&
        existingField !== null && typeof existingField === 'object' && !Array.isArray(existingField)
      ) {
        mergedSection[fieldKey] = { ...(existingField as Record<string, unknown>), ...(fieldValue as Record<string, unknown>) };
      } else {
        mergedSection[fieldKey] = fieldValue;
      }
    }
    merged[sectionKey] = mergedSection;
  }
  return hostSettingsSchema.parse(merged);
}
