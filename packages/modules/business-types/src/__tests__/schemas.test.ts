import { describe, it, expect } from 'vitest';
import {
  CreateBusinessTypeInputSchema,
  UpdateBusinessTypeMetadataInputSchema,
  ModuleDefaultInputSchema,
  AccountingTemplateInputSchema,
  RoleTemplateInputSchema,
  PublishVersionInputSchema,
} from '../types/schemas';

describe('CreateBusinessTypeInputSchema', () => {
  it('accepts valid input', () => {
    const result = CreateBusinessTypeInputSchema.safeParse({
      name: 'Restaurant',
      slug: 'restaurant',
      categoryId: 'cat-1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = CreateBusinessTypeInputSchema.safeParse({
      name: '',
      slug: 'restaurant',
      categoryId: 'cat-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid slug format', () => {
    const result = CreateBusinessTypeInputSchema.safeParse({
      name: 'Test',
      slug: 'Has Spaces',
      categoryId: 'cat-1',
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults for optional boolean fields', () => {
    const result = CreateBusinessTypeInputSchema.parse({
      name: 'Test',
      slug: 'test',
      categoryId: 'cat-1',
    });
    expect(result.isActive).toBe(true);
    expect(result.showAtSignup).toBe(false);
    expect(result.sortOrder).toBe(0);
  });
});

describe('UpdateBusinessTypeMetadataInputSchema', () => {
  it('accepts partial updates', () => {
    const result = UpdateBusinessTypeMetadataInputSchema.safeParse({ name: 'New Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = UpdateBusinessTypeMetadataInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects empty name string', () => {
    const result = UpdateBusinessTypeMetadataInputSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });
});

describe('ModuleDefaultInputSchema', () => {
  it('accepts valid module default', () => {
    const result = ModuleDefaultInputSchema.safeParse({
      moduleKey: 'pos',
      isEnabled: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessMode).toBe('full');
    }
  });

  it('rejects empty module key', () => {
    const result = ModuleDefaultInputSchema.safeParse({
      moduleKey: '',
      isEnabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('validates access mode enum', () => {
    const result = ModuleDefaultInputSchema.safeParse({
      moduleKey: 'pos',
      isEnabled: true,
      accessMode: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('AccountingTemplateInputSchema', () => {
  it('accepts minimal valid input', () => {
    const result = AccountingTemplateInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('applies defaults', () => {
    const result = AccountingTemplateInputSchema.parse({});
    expect(result.cogsBehavior).toBe('disabled');
    expect(result.taxBehavior.defaultTaxInclusive).toBe(false);
    expect(result.taxBehavior.separateTaxLiability).toBe(true);
    expect(result.fiscalSettings.reportingCurrency).toBe('USD');
  });

  it('validates cogs behavior enum', () => {
    const result = AccountingTemplateInputSchema.safeParse({
      cogsBehavior: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts full valid input', () => {
    const result = AccountingTemplateInputSchema.safeParse({
      revenueCategories: { serviceRevenue: '4000', foodRevenue: '4100' },
      paymentGlMappings: { cash: '1000', creditCard: '1100' },
      taxBehavior: { defaultTaxInclusive: true, separateTaxLiability: false },
      cogsBehavior: 'perpetual',
      deferredRevenue: { enabled: true, liabilityAccount: '2500' },
      fiscalSettings: { fiscalYearStart: '01-01', reportingCurrency: 'CAD' },
    });
    expect(result.success).toBe(true);
  });
});

describe('RoleTemplateInputSchema', () => {
  it('accepts valid role template', () => {
    const result = RoleTemplateInputSchema.safeParse({
      roleName: 'Manager',
      roleKey: 'manager',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role key format', () => {
    const result = RoleTemplateInputSchema.safeParse({
      roleName: 'Manager',
      roleKey: 'Has-Hyphens',
    });
    expect(result.success).toBe(false);
  });

  it('applies permission default', () => {
    const result = RoleTemplateInputSchema.parse({
      roleName: 'Staff',
      roleKey: 'staff',
    });
    expect(result.permissions).toEqual([]);
  });
});

describe('PublishVersionInputSchema', () => {
  it('requires change summary', () => {
    const result = PublishVersionInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty change summary', () => {
    const result = PublishVersionInputSchema.safeParse({ changeSummary: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid change summary', () => {
    const result = PublishVersionInputSchema.safeParse({
      changeSummary: 'Added new modules',
    });
    expect(result.success).toBe(true);
  });
});
