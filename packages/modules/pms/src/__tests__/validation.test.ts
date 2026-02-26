import { describe, it, expect } from 'vitest';
import {
  createPropertySchema,
  updatePropertySchema,
  createRoomTypeSchema,
  createRoomSchema,
  updateRoomStatusSchema,
  setRatePlanPriceSchema,
  createGuestSchema,
  createReservationSchema,
  updateReservationSchema,
  cancelReservationSchema,
  calendarMoveSchema,
  calendarResizeSchema,
  checkInSchema,
  checkOutSchema,
  postFolioEntrySchema,
  setRateRestrictionsSchema,
  clearRateRestrictionsSchema,
  savePaymentMethodSchema,
  chargeCardSchema,
  createDepositPolicySchema,
  createCancellationPolicySchema,
  createMessageTemplateSchema,
  logCommunicationSchema,
  assignHousekeepingSchema,
  createWorkOrderSchema,
  updateWorkOrderSchema,
  createGroupSchema,
  setGroupRoomBlocksSchema,
  pickUpGroupRoomSchema,
  createCorporateAccountSchema,
  createPricingRuleSchema,
  pricingConditionsSchema,
  pricingAdjustmentsSchema,
  createChannelSchema,
  syncChannelSchema,
  updateBookingEngineConfigSchema,
  updateRoomAssignmentPreferencesSchema,
  createGuestPortalSessionSchema,
  createLoyaltyProgramSchema,
  earnLoyaltyPointsSchema,
  redeemLoyaltyPointsSchema,
  adjustLoyaltyPointsSchema,
} from '../validation';

// ── Property Schemas ────────────────────────────────────────────

describe('createPropertySchema', () => {
  const valid = { name: 'Grand Hotel', timezone: 'America/New_York' };

  it('accepts valid input with defaults', () => {
    const result = createPropertySchema.parse(valid);
    expect(result.name).toBe('Grand Hotel');
    expect(result.currency).toBe('USD');
    expect(result.checkInTime).toBe('15:00');
    expect(result.checkOutTime).toBe('11:00');
    expect(result.nightAuditTime).toBe('03:00');
    expect(result.taxRatePct).toBe(0);
  });

  it('rejects empty name', () => {
    expect(() => createPropertySchema.parse({ ...valid, name: '' })).toThrow();
  });

  it('rejects name over 200 chars', () => {
    expect(() => createPropertySchema.parse({ ...valid, name: 'x'.repeat(201) })).toThrow();
  });

  it('rejects missing timezone', () => {
    expect(() => createPropertySchema.parse({ name: 'Hotel' })).toThrow();
  });

  it('rejects invalid currency length', () => {
    expect(() => createPropertySchema.parse({ ...valid, currency: 'US' })).toThrow();
    expect(() => createPropertySchema.parse({ ...valid, currency: 'USDD' })).toThrow();
  });

  it('rejects invalid time format', () => {
    expect(() => createPropertySchema.parse({ ...valid, checkInTime: '3pm' })).toThrow();
  });

  it('rejects tax rate out of range', () => {
    expect(() => createPropertySchema.parse({ ...valid, taxRatePct: -1 })).toThrow();
    expect(() => createPropertySchema.parse({ ...valid, taxRatePct: 101 })).toThrow();
  });
});

describe('updatePropertySchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(() => updatePropertySchema.parse({})).not.toThrow();
  });

  it('accepts partial updates', () => {
    const result = updatePropertySchema.parse({ name: 'New Name', taxRatePct: 8.5 });
    expect(result.name).toBe('New Name');
    expect(result.taxRatePct).toBe(8.5);
  });
});

// ── Room Type Schemas ───────────────────────────────────────────

describe('createRoomTypeSchema', () => {
  const valid = { propertyId: 'prop-1', code: 'STD', name: 'Standard' };

  it('accepts valid input with defaults', () => {
    const result = createRoomTypeSchema.parse(valid);
    expect(result.maxAdults).toBe(2);
    expect(result.maxChildren).toBe(0);
    expect(result.maxOccupancy).toBe(2);
    expect(result.sortOrder).toBe(0);
  });

  it('accepts bedsJson array', () => {
    const result = createRoomTypeSchema.parse({
      ...valid,
      bedsJson: [{ type: 'king', count: 1 }],
    });
    expect(result.bedsJson).toHaveLength(1);
  });

  it('rejects code over 20 chars', () => {
    expect(() => createRoomTypeSchema.parse({ ...valid, code: 'x'.repeat(21) })).toThrow();
  });

  it('rejects maxAdults < 1', () => {
    expect(() => createRoomTypeSchema.parse({ ...valid, maxAdults: 0 })).toThrow();
  });

  it('rejects negative maxChildren', () => {
    expect(() => createRoomTypeSchema.parse({ ...valid, maxChildren: -1 })).toThrow();
  });
});

