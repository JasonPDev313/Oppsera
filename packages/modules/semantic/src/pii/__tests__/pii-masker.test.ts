import { describe, it, expect } from 'vitest';
import {
  maskRowsForLLM,
  maskFreeText,
  isPiiColumn,
  _maskEmail,
  _maskPhone,
  _maskName,
  _maskIdentifier,
  _maskStringByContent,
} from '../pii-masker';

// ── isPiiColumn ──────────────────────────────────────────────────────

describe('isPiiColumn', () => {
  it('detects exact-match PII columns', () => {
    expect(isPiiColumn('name')).toBe(true);
    expect(isPiiColumn('email')).toBe(true);
    expect(isPiiColumn('phone')).toBe(true);
    expect(isPiiColumn('address')).toBe(true);
    expect(isPiiColumn('ssn')).toBe(true);
    expect(isPiiColumn('password')).toBe(true);
    expect(isPiiColumn('token')).toBe(true);
    expect(isPiiColumn('mobile')).toBe(true);
    expect(isPiiColumn('zip')).toBe(true);
  });

  it('detects substring-match PII columns', () => {
    expect(isPiiColumn('first_name')).toBe(true);
    expect(isPiiColumn('last_name')).toBe(true);
    expect(isPiiColumn('display_name')).toBe(true);
    expect(isPiiColumn('customer_name')).toBe(true);
    expect(isPiiColumn('email_address')).toBe(true);
    expect(isPiiColumn('phone_number')).toBe(true);
    expect(isPiiColumn('card_number')).toBe(true);
    expect(isPiiColumn('primary_guest_json')).toBe(true);
    expect(isPiiColumn('tax_id')).toBe(true);
  });

  it('detects suffix-match PII columns', () => {
    expect(isPiiColumn('guest_email')).toBe(true);
    expect(isPiiColumn('billing_phone')).toBe(true);
    expect(isPiiColumn('emergency_contact_name')).toBe(true);
    expect(isPiiColumn('server_name')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPiiColumn('Email')).toBe(true);
    expect(isPiiColumn('FIRST_NAME')).toBe(true);
    expect(isPiiColumn('Phone_Number')).toBe(true);
  });

  it('does NOT flag non-PII columns', () => {
    expect(isPiiColumn('total_revenue')).toBe(false);
    expect(isPiiColumn('order_count')).toBe(false);
    expect(isPiiColumn('business_date')).toBe(false);
    expect(isPiiColumn('location_id')).toBe(false);
    expect(isPiiColumn('net_sales')).toBe(false);
    expect(isPiiColumn('avg_order_value')).toBe(false);
    expect(isPiiColumn('item_count')).toBe(false);
    expect(isPiiColumn('category')).toBe(false);
    expect(isPiiColumn('status')).toBe(false);
    expect(isPiiColumn('tenant_id')).toBe(false);
  });
});

// ── Individual Masking Functions ──────────────────────────────────────

describe('maskEmail', () => {
  it('masks standard emails preserving first char and TLD', () => {
    expect(_maskEmail('john.doe@example.com')).toBe('j***@***.com');
    expect(_maskEmail('jane@company.org')).toBe('j***@***.org');
    expect(_maskEmail('a@b.co')).toBe('a***@***.co');
  });

  it('handles edge cases', () => {
    expect(_maskEmail('noatsign')).toBe('[EMAIL]');
    expect(_maskEmail('@nodomain')).toBe('****@***');
  });
});

describe('maskPhone', () => {
  it('masks US phone formats keeping last 4', () => {
    expect(_maskPhone('(555) 123-4567')).toBe('(***) ***-4567');
    expect(_maskPhone('555-123-4567')).toBe('(***) ***-4567');
    expect(_maskPhone('5551234567')).toBe('(***) ***-4567');
    expect(_maskPhone('+1 555 123 4567')).toBe('(***) ***-4567');
  });

  it('handles short numbers', () => {
    expect(_maskPhone('123')).toBe('****');
  });
});

