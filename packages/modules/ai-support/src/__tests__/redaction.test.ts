import { describe, it, expect } from 'vitest';
import { sanitizeResponse, validateCustomerSafe } from '../services/content-guard';

// ── Customer-mode redaction tests ─────────────────────────────────────────────

describe('content-guard: customer mode redaction', () => {
  describe('API endpoint paths', () => {
    it('strips /api/v1/... paths', () => {
      const text = 'You can call /api/v1/orders to list orders.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('/api/v1/orders');
    });

    it('strips /api/v1/... in longer sentences', () => {
      const text = 'The endpoint /api/v1/payments/[id]/refund is used internally.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/\/api\/v\d+\//);
    });

    it('strips multiple API paths in one response', () => {
      const text = 'Use /api/v1/orders for orders and /api/v1/inventory for stock.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/\/api\/v\d+\//);
    });
  });

  describe('database table names', () => {
    it('strips ai_support table names', () => {
      const text = 'This is stored in ai_support_answer_cards table.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('ai_support_answer_cards');
    });

    it('strips ai_assistant table names', () => {
      const text = 'The ai_assistant_threads table holds conversations.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('ai_assistant_threads');
    });

    it('strips fnb_kds table names', () => {
      const text = 'fnb_kds_send_tracking is used for KDS.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('fnb_kds_send_tracking');
    });
  });

  describe('internal module names', () => {
    it('strips @oppsera/module-* references', () => {
      const text = 'This uses @oppsera/module-orders for processing.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('@oppsera/module-orders');
    });

    it('strips @oppsera/core references', () => {
      const text = 'Authentication is handled by @oppsera/core.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('@oppsera/core');
    });

    it('strips @oppsera/db references', () => {
      const text = 'Database access via @oppsera/db.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('@oppsera/db');
    });
  });

  describe('raw code patterns', () => {
    it('strips import statements', () => {
      const text = `Here is some info.\nimport { db } from '@oppsera/db';\nThis is the end.`;
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/^import\s+/m);
    });

    it('strips export statements', () => {
      const text = `Here is info.\nexport function createOrder() { return null; }\nDone.`;
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/^export\s+/m);
    });

    it('strips const declarations with assignments', () => {
      const text = `Info here.\nconst result = await db.select().from(orders);\nEnd.`;
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/^const\s+\w+\s*=/m);
    });

    it('strips function definitions', () => {
      const text = `Info.\nfunction processOrder(id: string) {\n  return true;\n}\nDone.`;
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/^(?:async\s+)?function\s+\w+/m);
    });
  });

  describe('connection strings and API keys', () => {
    it('strips postgres connection strings', () => {
      const text = 'Connect to postgresql://user:pass@localhost:5432/mydb.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/postgres(?:ql)?:\/\//i);
    });

    it('strips redis URLs', () => {
      const text = 'Cache uses redis://localhost:6379.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/redis:\/\//i);
    });
  });

  describe('internal URLs', () => {
    it('strips localhost URLs', () => {
      const text = 'Access the dev server at http://localhost:3000/orders.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('localhost');
    });

    it('strips internal IP addresses', () => {
      const text = 'The internal API is at http://192.168.1.100:8080/api.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('192.168.1.100');
    });
  });

  describe('stack traces', () => {
    it('strips stack trace lines', () => {
      const text = [
        'Something went wrong.',
        'Error: Failed to create order',
        '    at createOrder (orders.ts:45:12)',
        '    at handler (route.ts:23:5)',
        'Please try again.',
      ].join('\n');
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toMatch(/at\s+\w+\s+\([^)]+\.ts:\d+:\d+\)/);
    });
  });

  describe('environment variables', () => {
    it('strips process.env references', () => {
      const text = 'The key is set via process.env.ANTHROPIC_API_KEY.';
      const result = sanitizeResponse(text, 'customer');
      expect(result).not.toContain('process.env');
    });
  });

  describe('staff mode passthrough', () => {
    it('staff mode returns text unchanged', () => {
      const text = 'import { db } from "@oppsera/db"; // /api/v1/orders postgres://localhost/db';
      const result = sanitizeResponse(text, 'staff');
      expect(result).toBe(text);
    });
  });
});

// ── validateCustomerSafe tests ────────────────────────────────────────────────

describe('validateCustomerSafe', () => {
  it('returns safe=true for clean customer-facing text', () => {
    const text = 'To create an order, go to the Orders page and click Create Order.';
    const { safe, violations } = validateCustomerSafe(text);
    expect(safe).toBe(true);
    expect(violations).toHaveLength(0);
  });

  it('returns safe=false when API path is present', () => {
    const text = 'Call /api/v1/orders to get all orders.';
    const { safe, violations } = validateCustomerSafe(text);
    expect(safe).toBe(false);
    expect(violations).toContain('api_path');
  });

  it('returns safe=false when internal module is present', () => {
    const text = 'Using @oppsera/module-orders for this.';
    const { safe, violations } = validateCustomerSafe(text);
    expect(safe).toBe(false);
    expect(violations).toContain('internal_module');
  });

  it('returns safe=false when connection string is present', () => {
    const text = 'postgres://user:pass@db:5432/mydb';
    const { safe, violations } = validateCustomerSafe(text);
    expect(safe).toBe(false);
    expect(violations).toContain('connection_string');
  });
});
