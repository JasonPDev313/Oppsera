import { describe, it, expect } from 'vitest';
import {
  fitLine,
  rightAlign,
  centerText,
  formatDollars,
  renderKitchenChitText,
  renderDeltaChitText,
  renderGuestCheckText,
  renderReceiptText,
  renderExpoChitText,
  renderZReportText,
} from '../helpers/chit-layout';
import type {
  KitchenChitData,
  DeltaChitData,
  GuestCheckData,
  ReceiptData,
  ExpoChitData,
  ZReportData,
} from '../helpers/chit-layout';

describe('Utility functions', () => {
  it('fitLine truncates long strings', () => {
    const long = 'x'.repeat(50);
    expect(fitLine(long, 40)).toHaveLength(40);
  });

  it('fitLine returns short strings unchanged', () => {
    expect(fitLine('hello', 40)).toBe('hello');
  });

  it('rightAlign pads between label and value', () => {
    const result = rightAlign('TOTAL:', '$10.00', 20);
    expect(result).toHaveLength(20);
    expect(result).toContain('TOTAL:');
    expect(result).toContain('$10.00');
  });

  it('centerText centers text', () => {
    const result = centerText('HI', 10);
    expect(result).toBe('    HI');
  });

  it('formatDollars converts cents to dollars', () => {
    expect(formatDollars(1050)).toBe('$10.50');
    expect(formatDollars(0)).toBe('$0.00');
    expect(formatDollars(99)).toBe('$0.99');
    expect(formatDollars(100000)).toBe('$1000.00');
  });
});

describe('renderKitchenChitText', () => {
  const baseData: KitchenChitData = {
    ticketNumber: 42,
    time: '12:30 PM',
    courseName: 'Course 1',
    tableNumber: '15',
    serverName: 'Jane',
    partySize: 4,
    items: [
      {
        qty: 2,
        name: 'Caesar Salad',
        seatNumber: 1,
        modifiers: ['No croutons', 'Dressing on side'],
        specialInstructions: 'Light dressing',
        allergenFlags: ['GLUTEN-FREE'],
      },
      {
        qty: 1,
        name: 'Grilled Salmon',
        seatNumber: 2,
        modifiers: [],
        specialInstructions: null,
        allergenFlags: [],
      },
    ],
    rushFlag: false,
    vipFlag: false,
  };

  it('renders ticket number', () => {
    const text = renderKitchenChitText(baseData);
    expect(text).toContain('KITCHEN TICKET #42');
  });

  it('renders table and server', () => {
    const text = renderKitchenChitText(baseData);
    expect(text).toContain('TABLE: 15');
    expect(text).toContain('SERVER: Jane');
  });

  it('renders items with modifiers', () => {
    const text = renderKitchenChitText(baseData);
    expect(text).toContain('2x Caesar Salad');
    expect(text).toContain('No croutons');
    expect(text).toContain('Light dressing');
    expect(text).toContain('GLUTEN-FREE');
  });

  it('renders seat numbers', () => {
    const text = renderKitchenChitText(baseData);
    expect(text).toContain('[SEAT 1]');
    expect(text).toContain('[SEAT 2]');
  });

  it('renders RUSH flag', () => {
    const text = renderKitchenChitText({ ...baseData, rushFlag: true });
    expect(text).toContain('>>> RUSH <<<');
  });

  it('renders VIP flag', () => {
    const text = renderKitchenChitText({ ...baseData, vipFlag: true });
    expect(text).toContain('>>> VIP <<<');
  });

  it('renders party size', () => {
    const text = renderKitchenChitText(baseData);
    expect(text).toContain('PARTY SIZE: 4');
  });

  it('renders course name', () => {
    const text = renderKitchenChitText(baseData);
    expect(text).toContain('Course 1');
  });
});

describe('renderDeltaChitText', () => {
  const baseData: DeltaChitData = {
    ticketNumber: 42,
    deltaType: 'add',
    time: '12:45 PM',
    tableNumber: '15',
    serverName: 'Jane',
    items: [
      {
        qty: 1,
        name: 'Side of Fries',
        seatNumber: 1,
        modifiers: ['Extra crispy'],
        specialInstructions: null,
        voidReason: null,
      },
    ],
  };

  it('renders ADD type', () => {
    const text = renderDeltaChitText(baseData);
    expect(text).toContain('*** ADD ***');
    expect(text).toContain('DELTA TICKET #42');
  });

  it('renders VOID type with reason', () => {
    const data: DeltaChitData = {
      ...baseData,
      deltaType: 'void',
      items: [
        {
          qty: 1,
          name: 'Burger',
          seatNumber: null,
          modifiers: [],
          specialInstructions: null,
          voidReason: 'Wrong item sent',
        },
      ],
    };
    const text = renderDeltaChitText(data);
    expect(text).toContain('*** VOID ***');
    expect(text).toContain('REASON: Wrong item sent');
  });

  it('renders RUSH type', () => {
    const text = renderDeltaChitText({ ...baseData, deltaType: 'rush' });
    expect(text).toContain('*** RUSH ***');
  });
});