describe('maskName', () => {
  it('reduces full names to initials', () => {
    expect(_maskName('John Smith')).toBe('J. S.');
    expect(_maskName('Jane Marie Doe')).toBe('J. M. D.');
    expect(_maskName('Alice')).toBe('A.');
  });

  it('handles edge cases', () => {
    expect(_maskName('')).toBe('[NAME]');
    expect(_maskName('  ')).toBe('[NAME]');
  });
});

describe('maskIdentifier', () => {
  it('keeps last 4 characters', () => {
    expect(_maskIdentifier('4111111111111111')).toBe('************1111');
    expect(_maskIdentifier('WRIST-ABC-1234')).toBe('**********1234');
  });

  it('handles short values', () => {
    expect(_maskIdentifier('1234')).toBe('****');
    expect(_maskIdentifier('12')).toBe('****');
    expect(_maskIdentifier('')).toBe('****');
  });
});

// ── maskStringByContent (Layer 2) ─────────────────────────────────

describe('maskStringByContent', () => {
  it('masks emails in free text', () => {
    const result = _maskStringByContent('Contact john@example.com for info');
    expect(result).toBe('Contact j***@***.com for info');
  });

  it('masks phone numbers in free text', () => {
    const result = _maskStringByContent('Call (555) 123-4567 now');
    expect(result).toBe('Call (***) ***-4567 now');
  });

  it('masks SSNs in free text', () => {
    const result = _maskStringByContent('SSN is 123-45-6789');
    expect(result).toBe('SSN is ***-**-****');
  });

  it('masks multiple PII patterns in one string', () => {
    const result = _maskStringByContent('Email john@test.com, phone 555-123-4567');
    expect(result).toContain('j***@***.com');
    expect(result).toContain('(***) ***-4567');
  });

  it('leaves non-PII text unchanged', () => {
    expect(_maskStringByContent('Total revenue was $12,400')).toBe('Total revenue was $12,400');
    expect(_maskStringByContent('2026-02-26')).toBe('2026-02-26');
    expect(_maskStringByContent('order_count: 42')).toBe('order_count: 42');
  });
});

// ── maskRowsForLLM ───────────────────────────────────────────────────