// ── Room Schemas ────────────────────────────────────────────────

describe('createRoomSchema', () => {
  const valid = { propertyId: 'p1', roomTypeId: 'rt1', roomNumber: '101' };

  it('accepts valid input', () => {
    expect(() => createRoomSchema.parse(valid)).not.toThrow();
  });

  it('rejects missing roomNumber', () => {
    expect(() => createRoomSchema.parse({ propertyId: 'p1', roomTypeId: 'rt1' })).toThrow();
  });

  it('rejects roomNumber over 20 chars', () => {
    expect(() => createRoomSchema.parse({ ...valid, roomNumber: 'x'.repeat(21) })).toThrow();
  });
});

describe('updateRoomStatusSchema', () => {
  it('accepts valid status values', () => {
    for (const status of ['VACANT_CLEAN', 'VACANT_DIRTY', 'OCCUPIED', 'OUT_OF_ORDER']) {
      expect(() => updateRoomStatusSchema.parse({ status })).not.toThrow();
    }
  });

  it('rejects invalid status', () => {
    expect(() => updateRoomStatusSchema.parse({ status: 'INVALID' })).toThrow();
  });
});

// ── Rate Plan Schemas ───────────────────────────────────────────

describe('setRatePlanPriceSchema', () => {
  it('accepts valid date range', () => {
    const result = setRatePlanPriceSchema.parse({
      ratePlanId: 'rp1',
      roomTypeId: 'rt1',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      nightlyBaseCents: 15000,
    });
    expect(result.nightlyBaseCents).toBe(15000);
  });

  it('rejects endDate before startDate', () => {
    expect(() =>
      setRatePlanPriceSchema.parse({
        ratePlanId: 'rp1',
        roomTypeId: 'rt1',
        startDate: '2026-03-31',
        endDate: '2026-03-01',
        nightlyBaseCents: 15000,
      }),
    ).toThrow('End date must be after start date');
  });

  it('rejects same start and end date', () => {
    expect(() =>
      setRatePlanPriceSchema.parse({
        ratePlanId: 'rp1',
        roomTypeId: 'rt1',
        startDate: '2026-03-15',
        endDate: '2026-03-15',
        nightlyBaseCents: 15000,
      }),
    ).toThrow();
  });

  it('rejects invalid date format', () => {
    expect(() =>
      setRatePlanPriceSchema.parse({
        ratePlanId: 'rp1',
        roomTypeId: 'rt1',
        startDate: '03/01/2026',
        endDate: '03/31/2026',
        nightlyBaseCents: 15000,
      }),
    ).toThrow();
  });

  it('rejects negative nightly rate', () => {
    expect(() =>
      setRatePlanPriceSchema.parse({
        ratePlanId: 'rp1',
        roomTypeId: 'rt1',
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        nightlyBaseCents: -100,
      }),
    ).toThrow();
  });
});

// ── Guest Schemas ───────────────────────────────────────────────

describe('createGuestSchema', () => {
  const valid = { propertyId: 'p1', firstName: 'John', lastName: 'Doe' };

  it('accepts valid input with defaults', () => {
    const result = createGuestSchema.parse(valid);
    expect(result.isVip).toBe(false);
  });

  it('accepts optional email', () => {
    const result = createGuestSchema.parse({ ...valid, email: 'john@example.com' });
    expect(result.email).toBe('john@example.com');
  });

  it('rejects invalid email', () => {
    expect(() => createGuestSchema.parse({ ...valid, email: 'not-email' })).toThrow();
  });

  it('rejects empty firstName', () => {
    expect(() => createGuestSchema.parse({ ...valid, firstName: '' })).toThrow();
  });
});

// ── Reservation Schemas ─────────────────────────────────────────