describe('renderGuestCheckText', () => {
  const baseData: GuestCheckData = {
    restaurantName: 'Test Restaurant',
    tagline: 'Fine Dining',
    date: '2026-02-21',
    time: '7:30 PM',
    serverName: 'Jane',
    tableNumber: '15',
    items: [
      { name: 'Steak', qty: 1, unitPriceCents: 4500, lineTotalCents: 4500, seatNumber: 1 },
      { name: 'Wine', qty: 2, unitPriceCents: 1500, lineTotalCents: 3000, seatNumber: 1 },
      { name: 'Pasta', qty: 1, unitPriceCents: 2200, lineTotalCents: 2200, seatNumber: 2 },
    ],
    subtotalCents: 9700,
    taxCents: 776,
    serviceChargeCents: 1940,
    totalCents: 12416,
    footerLines: ['Thank you for dining with us!'],
    bySeat: false,
  };

  it('renders restaurant name and tagline', () => {
    const text = renderGuestCheckText(baseData);
    expect(text).toContain('Test Restaurant');
    expect(text).toContain('Fine Dining');
  });

  it('renders server and table', () => {
    const text = renderGuestCheckText(baseData);
    expect(text).toContain('SERVER: Jane');
    expect(text).toContain('TABLE: 15');
  });

  it('renders items with prices', () => {
    const text = renderGuestCheckText(baseData);
    expect(text).toContain('Steak');
    expect(text).toContain('$45.00');
    expect(text).toContain('Wine');
    expect(text).toContain('$30.00');
  });

  it('renders totals', () => {
    const text = renderGuestCheckText(baseData);
    expect(text).toContain('SUBTOTAL:');
    expect(text).toContain('$97.00');
    expect(text).toContain('TAX:');
    expect(text).toContain('SERVICE CHARGE:');
    expect(text).toContain('TOTAL:');
    expect(text).toContain('$124.16');
  });

  it('renders tip line', () => {
    const text = renderGuestCheckText(baseData);
    expect(text).toContain('TIP LINE:');
    expect(text).toContain('TOTAL WITH TIP:');
  });

  it('renders footer', () => {
    const text = renderGuestCheckText(baseData);
    expect(text).toContain('Thank you for dining with us!');
    expect(text).toContain('THANK YOU!');
  });

  it('renders by seat when bySeat=true', () => {
    const text = renderGuestCheckText({ ...baseData, bySeat: true });
    expect(text).toContain('SEAT 1:');
    expect(text).toContain('SEAT 2:');
  });

  it('omits service charge when zero', () => {
    const text = renderGuestCheckText({ ...baseData, serviceChargeCents: 0 });
    expect(text).not.toContain('SERVICE CHARGE:');
  });
});

describe('renderReceiptText', () => {
  const baseData: ReceiptData = {
    restaurantName: 'Test Restaurant',
    tagline: null,
    date: '2026-02-21',
    time: '7:30 PM',
    serverName: 'Jane',
    tableNumber: '15',
    items: [
      { name: 'Steak', qty: 1, unitPriceCents: 4500, lineTotalCents: 4500, seatNumber: null },
    ],
    subtotalCents: 4500,
    taxCents: 360,
    serviceChargeCents: 0,
    totalCents: 4860,
    footerLines: [],
    bySeat: false,
    paymentMethod: 'card',
    cardLast4: '4242',
    cardBrand: 'Visa',
    amountChargedCents: 4860,
    tipAmountCents: 970,
    totalWithTipCents: 5830,
    transactionReference: 'TXN-12345',
    copy: 'customer',
  };

  it('renders card payment details', () => {
    const text = renderReceiptText(baseData);
    expect(text).toContain('Visa ending in 4242');
    expect(text).toContain('AMOUNT:');
    expect(text).toContain('TIP:');
    expect(text).toContain('TOTAL CHARGED:');
    expect(text).toContain('REFERENCE: TXN-12345');
  });

  it('renders customer copy label', () => {
    const text = renderReceiptText(baseData);
    expect(text).toContain('CUSTOMER COPY');
  });

  it('renders merchant copy label', () => {
    const text = renderReceiptText({ ...baseData, copy: 'merchant' });
    expect(text).toContain('MERCHANT COPY');
  });

  it('renders cash payment without card info', () => {
    const text = renderReceiptText({ ...baseData, cardLast4: null, cardBrand: null, paymentMethod: 'cash' });
    expect(text).toContain('METHOD: cash');
  });
});

