/**
 * COA validation engine.
 *
 * - validateFullCoa: all-accounts validation (missing fallbacks, orphans, circular refs, depth)
 * - validateSingleAccount: single-account constraints (uniqueness, parent type, format)
 * - validateMerge: pre-merge checks (same type, not system, not self)
 * - validateDeactivation: deactivation blockers (system, children, settings refs)
 */

import { detectCircularReference, computeDepth } from './hierarchy-helpers';
import type { AccountNode } from './hierarchy-helpers';

// ── Types ────────────────────────────────────────────────────────────

export interface ValidationError {
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface GLAccountForValidation extends AccountNode {
  name: string;
  accountType: string;
  isActive: boolean;
  isFallback: boolean;
  isSystemAccount: boolean;
  isControlAccount: boolean;
  controlAccountType: string | null;
  status: string;
}

// ── Full COA Validation ──────────────────────────────────────────────

export function validateFullCoa(
  accounts: GLAccountForValidation[],
): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const activeAccounts = accounts.filter((a) => a.isActive && a.status === 'active');

  // 1. Check at least one account per major type
  const typeCounts = new Map<string, number>();
  for (const a of activeAccounts) {
    typeCounts.set(a.accountType, (typeCounts.get(a.accountType) ?? 0) + 1);
  }
  for (const type of ['asset', 'liability', 'equity', 'revenue', 'expense']) {
    if (!typeCounts.has(type)) {
      warnings.push({ message: `No active ${type} accounts found`, severity: 'warning' });
    }
  }

  // 2. No orphan parent references
  const idSet = new Set(accounts.map((a) => a.id));
  for (const a of accounts) {
    if (a.parentAccountId && !idSet.has(a.parentAccountId)) {
      errors.push({
        field: 'parentAccountId',
        message: `Account ${a.accountNumber} references non-existent parent`,
        severity: 'error',
      });
    }
  }

  // 3. No circular hierarchies
  const parentMap = new Map<string, string>();
  for (const a of accounts) {
    if (a.parentAccountId) parentMap.set(a.id, a.parentAccountId);
  }

  for (const a of accounts) {
    if (a.parentAccountId) {
      const visited = new Set<string>();
      let current: string | undefined = a.id;
      while (current) {
        if (visited.has(current)) {
          errors.push({
            message: `Circular hierarchy detected involving account ${a.accountNumber}`,
            severity: 'error',
          });
          break;
        }
        visited.add(current);
        current = parentMap.get(current);
      }
    }
  }

  // 4. Hierarchy depth <= 5
  for (const a of accounts) {
    const depth = computeDepth(a.id, accounts);
    if (depth > 5) {
      warnings.push({
        message: `Account ${a.accountNumber} has hierarchy depth ${depth} (max recommended: 5)`,
        severity: 'warning',
      });
    }
  }

  // 5. System/fallback accounts must be active
  for (const a of accounts) {
    if ((a.isSystemAccount || a.isFallback) && !a.isActive) {
      errors.push({
        message: `System/fallback account ${a.accountNumber} "${a.name}" is inactive — must be active`,
        severity: 'error',
      });
    }
  }

  // 6. No duplicate names under same parent
  const namesByParent = new Map<string, Set<string>>();
  for (const a of activeAccounts) {
    const key = a.parentAccountId ?? '__root__';
    const names = namesByParent.get(key) ?? new Set();
    const lower = a.name.toLowerCase();
    if (names.has(lower)) {
      warnings.push({
        message: `Duplicate account name "${a.name}" under same parent`,
        severity: 'warning',
      });
    }
    names.add(lower);
    namesByParent.set(key, names);
  }

  return { errors, warnings };
}

// ── Single Account Validation ────────────────────────────────────────