describe('createReservationSchema', () => {
  const valid = {
    propertyId: 'p1',
    primaryGuestJson: { firstName: 'Jane', lastName: 'Smith' },
    checkInDate: '2026-04-01',
    checkOutDate: '2026-04-05',
    roomTypeId: 'rt1',
  };

  it('accepts valid input with defaults', () => {
    const result = createReservationSchema.parse(valid);
    expect(result.adults).toBe(1);
    expect(result.children).toBe(0);
    expect(result.sourceType).toBe('DIRECT');
    expect(result.status).toBe('CONFIRMED');
    expect(result.restrictionOverride).toBe(false);
  });

  it('rejects checkOutDate before checkInDate', () => {
    expect(() =>
      createReservationSchema.parse({
        ...valid,
        checkInDate: '2026-04-05',
        checkOutDate: '2026-04-01',
      }),
    ).toThrow('Check-out date must be after check-in date');
  });

  it('rejects same check-in and check-out date', () => {
    expect(() =>
      createReservationSchema.parse({
        ...valid,
        checkInDate: '2026-04-01',
        checkOutDate: '2026-04-01',
      }),
    ).toThrow();
  });

  it('requires primaryGuestJson with firstName and lastName', () => {
    expect(() =>
      createReservationSchema.parse({
        ...valid,
        primaryGuestJson: { firstName: '' },
      }),
    ).toThrow();
  });

  it('accepts valid source types', () => {
    for (const sourceType of ['DIRECT', 'PHONE', 'WALKIN', 'BOOKING_ENGINE', 'OTA']) {
      expect(() =>
        createReservationSchema.parse({ ...valid, sourceType }),
      ).not.toThrow();
    }
  });

  it('rejects invalid source type', () => {
    expect(() =>
      createReservationSchema.parse({ ...valid, sourceType: 'INVALID' }),
    ).toThrow();
  });

  it('accepts HOLD status', () => {
    const result = createReservationSchema.parse({ ...valid, status: 'HOLD' });
    expect(result.status).toBe('HOLD');
  });

  it('rejects non-initial statuses', () => {
    expect(() =>
      createReservationSchema.parse({ ...valid, status: 'CHECKED_IN' }),
    ).toThrow();
  });
});

describe('updateReservationSchema', () => {
  it('requires version', () => {
    expect(() => updateReservationSchema.parse({})).toThrow();
  });

  it('accepts version with optional fields', () => {
    const result = updateReservationSchema.parse({ version: 1, adults: 3 });
    expect(result.version).toBe(1);
    expect(result.adults).toBe(3);
  });

  it('rejects version < 1', () => {
    expect(() => updateReservationSchema.parse({ version: 0 })).toThrow();
  });
});

describe('cancelReservationSchema', () => {
  it('requires version', () => {
    expect(() => cancelReservationSchema.parse({})).toThrow();
  });

  it('accepts version with optional reason', () => {
    const result = cancelReservationSchema.parse({ version: 2, reason: 'Guest requested' });
    expect(result.reason).toBe('Guest requested');
  });
});

// ── Calendar Schemas ────────────────────────────────────────────

describe('calendarMoveSchema', () => {
  const valid = {
    reservationId: 'res-1',
    from: {
      roomId: 'r1',
      checkInDate: '2026-04-01',
      checkOutDate: '2026-04-05',
      version: 1,
    },
    to: {
      roomId: 'r2',
      checkInDate: '2026-04-02',
    },
    idempotencyKey: 'key-1',
  };

  it('accepts valid input', () => {
    expect(() => calendarMoveSchema.parse(valid)).not.toThrow();
  });

  it('requires idempotencyKey', () => {
    const { idempotencyKey: _, ...invalid } = valid;
    expect(() => calendarMoveSchema.parse(invalid)).toThrow();
  });
});

describe('calendarResizeSchema', () => {
  it('accepts LEFT edge resize', () => {
    expect(() =>
      calendarResizeSchema.parse({
        reservationId: 'res-1',
        edge: 'LEFT',
        from: { checkInDate: '2026-04-01', checkOutDate: '2026-04-05', roomId: 'r1', version: 1 },
        to: { checkInDate: '2026-03-30' },
        idempotencyKey: 'k1',
      }),
    ).not.toThrow();
  });

  it('accepts RIGHT edge resize', () => {
    expect(() =>
      calendarResizeSchema.parse({
        reservationId: 'res-1',
        edge: 'RIGHT',
        from: { checkInDate: '2026-04-01', checkOutDate: '2026-04-05', roomId: 'r1', version: 1 },
        to: { checkOutDate: '2026-04-07' },
        idempotencyKey: 'k1',
      }),
    ).not.toThrow();
  });

  it('rejects invalid edge value', () => {
    expect(() =>
      calendarResizeSchema.parse({
        reservationId: 'res-1',
        edge: 'TOP',
        from: { checkInDate: '2026-04-01', checkOutDate: '2026-04-05', roomId: 'r1', version: 1 },
        to: {},
        idempotencyKey: 'k1',
      }),
    ).toThrow();
  });
});

// ── Check-In / Check-Out ────────────────────────────────────────

describe('checkInSchema', () => {
  it('requires roomId and version', () => {
    expect(() => checkInSchema.parse({ roomId: 'r1', version: 1 })).not.toThrow();
    expect(() => checkInSchema.parse({ version: 1 })).toThrow();
    expect(() => checkInSchema.parse({ roomId: 'r1' })).toThrow();
  });
});