describe('renderExpoChitText', () => {
  const baseData: ExpoChitData = {
    ticketNumber: 42,
    tableNumber: '15',
    partySize: 4,
    items: [
      {
        name: 'Steak',
        seatNumber: 1,
        stationStatuses: [
          { stationName: 'Grill', ready: true },
          { stationName: 'Sauté', ready: true },
        ],
      },
      {
        name: 'Salad',
        seatNumber: 2,
        stationStatuses: [
          { stationName: 'Salad', ready: false },
        ],
      },
    ],
    allReady: false,
  };

  it('renders expo header', () => {
    const text = renderExpoChitText(baseData);
    expect(text).toContain('EXPO / READY FOR PICKUP');
    expect(text).toContain('TICKET #42');
  });

  it('renders station statuses', () => {
    const text = renderExpoChitText(baseData);
    expect(text).toContain('✓ Grill');
    expect(text).toContain('✗ Salad');
  });

  it('renders all ready message when true', () => {
    const text = renderExpoChitText({ ...baseData, allReady: true });
    expect(text).toContain('ALL ITEMS READY - SEND TO SERVICE');
  });

  it('omits all ready message when false', () => {
    const text = renderExpoChitText(baseData);
    expect(text).not.toContain('ALL ITEMS READY');
  });
});

describe('renderZReportText', () => {
  const baseData: ZReportData = {
    locationName: 'Main Dining',
    businessDate: '2026-02-21',
    grossSalesCents: 500000,
    totalDiscountsCents: 25000,
    totalCompsCents: 10000,
    netSalesCents: 465000,
    taxCollectedCents: 37200,
    cashTotalCents: 150000,
    cardTotalCents: 300000,
    giftCardTotalCents: 15000,
    houseTotalCents: 0,
    voidCount: 3,
    voidTotalCents: 12000,
    compCount: 2,
    compTotalCents: 10000,
    discountCount: 5,
    discountTotalCents: 25000,
    serviceChargeTotalCents: 50000,
    cardTipsTotalCents: 60000,
    cashTipsTotalCents: 15000,
    coversCount: 85,
    checkCount: 35,
    avgCheckAmountCents: 13286,
    startingFloatCents: 20000,
    cashSalesCents: 150000,
    cashTipsCents: 15000,
    cashDropsCents: 100000,
    paidOutsCents: 5000,
    expectedCashCents: 80000,
    actualCashCountCents: 79500,
    varianceCents: -500,
    timestamp: '2026-02-21T23:00:00Z',
    closedBy: 'Manager Mike',
  };

  it('renders header', () => {
    const text = renderZReportText(baseData);
    expect(text).toContain('Z-REPORT / CLOSE BATCH');
    expect(text).toContain('Main Dining');
    expect(text).toContain('2026-02-21');
  });

  it('renders sales summary', () => {
    const text = renderZReportText(baseData);
    expect(text).toContain('Gross Sales:');
    expect(text).toContain('$5000.00');
    expect(text).toContain('Net Sales:');
    expect(text).toContain('$4650.00');
  });

  it('renders payment breakdown', () => {
    const text = renderZReportText(baseData);
    expect(text).toContain('Cash:');
    expect(text).toContain('Credit Cards:');
    expect(text).toContain('$3000.00');
  });

  it('renders cash accountability', () => {
    const text = renderZReportText(baseData);
    expect(text).toContain('Starting Float:');
    expect(text).toContain('Expected Cash:');
    expect(text).toContain('Actual Cash Count:');
    expect(text).toContain('Over / (Short):');
  });

  it('renders negative variance in parens', () => {
    const text = renderZReportText(baseData);
    expect(text).toContain('($5.00)');
  });

  it('renders positive variance without parens', () => {
    const text = renderZReportText({ ...baseData, varianceCents: 500 });
    expect(text).toContain('$5.00');
    expect(text).not.toContain('($5.00)');
  });

  it('renders closed by', () => {
    const text = renderZReportText(baseData);
    expect(text).toContain('CLOSED BY: Manager Mike');
  });

  it('renders operational metrics', () => {
    const text = renderZReportText(baseData);
    expect(text).toContain('Total Covers:');
    expect(text).toContain('85');
    expect(text).toContain('Total Checks:');
    expect(text).toContain('35');
  });
});
