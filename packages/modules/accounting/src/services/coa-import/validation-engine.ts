/**
 * Enhanced validation engine for COA import.
 *
 * Validates accounts after analysis/inference and produces actionable
 * issues with resolution suggestions.
 */

import type {
  AccountPreview,
  AccountType,
  IssueCode,
  PreviewIssue,
  ValidationSummary,
} from './types';

// ── Main Validation ─────────────────────────────────────────────────

export function validateAccounts(
  accounts: AccountPreview[],
  existingAccountNumbers: Set<string>,
): ValidationSummary {
  const allIssues: Array<PreviewIssue & { rowNumber?: number; accountNumber?: string }> = [];
  let validRows = 0;

  const codeSet = new Set<string>();
  const nameSet = new Map<string, number>(); // name → first row
  const childrenOf = new Map<string, string[]>(); // parent → children

  // Build parent→children map
  for (const acct of accounts) {
    if (acct.parentAccountNumber) {
      const children = childrenOf.get(acct.parentAccountNumber) ?? [];
      children.push(acct.accountNumber);
      childrenOf.set(acct.parentAccountNumber, children);
    }
  }

  for (const acct of accounts) {
    const rowIssues: PreviewIssue[] = [];

    // 1. Missing required fields
    if (!acct.accountNumber) {
      rowIssues.push(makeIssue('MISSING_CODE', 'error', 'Account number is required'));
    }
    if (!acct.name) {
      rowIssues.push(makeIssue('MISSING_NAME', 'error', 'Account name is required'));
    }

    // 2. Code format validation
    if (acct.accountNumber && !/^[A-Za-z0-9\-._]{1,20}$/.test(acct.accountNumber)) {
      rowIssues.push(makeIssue('CODE_FORMAT', 'error',
        `Invalid account number format: "${acct.accountNumber}" (1-20 alphanumeric chars, hyphens, dots, underscores)`,
        [{ action: 'auto_fix', label: 'Clean code', description: 'Remove invalid characters' }],
      ));
    }

    // 3. Leading zero detection (Excel often strips these)
    if (acct.accountNumber && /^0/.test(acct.accountNumber)) {
      rowIssues.push(makeIssue('LEADING_ZERO_LOSS', 'warning',
        `Account "${acct.accountNumber}" has a leading zero — ensure it was not stripped by Excel`,
      ));
    }

    // 4. Duplicate code within import
    if (acct.accountNumber && codeSet.has(acct.accountNumber)) {
      rowIssues.push(makeIssue('DUPLICATE_CODE', 'error',
        `Duplicate account number: ${acct.accountNumber}`,
        [
          { action: 'skip', label: 'Skip row', description: 'Skip this duplicate row' },
          { action: 'rename', label: 'Rename', description: 'Change the account number' },
          { action: 'merge', label: 'Merge', description: 'Merge with the existing account' },
        ],
      ));
    }
    codeSet.add(acct.accountNumber);

    // 5. Duplicate name (warning only)
    const nameLower = acct.name.toLowerCase();
    const firstNameRow = nameSet.get(nameLower);
    if (firstNameRow !== undefined) {
      rowIssues.push(makeIssue('DUPLICATE_NAME', 'warning',
        `Duplicate account name "${acct.name}" (first seen at row ${firstNameRow})`,
      ));
    }
    nameSet.set(nameLower, acct.rowNumber);

    // 6. Existing account collision
    if (acct.accountNumber && existingAccountNumbers.has(acct.accountNumber)) {
      rowIssues.push(makeIssue('EXISTING_ACCOUNT', 'warning',
        `Account ${acct.accountNumber} already exists — will be skipped`,
        [
          { action: 'skip', label: 'Skip (default)', description: 'Keep existing account, skip this row' },
          { action: 'merge', label: 'Update', description: 'Update existing account with imported data' },
        ],
      ));
    }

    // 7. Type validation
    if (!acct.accountType) {
      rowIssues.push(makeIssue('MISSING_TYPE', 'error',
        'Could not determine account type',
        [{ action: 'retype', label: 'Set type', description: 'Manually assign an account type' }],
      ));
    }

    // 8. Low type confidence
    if (acct.typeConfidence < 50 && acct.typeConfidence > 0) {
      rowIssues.push(makeIssue('LOW_TYPE_CONFIDENCE', 'warning',
        `Account type "${acct.accountType}" has low confidence (${acct.typeConfidence}%) — ${acct.typeReason}`,
        [{ action: 'retype', label: 'Change type', description: 'Manually override the inferred type' }],
      ));
    }

    // 9. Parent reference validation
    if (acct.parentAccountNumber) {
      const parentExists = accounts.some((a) => a.accountNumber === acct.parentAccountNumber);
      const existsInDb = existingAccountNumbers.has(acct.parentAccountNumber);
      if (!parentExists && !existsInDb) {
        rowIssues.push(makeIssue('PARENT_NOT_FOUND', 'error',
          `Parent account "${acct.parentAccountNumber}" not found in import file or existing accounts`,
          [
            { action: 'create_header', label: 'Create parent', description: 'Auto-create a header account for the parent' },
            { action: 'reparent', label: 'Change parent', description: 'Assign a different parent' },
            { action: 'auto_fix', label: 'Remove parent', description: 'Import as a root account' },
          ],
        ));
      }
    }

    // 10. Parent-child type mismatch
    if (acct.parentAccountNumber) {
      const parent = accounts.find((a) => a.accountNumber === acct.parentAccountNumber);
      if (parent && parent.accountType !== acct.accountType) {
        rowIssues.push(makeIssue('TYPE_MISMATCH_PARENT', 'warning',
          `Account type "${acct.accountType}" differs from parent "${parent.accountNumber}" type "${parent.accountType}"`,
        ));
      }
    }

    // 11. Header/posting classification
    const hasChildren = childrenOf.has(acct.accountNumber);
    if (acct.isPosting && hasChildren) {
      rowIssues.push(makeIssue('POSTING_WITH_CHILDREN', 'warning',
        'This posting account has child accounts — consider making it a header account',
      ));
    }

    // Assign issues to the account preview
    acct.issues = rowIssues;

    if (rowIssues.every((i) => i.severity !== 'error')) {
      validRows++;
    }

    for (const issue of rowIssues) {
      allIssues.push({ ...issue, rowNumber: acct.rowNumber, accountNumber: acct.accountNumber });
    }
  }

  // Structural validation: circular parent references
  const circularErrors = detectCircularRefs(accounts);
  for (const err of circularErrors) {
    allIssues.push(err);
  }

  // Structural validation: hierarchy depth
  const depthWarnings = checkDepth(accounts);
  for (const warn of depthWarnings) {
    allIssues.push(warn);
  }

  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
  const infoCount = allIssues.filter((i) => i.severity === 'info').length;

  // Type distribution
  const typeDistribution: Record<AccountType, number> = {
    asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0,
  };
  for (const acct of accounts) {
    if (acct.accountType) {
      typeDistribution[acct.accountType]++;
    }
  }

  return {
    isValid: errorCount === 0,
    totalRows: accounts.length,
    validRows,
    errorCount,
    warningCount,
    infoCount,
    issues: allIssues,
    existingAccountNumbers: [...existingAccountNumbers].filter((n) =>
      accounts.some((a) => a.accountNumber === n),
    ),
    typeDistribution,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function makeIssue(
  code: IssueCode,
  severity: 'error' | 'warning' | 'info',
  message: string,
  resolutions?: PreviewIssue['resolutions'],
): PreviewIssue {
  return { code, severity, message, resolutions };
}

function detectCircularRefs(
  accounts: AccountPreview[],
): Array<PreviewIssue & { rowNumber?: number; accountNumber?: string }> {
  const parentMap = new Map<string, string>();
  for (const acct of accounts) {
    if (acct.parentAccountNumber) {
      parentMap.set(acct.accountNumber, acct.parentAccountNumber);
    }
  }

  const issues: Array<PreviewIssue & { rowNumber?: number; accountNumber?: string }> = [];
  const visited = new Set<string>();

  for (const acct of accounts) {
    if (!acct.parentAccountNumber || visited.has(acct.accountNumber)) continue;

    const chain = new Set<string>();
    let current: string | undefined = acct.accountNumber;
    while (current) {
      if (chain.has(current)) {
        issues.push({
          code: 'CIRCULAR_PARENT',
          severity: 'error',
          message: `Circular parent reference: ${[...chain, current].join(' → ')}`,
          accountNumber: acct.accountNumber,
          rowNumber: acct.rowNumber,
        });
        break;
      }
      chain.add(current);
      visited.add(current);
      current = parentMap.get(current);
    }
  }

  return issues;
}

function checkDepth(
  accounts: AccountPreview[],
): Array<PreviewIssue & { rowNumber?: number; accountNumber?: string }> {
  const parentMap = new Map<string, string>();
  for (const acct of accounts) {
    if (acct.parentAccountNumber) {
      parentMap.set(acct.accountNumber, acct.parentAccountNumber);
    }
  }

  const issues: Array<PreviewIssue & { rowNumber?: number; accountNumber?: string }> = [];

  for (const acct of accounts) {
    let depth = 0;
    let current: string | undefined = acct.accountNumber;
    const seen = new Set<string>();
    while (current && parentMap.has(current)) {
      if (seen.has(current)) break; // circular — handled separately
      seen.add(current);
      depth++;
      current = parentMap.get(current);
      if (depth > 5) {
        issues.push({
          code: 'DEPTH_EXCEEDED',
          severity: 'warning',
          message: `Account ${acct.accountNumber} has hierarchy depth > 5 — consider flattening`,
          accountNumber: acct.accountNumber,
          rowNumber: acct.rowNumber,
        });
        break;
      }
    }
  }

  return issues;
}