describe('checkOutSchema', () => {
  it('requires version', () => {
    expect(() => checkOutSchema.parse({ version: 1 })).not.toThrow();
    expect(() => checkOutSchema.parse({})).toThrow();
  });
});

// ── Folio Schemas ───────────────────────────────────────────────

describe('postFolioEntrySchema', () => {
  it('accepts valid entry types', () => {
    for (const entryType of ['ROOM_CHARGE', 'TAX', 'FEE', 'ADJUSTMENT', 'PAYMENT', 'REFUND']) {
      expect(() =>
        postFolioEntrySchema.parse({ entryType, description: 'test', amountCents: 1000 }),
      ).not.toThrow();
    }
  });

  it('rejects invalid entry type', () => {
    expect(() =>
      postFolioEntrySchema.parse({ entryType: 'INVALID', description: 'test', amountCents: 1000 }),
    ).toThrow();
  });

  it('allows negative amountCents (credits)', () => {
    const result = postFolioEntrySchema.parse({
      entryType: 'PAYMENT',
      description: 'Card payment',
      amountCents: -5000,
    });
    expect(result.amountCents).toBe(-5000);
  });

  it('rejects empty description', () => {
    expect(() =>
      postFolioEntrySchema.parse({ entryType: 'ROOM_CHARGE', description: '', amountCents: 1000 }),
    ).toThrow();
  });
});

// ── Rate Restrictions ───────────────────────────────────────────

describe('setRateRestrictionsSchema', () => {
  it('accepts valid restrictions', () => {
    const result = setRateRestrictionsSchema.parse({
      propertyId: 'p1',
      dates: [{ date: '2026-04-01', minStay: 2, cta: true }],
    });
    expect(result.dates).toHaveLength(1);
  });

  it('requires at least one date', () => {
    expect(() =>
      setRateRestrictionsSchema.parse({ propertyId: 'p1', dates: [] }),
    ).toThrow();
  });

  it('allows up to 365 dates', () => {
    const dates = Array.from({ length: 365 }, () => ({
      date: `2026-01-01`,
      stopSell: true,
    }));
    expect(() =>
      setRateRestrictionsSchema.parse({ propertyId: 'p1', dates }),
    ).not.toThrow();
  });

  it('rejects more than 365 dates', () => {
    const dates = Array.from({ length: 366 }, () => ({ date: '2026-01-01' }));
    expect(() =>
      setRateRestrictionsSchema.parse({ propertyId: 'p1', dates }),
    ).toThrow();
  });
});

describe('clearRateRestrictionsSchema', () => {
  it('rejects endDate before startDate', () => {
    expect(() =>
      clearRateRestrictionsSchema.parse({
        propertyId: 'p1',
        startDate: '2026-04-30',
        endDate: '2026-04-01',
      }),
    ).toThrow('End date must be on or after start date');
  });

  it('allows same start and end date', () => {
    expect(() =>
      clearRateRestrictionsSchema.parse({
        propertyId: 'p1',
        startDate: '2026-04-01',
        endDate: '2026-04-01',
      }),
    ).not.toThrow();
  });
});

// ── Payment Schemas ─────────────────────────────────────────────

describe('chargeCardSchema', () => {
  it('requires amountCents >= 1', () => {
    expect(() =>
      chargeCardSchema.parse({
        propertyId: 'p1',
        reservationId: 'res-1',
        folioId: 'f1',
        paymentMethodId: 'pm1',
        amountCents: 0,
        idempotencyKey: 'k1',
      }),
    ).toThrow();
  });

  it('accepts valid charge', () => {
    expect(() =>
      chargeCardSchema.parse({
        propertyId: 'p1',
        reservationId: 'res-1',
        folioId: 'f1',
        paymentMethodId: 'pm1',
        amountCents: 5000,
        idempotencyKey: 'k1',
      }),
    ).not.toThrow();
  });
});

describe('savePaymentMethodSchema', () => {
  it('accepts valid payment method', () => {
    const result = savePaymentMethodSchema.parse({
      guestId: 'g1',
      gatewayPaymentMethodId: 'pm_123',
      cardLastFour: '4242',
    });
    expect(result.gateway).toBe('stripe');
    expect(result.isDefault).toBe(false);
  });

  it('rejects cardLastFour not exactly 4 chars', () => {
    expect(() =>
      savePaymentMethodSchema.parse({
        guestId: 'g1',
        gatewayPaymentMethodId: 'pm_123',
        cardLastFour: '424',
      }),
    ).toThrow();
  });

  it('validates card expiration month range', () => {
    expect(() =>
      savePaymentMethodSchema.parse({
        guestId: 'g1',
        gatewayPaymentMethodId: 'pm_123',
        cardExpMonth: 0,
      }),
    ).toThrow();
    expect(() =>
      savePaymentMethodSchema.parse({
        guestId: 'g1',
        gatewayPaymentMethodId: 'pm_123',
        cardExpMonth: 13,
      }),
    ).toThrow();
  });
});