export function validateSingleAccount(
  account: {
    accountNumber: string;
    name: string;
    accountType: string;
    parentAccountId?: string | null;
  },
  existingAccounts: GLAccountForValidation[],
  excludeId?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Account number format
  if (!account.accountNumber || account.accountNumber.length > 20) {
    errors.push({
      field: 'accountNumber',
      message: 'Account number must be 1-20 characters',
      severity: 'error',
    });
  }

  // Name required
  if (!account.name || account.name.length > 200) {
    errors.push({
      field: 'name',
      message: 'Account name must be 1-200 characters',
      severity: 'error',
    });
  }

  // Unique account number
  const duplicate = existingAccounts.find(
    (a) => a.accountNumber === account.accountNumber && a.id !== excludeId,
  );
  if (duplicate) {
    errors.push({
      field: 'accountNumber',
      message: `Account number ${account.accountNumber} already exists`,
      severity: 'error',
    });
  }

  // Parent validation
  if (account.parentAccountId) {
    const parent = existingAccounts.find((a) => a.id === account.parentAccountId);
    if (!parent) {
      errors.push({
        field: 'parentAccountId',
        message: 'Parent account does not exist',
        severity: 'error',
      });
    } else {
      // Parent must be active
      if (!parent.isActive) {
        errors.push({
          field: 'parentAccountId',
          message: 'Parent account is inactive',
          severity: 'error',
        });
      }

      // Same account type
      if (parent.accountType !== account.accountType) {
        errors.push({
          field: 'parentAccountId',
          message: `Parent account type (${parent.accountType}) differs from child (${account.accountType})`,
          severity: 'error',
        });
      }

      // Circular reference check (only for updates with existing id)
      if (excludeId) {
        if (detectCircularReference(excludeId, account.parentAccountId, existingAccounts)) {
          errors.push({
            field: 'parentAccountId',
            message: 'Setting this parent would create a circular reference',
            severity: 'error',
          });
        }
      }
    }
  }

  return errors;
}

// ── Merge Validation ─────────────────────────────────────────────────

export function validateMerge(
  source: GLAccountForValidation,
  target: GLAccountForValidation,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (source.id === target.id) {
    errors.push({ message: 'Cannot merge an account into itself', severity: 'error' });
  }

  if (source.accountType !== target.accountType) {
    errors.push({
      message: `Cannot merge accounts of different types: ${source.accountType} → ${target.accountType}`,
      severity: 'error',
    });
  }

  if (source.isSystemAccount || source.isFallback) {
    errors.push({
      message: 'Cannot merge a system or fallback account',
      severity: 'error',
    });
  }

  if (!target.isActive || target.status !== 'active') {
    errors.push({
      message: 'Target account must be active',
      severity: 'error',
    });
  }

  if (source.status === 'pending_merge') {
    errors.push({
      message: 'Source account is already pending merge',
      severity: 'error',
    });
  }

  return errors;
}

// ── Deactivation Validation ──────────────────────────────────────────

export function validateDeactivation(
  account: GLAccountForValidation,
  activeChildren: GLAccountForValidation[],
  hasJournalLines: boolean,
  settingsReferences: string[],
  mappingReferences: string[],
): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (account.isSystemAccount || account.isFallback) {
    errors.push({
      message: 'Cannot deactivate a system or fallback account',
      severity: 'error',
    });
  }

  if (activeChildren.length > 0) {
    errors.push({
      message: `Cannot deactivate — has ${activeChildren.length} active child account(s)`,
      severity: 'error',
    });
  }

  if (settingsReferences.length > 0) {
    errors.push({
      message: `Cannot deactivate — referenced in accounting settings as: ${settingsReferences.join(', ')}`,
      severity: 'error',
    });
  }

  if (mappingReferences.length > 0) {
    errors.push({
      message: `Cannot deactivate — referenced in GL mappings: ${mappingReferences.join(', ')}`,
      severity: 'error',
    });
  }

  if (hasJournalLines) {
    warnings.push({
      message: 'Account has existing journal lines — it will be hidden from new entries but preserved in reports',
      severity: 'warning',
    });
  }

  return { errors, warnings };
}