describe('maskRowsForLLM', () => {
  it('masks PII columns by name and preserves non-PII', () => {
    const rows = [
      { customer_name: 'John Smith', email: 'john@test.com', total_revenue: 5000, order_count: 12 },
      { customer_name: 'Jane Doe', email: 'jane@example.org', total_revenue: 3200, order_count: 8 },
    ];

    const masked = maskRowsForLLM(rows);

    expect(masked[0]!.customer_name).toBe('J. S.');
    expect(masked[0]!.email).toBe('j***@***.com');
    expect(masked[0]!.total_revenue).toBe(5000);
    expect(masked[0]!.order_count).toBe(12);

    expect(masked[1]!.customer_name).toBe('J. D.');
    expect(masked[1]!.email).toBe('j***@***.org');
    expect(masked[1]!.total_revenue).toBe(3200);
    expect(masked[1]!.order_count).toBe(8);
  });

  it('does NOT mutate the input rows', () => {
    const rows = [{ first_name: 'Alice', revenue: 100 }];
    const original = JSON.parse(JSON.stringify(rows));

    maskRowsForLLM(rows);

    expect(rows).toEqual(original);
  });

  it('handles empty arrays', () => {
    expect(maskRowsForLLM([])).toEqual([]);
  });

  it('handles null and undefined values in PII columns', () => {
    const rows = [{ email: null, phone: undefined, name: 'Test' }];
    const masked = maskRowsForLLM(rows);

    expect(masked[0]!.email).toBeNull();
    expect(masked[0]!.phone).toBeUndefined();
    expect(masked[0]!.name).toBe('T.');
  });

  it('applies layer 2 value-pattern detection on non-PII columns', () => {
    const rows = [
      { notes: 'Contact john@test.com for details', status: 'active', amount: 500 },
    ];

    const masked = maskRowsForLLM(rows);

    expect(masked[0]!.notes).toBe('Contact j***@***.com for details');
    expect(masked[0]!.status).toBe('active');
    expect(masked[0]!.amount).toBe(500);
  });

  it('masks phone columns', () => {
    const rows = [{ phone_number: '(555) 867-5309' }];
    const masked = maskRowsForLLM(rows);
    expect(masked[0]!.phone_number).toBe('(***) ***-5309');
  });

  it('masks card/identifier columns keeping last 4', () => {
    const rows = [{ card_number: '4111111111111111' }];
    const masked = maskRowsForLLM(rows);
    expect(masked[0]!.card_number).toBe('************1111');
  });

  it('masks address columns', () => {
    const rows = [{ street_address: '123 Main St, Springfield' }];
    const masked = maskRowsForLLM(rows);
    expect(masked[0]!.street_address).toBe('[REDACTED]');
  });

  it('handles JSONB objects in PII columns', () => {
    const rows = [{
      primary_guest_json: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@test.com',
        phone: '555-123-4567',
        roomPreference: 'ocean_view',
      },
    }];

    const masked = maskRowsForLLM(rows);
    const guest = masked[0]!.primary_guest_json as Record<string, unknown>;

    expect(guest.firstName).toBe('J.');
    expect(guest.lastName).toBe('S.');
    expect(guest.email).toBe('j***@***.com');
    expect(guest.phone).toBe('(***) ***-4567');
    expect(guest.roomPreference).toBe('ocean_view');
  });

  it('handles JSONB objects in non-PII columns (scans recursively)', () => {
    const rows = [{
      metadata: {
        contact_email: 'test@example.com',
        count: 42,
      },
    }];

    const masked = maskRowsForLLM(rows);
    const meta = masked[0]!.metadata as Record<string, unknown>;
    expect(meta.contact_email).toBe('t***@***.com');
    expect(meta.count).toBe(42);
  });

  it('supports additionalPiiColumns option', () => {
    const rows = [{ custom_field: 'sensitive data', revenue: 100 }];
    const masked = maskRowsForLLM(rows, { additionalPiiColumns: ['custom_field'] });

    expect(masked[0]!.custom_field).toBe('[REDACTED]');
    expect(masked[0]!.revenue).toBe(100);
  });

  it('handles rows with boolean values', () => {
    const rows = [{ name: 'Test User', is_active: true, is_vip: false }];
    const masked = maskRowsForLLM(rows);

    expect(masked[0]!.name).toBe('T. U.');
    expect(masked[0]!.is_active).toBe(true);
    expect(masked[0]!.is_vip).toBe(false);
  });

  it('handles date values as-is', () => {
    const rows = [{ name: 'Test', created_at: '2026-02-26T10:00:00Z' }];
    const masked = maskRowsForLLM(rows);

    expect(masked[0]!.name).toBe('T.');
    // Dates are strings but shouldn't match PII patterns
    expect(masked[0]!.created_at).toBe('2026-02-26T10:00:00Z');
  });
});

// ── maskFreeText ──────────────────────────────────────────────────────

describe('maskFreeText', () => {
  it('masks emails in free text', () => {
    expect(maskFreeText('Email: user@domain.com')).toBe('Email: u***@***.com');
  });

  it('masks phone numbers in free text', () => {
    expect(maskFreeText('Call 555-123-4567')).toBe('Call (***) ***-4567');
  });

  it('masks SSNs in free text', () => {
    expect(maskFreeText('SSN: 123-45-6789')).toBe('SSN: ***-**-****');
  });

  it('returns empty/null strings as-is', () => {
    expect(maskFreeText('')).toBe('');
    expect(maskFreeText(null as unknown as string)).toBe(null);
    expect(maskFreeText(undefined as unknown as string)).toBe(undefined);
  });

  it('leaves non-PII text unchanged', () => {
    expect(maskFreeText('Show me revenue for last week')).toBe('Show me revenue for last week');
    expect(maskFreeText('Total: $12,400.00')).toBe('Total: $12,400.00');
  });
});