// ── Policies ────────────────────────────────────────────────────

describe('createDepositPolicySchema', () => {
  it('accepts valid deposit policy with defaults', () => {
    const result = createDepositPolicySchema.parse({
      propertyId: 'p1',
      name: 'Standard Deposit',
    });
    expect(result.depositType).toBe('first_night');
    expect(result.chargeTiming).toBe('at_booking');
    expect(result.isDefault).toBe(false);
  });

  it('accepts percentage deposit type', () => {
    const result = createDepositPolicySchema.parse({
      propertyId: 'p1',
      name: 'Half Deposit',
      depositType: 'percentage',
      percentagePct: 50,
    });
    expect(result.percentagePct).toBe(50);
  });
});

describe('createCancellationPolicySchema', () => {
  it('accepts valid policy with defaults', () => {
    const result = createCancellationPolicySchema.parse({
      propertyId: 'p1',
      name: 'Standard Cancel',
    });
    expect(result.penaltyType).toBe('none');
    expect(result.deadlineHours).toBe(24);
  });
});

// ── Message Templates ───────────────────────────────────────────

describe('createMessageTemplateSchema', () => {
  it('accepts valid template', () => {
    const result = createMessageTemplateSchema.parse({
      propertyId: 'p1',
      templateKey: 'booking_confirmation',
      channel: 'email',
      bodyTemplate: 'Dear {{guest.fullName}}, your reservation is confirmed.',
    });
    expect(result.isActive).toBe(true);
  });

  it('validates template keys', () => {
    for (const key of ['booking_confirmation', 'pre_arrival', 'post_stay', 'cancellation', 'check_in', 'check_out']) {
      expect(() =>
        createMessageTemplateSchema.parse({
          propertyId: 'p1',
          templateKey: key,
          channel: 'sms',
          bodyTemplate: 'Test',
        }),
      ).not.toThrow();
    }
  });

  it('rejects invalid template key', () => {
    expect(() =>
      createMessageTemplateSchema.parse({
        propertyId: 'p1',
        templateKey: 'invalid_key',
        channel: 'email',
        bodyTemplate: 'Test',
      }),
    ).toThrow();
  });

  it('rejects body over 10000 chars', () => {
    expect(() =>
      createMessageTemplateSchema.parse({
        propertyId: 'p1',
        templateKey: 'booking_confirmation',
        channel: 'email',
        bodyTemplate: 'x'.repeat(10001),
      }),
    ).toThrow();
  });
});

// ── Housekeeping ────────────────────────────────────────────────

describe('assignHousekeepingSchema', () => {
  it('requires at least one assignment', () => {
    expect(() =>
      assignHousekeepingSchema.parse({
        propertyId: 'p1',
        businessDate: '2026-04-01',
        assignments: [],
      }),
    ).toThrow();
  });

  it('accepts valid assignments', () => {
    const result = assignHousekeepingSchema.parse({
      propertyId: 'p1',
      businessDate: '2026-04-01',
      assignments: [{ roomId: 'r1', housekeeperId: 'hk1' }],
    });
    expect(result.assignments[0]!.priority).toBe(0);
  });
});

// ── Work Orders ─────────────────────────────────────────────────

describe('createWorkOrderSchema', () => {
  it('accepts valid work order with defaults', () => {
    const result = createWorkOrderSchema.parse({
      propertyId: 'p1',
      title: 'Fix leaking faucet',
    });
    expect(result.category).toBe('general');
    expect(result.priority).toBe('medium');
  });

  it('validates category enum', () => {
    for (const category of ['plumbing', 'electrical', 'hvac', 'furniture', 'general']) {
      expect(() =>
        createWorkOrderSchema.parse({ propertyId: 'p1', title: 'Test', category }),
      ).not.toThrow();
    }
  });

  it('validates priority enum', () => {
    for (const priority of ['urgent', 'high', 'medium', 'low']) {
      expect(() =>
        createWorkOrderSchema.parse({ propertyId: 'p1', title: 'Test', priority }),
      ).not.toThrow();
    }
  });

  it('rejects title over 500 chars', () => {
    expect(() =>
      createWorkOrderSchema.parse({ propertyId: 'p1', title: 'x'.repeat(501) }),
    ).toThrow();
  });
});

describe('updateWorkOrderSchema', () => {
  it('validates status lifecycle', () => {
    for (const status of ['open', 'in_progress', 'on_hold', 'completed', 'cancelled']) {
      expect(() => updateWorkOrderSchema.parse({ status })).not.toThrow();
    }
  });
});

// ── Groups ──────────────────────────────────────────────────────

describe('createGroupSchema', () => {
  const valid = {
    propertyId: 'p1',
    name: 'Wedding Group',
    startDate: '2026-06-01',
    endDate: '2026-06-05',
  };

  it('accepts valid group with defaults', () => {
    const result = createGroupSchema.parse(valid);
    expect(result.groupType).toBe('other');
    expect(result.status).toBe('tentative');
    expect(result.billingType).toBe('individual');
  });

  it('validates group types', () => {
    for (const groupType of ['tour', 'corporate', 'wedding', 'conference', 'sports', 'other']) {
      expect(() => createGroupSchema.parse({ ...valid, groupType })).not.toThrow();
    }
  });

  it('rejects endDate before startDate', () => {
    expect(() =>
      createGroupSchema.parse({ ...valid, startDate: '2026-06-05', endDate: '2026-06-01' }),
    ).toThrow('End date must be after start date');
  });
});

describe('setGroupRoomBlocksSchema', () => {
  it('requires at least one block', () => {
    expect(() =>
      setGroupRoomBlocksSchema.parse({ groupId: 'g1', blocks: [] }),
    ).toThrow();
  });

  it('accepts valid room blocks', () => {
    const result = setGroupRoomBlocksSchema.parse({
      groupId: 'g1',
      blocks: [{ roomTypeId: 'rt1', blockDate: '2026-06-01', roomsBlocked: 5 }],
    });
    expect(result.blocks).toHaveLength(1);
  });
});

// ── Corporate Accounts ──────────────────────────────────────────

describe('createCorporateAccountSchema', () => {
  it('accepts valid corporate account with defaults', () => {
    const result = createCorporateAccountSchema.parse({
      companyName: 'Acme Corp',
    });
    expect(result.billingType).toBe('credit_card');
  });

  it('validates billing types', () => {
    for (const billingType of ['direct_bill', 'credit_card', 'prepaid']) {
      expect(() =>
        createCorporateAccountSchema.parse({ companyName: 'Test', billingType }),
      ).not.toThrow();
    }
  });

  it('rejects negotiatedDiscountPct over 100', () => {
    expect(() =>
      createCorporateAccountSchema.parse({
        companyName: 'Test',
        negotiatedDiscountPct: 101,
      }),
    ).toThrow();
  });
});

// ── Pricing Rules ───────────────────────────────────────────────

describe('pricingConditionsSchema', () => {
  it('accepts empty conditions', () => {
    expect(() => pricingConditionsSchema.parse({})).not.toThrow();
  });

  it('accepts occupancy range', () => {
    const result = pricingConditionsSchema.parse({
      occupancyAbovePct: 50,
      occupancyBelowPct: 80,
    });
    expect(result.occupancyAbovePct).toBe(50);
  });

  it('rejects occupancy out of range', () => {
    expect(() => pricingConditionsSchema.parse({ occupancyAbovePct: -1 })).toThrow();
    expect(() => pricingConditionsSchema.parse({ occupancyAbovePct: 101 })).toThrow();
  });

  it('accepts days of week array', () => {
    const result = pricingConditionsSchema.parse({ daysOfWeek: [0, 5, 6] });
    expect(result.daysOfWeek).toEqual([0, 5, 6]);
  });

  it('rejects invalid day of week', () => {
    expect(() => pricingConditionsSchema.parse({ daysOfWeek: [7] })).toThrow();
    expect(() => pricingConditionsSchema.parse({ daysOfWeek: [-1] })).toThrow();
  });
});

describe('pricingAdjustmentsSchema', () => {
  it('accepts percentage increase', () => {
    const result = pricingAdjustmentsSchema.parse({
      type: 'percentage',
      amount: 10,
      direction: 'increase',
    });
    expect(result.type).toBe('percentage');
  });

  it('accepts fixed decrease', () => {
    const result = pricingAdjustmentsSchema.parse({
      type: 'fixed',
      amount: 500,
      direction: 'decrease',
    });
    expect(result.direction).toBe('decrease');
  });

  it('rejects negative amount', () => {
    expect(() =>
      pricingAdjustmentsSchema.parse({ type: 'percentage', amount: -5, direction: 'increase' }),
    ).toThrow();
  });
});

describe('createPricingRuleSchema', () => {
  it('accepts valid pricing rule with defaults', () => {
    const result = createPricingRuleSchema.parse({
      propertyId: 'p1',
      name: 'Weekend Surge',
      ruleType: 'day_of_week',
      conditions: { daysOfWeek: [5, 6] },
      adjustments: { type: 'percentage', amount: 15, direction: 'increase' },
    });
    expect(result.priority).toBe(0);
    expect(result.isActive).toBe(true);
  });

  it('validates rule types', () => {
    for (const ruleType of ['occupancy_threshold', 'day_of_week', 'lead_time', 'seasonal', 'event']) {
      expect(() =>
        createPricingRuleSchema.parse({
          propertyId: 'p1',
          name: 'Test',
          ruleType,
          conditions: {},
          adjustments: { type: 'fixed', amount: 100, direction: 'increase' },
        }),
      ).not.toThrow();
    }
  });
});

// ── Channel Manager ─────────────────────────────────────────────

describe('createChannelSchema', () => {
  it('accepts valid channel with defaults', () => {
    const result = createChannelSchema.parse({
      propertyId: 'p1',
      channelCode: 'booking_com',
      displayName: 'Booking.com',
    });
    expect(result.isActive).toBe(true);
  });

  it('validates channel codes', () => {
    for (const channelCode of ['booking_com', 'expedia', 'airbnb', 'other']) {
      expect(() =>
        createChannelSchema.parse({ propertyId: 'p1', channelCode, displayName: 'Test' }),
      ).not.toThrow();
    }
  });
});

describe('syncChannelSchema', () => {
  it('validates entity types', () => {
    for (const entityType of ['availability', 'rate', 'reservation', 'restriction']) {
      expect(() => syncChannelSchema.parse({ entityType })).not.toThrow();
    }
  });

  it('rejects invalid entity type', () => {
    expect(() => syncChannelSchema.parse({ entityType: 'invalid' })).toThrow();
  });
});

// ── Booking Engine ──────────────────────────────────────────────

describe('updateBookingEngineConfigSchema', () => {
  it('accepts valid config', () => {
    const result = updateBookingEngineConfigSchema.parse({
      propertyId: 'p1',
      maxAdvanceDays: 365,
      minLeadTimeHours: 24,
    });
    expect(result.maxAdvanceDays).toBe(365);
  });

  it('rejects maxAdvanceDays over 730', () => {
    expect(() =>
      updateBookingEngineConfigSchema.parse({ propertyId: 'p1', maxAdvanceDays: 731 }),
    ).toThrow();
  });

  it('validates URL fields', () => {
    expect(() =>
      updateBookingEngineConfigSchema.parse({ propertyId: 'p1', termsUrl: 'not-a-url' }),
    ).toThrow();
  });

  it('accepts null for URL fields', () => {
    expect(() =>
      updateBookingEngineConfigSchema.parse({ propertyId: 'p1', termsUrl: null }),
    ).not.toThrow();
  });
});

// ── Room Assignment ─────────────────────────────────────────────

describe('updateRoomAssignmentPreferencesSchema', () => {
  it('accepts valid preferences', () => {
    const result = updateRoomAssignmentPreferencesSchema.parse({
      propertyId: 'p1',
      preferences: [{ name: 'floor_preference', weight: 30 }],
    });
    expect(result.preferences).toHaveLength(1);
    expect(result.preferences[0]!.isActive).toBe(true);
  });

  it('validates preference names', () => {
    for (const name of ['floor_preference', 'adjacency', 'accessibility', 'view', 'quiet']) {
      expect(() =>
        updateRoomAssignmentPreferencesSchema.parse({
          propertyId: 'p1',
          preferences: [{ name, weight: 50 }],
        }),
      ).not.toThrow();
    }
  });

  it('rejects weight over 100', () => {
    expect(() =>
      updateRoomAssignmentPreferencesSchema.parse({
        propertyId: 'p1',
        preferences: [{ name: 'view', weight: 101 }],
      }),
    ).toThrow();
  });
});

// ── Guest Portal ────────────────────────────────────────────────

describe('createGuestPortalSessionSchema', () => {
  it('accepts valid session', () => {
    expect(() =>
      createGuestPortalSessionSchema.parse({ reservationId: 'res-1' }),
    ).not.toThrow();
  });

  it('validates expiresInHours range', () => {
    expect(() =>
      createGuestPortalSessionSchema.parse({ reservationId: 'res-1', expiresInHours: 0 }),
    ).toThrow();
    expect(() =>
      createGuestPortalSessionSchema.parse({ reservationId: 'res-1', expiresInHours: 721 }),
    ).toThrow();
  });
});

// ── Loyalty ─────────────────────────────────────────────────────

describe('createLoyaltyProgramSchema', () => {
  it('accepts valid program with defaults', () => {
    const result = createLoyaltyProgramSchema.parse({ name: 'Gold Rewards' });
    expect(result.pointsPerDollar).toBe(10);
    expect(result.pointsPerNight).toBe(0);
    expect(result.redemptionValueCents).toBe(1);
    expect(result.tiersJson).toEqual([]);
    expect(result.isActive).toBe(true);
  });

  it('accepts tiers with multiplier', () => {
    const result = createLoyaltyProgramSchema.parse({
      name: 'Rewards',
      tiersJson: [
        { name: 'Silver', minPoints: 1000, multiplier: 1.5, perks: ['Late checkout'] },
        { name: 'Gold', minPoints: 5000, multiplier: 2, perks: ['Upgrade', 'Lounge'] },
      ],
    });
    expect(result.tiersJson).toHaveLength(2);
  });

  it('rejects multiplier below 1', () => {
    expect(() =>
      createLoyaltyProgramSchema.parse({
        name: 'Rewards',
        tiersJson: [{ name: 'Tier', minPoints: 0, multiplier: 0.5 }],
      }),
    ).toThrow();
  });
});

describe('earnLoyaltyPointsSchema', () => {
  it('requires points >= 1', () => {
    expect(() =>
      earnLoyaltyPointsSchema.parse({ memberId: 'm1', points: 0 }),
    ).toThrow();
  });

  it('accepts valid earn', () => {
    const result = earnLoyaltyPointsSchema.parse({
      memberId: 'm1',
      points: 100,
      description: 'Stay bonus',
    });
    expect(result.points).toBe(100);
  });
});

describe('redeemLoyaltyPointsSchema', () => {
  it('requires points >= 1', () => {
    expect(() =>
      redeemLoyaltyPointsSchema.parse({ memberId: 'm1', points: 0 }),
    ).toThrow();
  });
});

describe('adjustLoyaltyPointsSchema', () => {
  it('allows negative points (deductions)', () => {
    const result = adjustLoyaltyPointsSchema.parse({
      memberId: 'm1',
      points: -50,
      reason: 'Correction',
    });
    expect(result.points).toBe(-50);
  });

  it('requires reason', () => {
    expect(() =>
      adjustLoyaltyPointsSchema.parse({ memberId: 'm1', points: 10 }),
    ).toThrow();
  });
});

// ── Communication ───────────────────────────────────────────────

describe('logCommunicationSchema', () => {
  it('validates channel types', () => {
    for (const channel of ['email', 'sms', 'phone', 'internal']) {
      expect(() =>
        logCommunicationSchema.parse({
          propertyId: 'p1',
          guestId: 'g1',
          channel,
          direction: 'outbound',
          messageType: 'note',
          body: 'Test message',
        }),
      ).not.toThrow();
    }
  });

  it('validates direction', () => {
    expect(() =>
      logCommunicationSchema.parse({
        propertyId: 'p1',
        guestId: 'g1',
        channel: 'email',
        direction: 'invalid',
        messageType: 'note',
        body: 'Test',
      }),
    ).toThrow();
  });

  it('validates message types', () => {
    for (const messageType of ['confirmation', 'pre_arrival', 'post_stay', 'cancellation', 'request', 'complaint', 'note']) {
      expect(() =>
        logCommunicationSchema.parse({
          propertyId: 'p1',
          guestId: 'g1',
          channel: 'email',
          direction: 'inbound',
          messageType,
          body: 'Test',
        }),
      ).not.toThrow();
    }
  });
});

// ── Pick Up Group Room ──────────────────────────────────────────

describe('pickUpGroupRoomSchema', () => {
  it('accepts valid group room pickup', () => {
    expect(() =>
      pickUpGroupRoomSchema.parse({
        groupId: 'g1',
        reservationInput: {
          primaryGuestJson: { firstName: 'John', lastName: 'Doe' },
          checkInDate: '2026-06-01',
          checkOutDate: '2026-06-03',
          roomTypeId: 'rt1',
        },
      }),
    ).not.toThrow();
  });

  it('rejects checkout before checkin in nested reservation', () => {
    expect(() =>
      pickUpGroupRoomSchema.parse({
        groupId: 'g1',
        reservationInput: {
          primaryGuestJson: { firstName: 'John', lastName: 'Doe' },
          checkInDate: '2026-06-03',
          checkOutDate: '2026-06-01',
          roomTypeId: 'rt1',
        },
      }),
    ).toThrow();
  });
});
