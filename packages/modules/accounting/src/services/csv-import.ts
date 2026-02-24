/**
 * CSV COA import parser and validator.
 *
 * Pipeline:
 *   1. Parse CSV (flexible column aliases, handle BOM/whitespace)
 *   2. Normalize account types
 *   3. Detect hardcoded state names → auto-convert to [STATE_NAME]
 *   4. Validate each row (required fields, uniqueness, format)
 *   5. Structural validation (parent refs, circular refs, fallbacks)
 *   6. Apply state name if provided
 *
 * Returns { isValid, errors[], warnings[], parsedAccounts[] }
 */

import { convertHardcodedStateToPlaceholder, replaceStatePlaceholder } from './state-placeholder';

// ── Types ────────────────────────────────────────────────────────────

export interface ParsedAccount {
  accountNumber: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  parentAccountNumber?: string;
  classificationName?: string;
  description?: string;
  isActive: boolean;
  isFallback: boolean;
}

export interface CsvValidationMessage {
  row?: number;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface CsvValidationResult {
  isValid: boolean;
  errors: CsvValidationMessage[];
  warnings: CsvValidationMessage[];
  parsedAccounts: ParsedAccount[];
  stateDetections: Array<{ originalName: string; stateDetected: string }>;
}

// ── Column Aliases ───────────────────────────────────────────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  accountNumber: [
    'account_number', 'accountnumber', 'acct_no', 'acct_num', 'account_no',
    'account_num', 'account #', 'acct #', 'number', 'acct', 'code',
  ],
  name: [
    'name', 'account_name', 'accountname', 'acct_name', 'description',
    'account', 'title', 'label',
  ],
  accountType: [
    'account_type', 'accounttype', 'acct_type', 'type', 'category',
  ],
  parentAccountNumber: [
    'parent_account_number', 'parent_account', 'parent_acct', 'parent',
    'parent_number', 'parent_acct_no', 'parent_no',
  ],
  classificationName: [
    'classification', 'classification_name', 'class', 'group', 'section',
  ],
  description: [
    'description', 'desc', 'notes', 'memo', 'detail',
  ],
  isActive: [
    'is_active', 'isactive', 'active', 'status', 'enabled',
  ],
};

// ── Account Type Normalization ───────────────────────────────────────

const ACCOUNT_TYPE_ALIASES: Record<string, 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'> = {
  asset: 'asset',
  assets: 'asset',
  'current asset': 'asset',
  'current assets': 'asset',
  'fixed asset': 'asset',
  'fixed assets': 'asset',
  'other asset': 'asset',
  'other assets': 'asset',
  'contra asset': 'asset',
  bank: 'asset',
  'accounts receivable': 'asset',
  receivable: 'asset',
  liability: 'liability',
  liabilities: 'liability',
  'current liability': 'liability',
  'current liabilities': 'liability',
  'long term liability': 'liability',
  'long-term liability': 'liability',
  'other liability': 'liability',
  'accounts payable': 'liability',
  payable: 'liability',
  equity: 'equity',
  "owner's equity": 'equity',
  'owners equity': 'equity',
  'shareholders equity': 'equity',
  'retained earnings': 'equity',
  capital: 'equity',
  revenue: 'revenue',
  income: 'revenue',
  sales: 'revenue',
  'other income': 'revenue',
  'other revenue': 'revenue',
  expense: 'expense',
  expenses: 'expense',
  cogs: 'expense',
  'cost of goods sold': 'expense',
  'cost of sales': 'expense',
  'other expense': 'expense',
  'other expenses': 'expense',
  'operating expense': 'expense',
  'operating expenses': 'expense',
};

const VALID_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

// ── CSV Parser ───────────────────────────────────────────────────────

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    let inQ = false;
    for (const ch of headerLine) {
      if (ch === '"') inQ = !inQ;
      else if (ch === d && !inQ) count++;
    }
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

function parseCsvLine(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const ROW_TYPE_HEADER_MARKERS = new Set(['hdr', 'rec', 'record_type', 'recordtype', 'row_type', 'rowtype', 'type']);

function detectRowTypePrefix(headers: string[], firstFewRows: string[][]): boolean {
  if (headers.length < 2) return false;
  const firstHeader = headers[0]!.toLowerCase().trim();
  if (!ROW_TYPE_HEADER_MARKERS.has(firstHeader)) return false;
  if (firstFewRows.length === 0) return false;
  const prefixRe = /^[A-Z]{1,6}$/;
  const firstVal = firstFewRows[0]?.[0]?.trim() ?? '';
  if (!prefixRe.test(firstVal)) return false;
  const matchCount = firstFewRows.filter((r) => (r[0]?.trim() ?? '') === firstVal).length;
  return matchCount / firstFewRows.length >= 0.8;
}

function resolveColumnIndex(headerColumns: string[], targetAliases: string[]): number {
  for (let i = 0; i < headerColumns.length; i++) {
    const col = headerColumns[i]!.toLowerCase().replace(/[^a-z0-9_# ]/g, '').trim();
    if (targetAliases.includes(col)) return i;
  }
  return -1;
}

function resolveNormalBalanceFromType(accountType: string): 'debit' | 'credit' {
  return accountType === 'asset' || accountType === 'expense' ? 'debit' : 'credit';
}

// ── Main Parser ──────────────────────────────────────────────────────

export function parseCsvImport(
  csvContent: string,
  stateName?: string,
): CsvValidationResult {
  const errors: CsvValidationMessage[] = [];
  const warnings: CsvValidationMessage[] = [];
  const stateDetections: Array<{ originalName: string; stateDetected: string }> = [];

  // Size guard
  if (csvContent.length > 5 * 1024 * 1024) {
    errors.push({ message: 'CSV file exceeds 5MB limit', severity: 'error' });
    return { isValid: false, errors, warnings, parsedAccounts: [], stateDetections };
  }

  // Strip BOM and split
  const raw = stripBom(csvContent).trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    errors.push({ message: 'CSV must contain a header row and at least one data row', severity: 'error' });
    return { isValid: false, errors, warnings, parsedAccounts: [], stateDetections };
  }

  if (lines.length > 2001) {
    errors.push({ message: `CSV has ${lines.length - 1} rows (max 2000)`, severity: 'error' });
    return { isValid: false, errors, warnings, parsedAccounts: [], stateDetections };
  }

  // Detect delimiter from header line
  const delimiter = detectDelimiter(lines[0]!);

  // Parse header
  const headerCols = parseCsvLine(lines[0]!, delimiter);

  // Parse all data rows first (needed for row-type prefix detection)
  const allParsedRows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]!, delimiter);
    if (vals.every((v) => !v)) continue; // skip empty rows
    allParsedRows.push(vals);
  }

  // Detect and strip row-type prefix column (e.g., HDR/CU from legacy system exports)
  let finalHeaders = headerCols;
  let finalRows = allParsedRows;
  if (detectRowTypePrefix(headerCols, allParsedRows.slice(0, 10))) {
    finalHeaders = headerCols.slice(1);
    finalRows = allParsedRows.map((r) => r.slice(1));
  }

  // Resolve columns
  const acctNumIdx = resolveColumnIndex(finalHeaders, COLUMN_ALIASES.accountNumber!);
  const nameIdx = resolveColumnIndex(finalHeaders, COLUMN_ALIASES.name!);
  const typeIdx = resolveColumnIndex(finalHeaders, COLUMN_ALIASES.accountType!);
  const parentIdx = resolveColumnIndex(finalHeaders, COLUMN_ALIASES.parentAccountNumber!);
  const classIdx = resolveColumnIndex(finalHeaders, COLUMN_ALIASES.classificationName!);
  const descIdx = resolveColumnIndex(finalHeaders, COLUMN_ALIASES.description!);
  const activeIdx = resolveColumnIndex(finalHeaders, COLUMN_ALIASES.isActive!);

  // Require at minimum accountNumber + name
  if (acctNumIdx === -1) {
    errors.push({ message: 'Missing required column: Account Number (try: account_number, acct_no, number)', severity: 'error' });
  }
  if (nameIdx === -1) {
    errors.push({ message: 'Missing required column: Name (try: name, account_name, title)', severity: 'error' });
  }

  if (errors.length > 0) {
    return { isValid: false, errors, warnings, parsedAccounts: [], stateDetections };
  }

  // Validate rows
  const parsedAccounts: ParsedAccount[] = [];
  const seenNumbers = new Set<string>();

  for (let i = 0; i < finalRows.length; i++) {
    const rowNum = i + 2; // 1-indexed with header
    const values = finalRows[i]!;

    const rawNumber = values[acctNumIdx]?.trim().replace(/"/g, '') ?? '';
    const rawName = values[nameIdx]?.trim().replace(/"/g, '') ?? '';
    const rawType = typeIdx >= 0 ? values[typeIdx]?.trim().replace(/"/g, '').toLowerCase() ?? '' : '';
    const rawParent = parentIdx >= 0 ? values[parentIdx]?.trim().replace(/"/g, '') ?? '' : '';
    const rawClass = classIdx >= 0 ? values[classIdx]?.trim().replace(/"/g, '') ?? '' : '';
    const rawDesc = descIdx >= 0 ? values[descIdx]?.trim().replace(/"/g, '') ?? '' : '';
    const rawActive = activeIdx >= 0 ? values[activeIdx]?.trim().replace(/"/g, '').toLowerCase() ?? '' : '';

    // Skip empty rows
    if (!rawNumber && !rawName) continue;

    // Validate account number
    if (!rawNumber) {
      errors.push({ row: rowNum, field: 'accountNumber', message: 'Account number is required', severity: 'error' });
      continue;
    }

    if (!/^[A-Za-z0-9\-._]{1,20}$/.test(rawNumber)) {
      errors.push({ row: rowNum, field: 'accountNumber', message: `Invalid account number format: "${rawNumber}" (1-20 alphanumeric chars)`, severity: 'error' });
      continue;
    }

    if (seenNumbers.has(rawNumber)) {
      errors.push({ row: rowNum, field: 'accountNumber', message: `Duplicate account number: ${rawNumber}`, severity: 'error' });
      continue;
    }
    seenNumbers.add(rawNumber);

    // Validate name
    if (!rawName) {
      errors.push({ row: rowNum, field: 'name', message: 'Account name is required', severity: 'error' });
      continue;
    }

    if (rawName.length > 200) {
      errors.push({ row: rowNum, field: 'name', message: `Account name exceeds 200 characters (${rawName.length})`, severity: 'error' });
      continue;
    }

    // Normalize account type
    let accountType: typeof VALID_ACCOUNT_TYPES[number] | undefined;
    if (rawType) {
      accountType = ACCOUNT_TYPE_ALIASES[rawType];
      if (!accountType) {
        errors.push({ row: rowNum, field: 'accountType', message: `Unknown account type: "${rawType}"`, severity: 'error' });
        continue;
      }
    } else {
      // Infer from account number range if no type column
      accountType = inferTypeFromNumber(rawNumber);
      if (!accountType) {
        errors.push({ row: rowNum, field: 'accountType', message: 'Account type is required (no type column found and cannot infer from number)', severity: 'error' });
        continue;
      }
      warnings.push({ row: rowNum, field: 'accountType', message: `Inferred type "${accountType}" from account number ${rawNumber}`, severity: 'warning' });
    }

    // Detect hardcoded state names
    const stateResult = convertHardcodedStateToPlaceholder(rawName);
    let resolvedName = rawName;
    if (stateResult.stateDetected) {
      stateDetections.push({ originalName: rawName, stateDetected: stateResult.stateDetected });
      resolvedName = stateResult.converted;
      warnings.push({
        row: rowNum,
        field: 'name',
        message: `Detected state "${stateResult.stateDetected}" in name — converted to placeholder`,
        severity: 'warning',
      });
    }

    // Apply state name if provided
    if (stateName) {
      resolvedName = replaceStatePlaceholder(resolvedName, stateName);
    }

    // Parse isActive
    let isActive = true;
    if (rawActive) {
      isActive = !['false', '0', 'no', 'inactive', 'disabled'].includes(rawActive);
    }

    parsedAccounts.push({
      accountNumber: rawNumber,
      name: resolvedName,
      accountType,
      normalBalance: resolveNormalBalanceFromType(accountType),
      parentAccountNumber: rawParent || undefined,
      classificationName: rawClass || undefined,
      description: rawDesc || undefined,
      isActive,
      isFallback: false,
    });
  }

  // ── Structural validation ──────────────────────────────────────────

  const numberSet = new Set(parsedAccounts.map((a) => a.accountNumber));

  // Validate parent references exist
  for (const acct of parsedAccounts) {
    if (acct.parentAccountNumber && !numberSet.has(acct.parentAccountNumber)) {
      errors.push({
        field: 'parentAccountNumber',
        message: `Account ${acct.accountNumber} references parent "${acct.parentAccountNumber}" which doesn't exist in the CSV`,
        severity: 'error',
      });
    }
  }

  // Detect circular parent references
  const parentMap = new Map<string, string>();
  for (const acct of parsedAccounts) {
    if (acct.parentAccountNumber) {
      parentMap.set(acct.accountNumber, acct.parentAccountNumber);
    }
  }

  for (const acct of parsedAccounts) {
    if (acct.parentAccountNumber) {
      const visited = new Set<string>();
      let current: string | undefined = acct.accountNumber;
      while (current) {
        if (visited.has(current)) {
          errors.push({
            message: `Circular parent reference detected: ${[...visited, current].join(' → ')}`,
            severity: 'error',
          });
          break;
        }
        visited.add(current);
        current = parentMap.get(current);
      }
    }
  }

  // Validate parent-child type consistency
  const acctByNumber = new Map(parsedAccounts.map((a) => [a.accountNumber, a]));
  for (const acct of parsedAccounts) {
    if (acct.parentAccountNumber) {
      const parent = acctByNumber.get(acct.parentAccountNumber);
      if (parent && parent.accountType !== acct.accountType) {
        warnings.push({
          message: `Account ${acct.accountNumber} (${acct.accountType}) has parent ${parent.accountNumber} (${parent.accountType}) — types don't match`,
          severity: 'warning',
        });
      }
    }
  }

  // Check for at least one account per major type
  const typeCounts = new Map<string, number>();
  for (const acct of parsedAccounts) {
    typeCounts.set(acct.accountType, (typeCounts.get(acct.accountType) ?? 0) + 1);
  }
  for (const type of VALID_ACCOUNT_TYPES) {
    if (!typeCounts.has(type)) {
      warnings.push({
        message: `No ${type} accounts found in CSV — consider adding at least one`,
        severity: 'warning',
      });
    }
  }

  // Check hierarchy depth (max 5 levels)
  for (const acct of parsedAccounts) {
    let depth = 0;
    let current: string | undefined = acct.accountNumber;
    while (current && parentMap.has(current)) {
      depth++;
      current = parentMap.get(current);
      if (depth > 5) {
        warnings.push({
          message: `Account ${acct.accountNumber} has hierarchy depth > 5 levels — consider flattening`,
          severity: 'warning',
        });
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    parsedAccounts,
    stateDetections,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function inferTypeFromNumber(num: string): typeof VALID_ACCOUNT_TYPES[number] | undefined {
  const n = parseInt(num, 10);
  if (isNaN(n)) return undefined;
  if (n >= 1000 && n < 2000) return 'asset';
  if (n >= 2000 && n < 3000) return 'liability';
  if (n >= 3000 && n < 4000) return 'equity';
  if (n >= 4000 && n < 5000) return 'revenue';
  if (n >= 5000 && n < 10000) return 'expense';
  // Extended ranges
  if (n >= 10000 && n < 20000) return 'asset';
  if (n >= 20000 && n < 30000) return 'liability';
  if (n >= 30000 && n < 40000) return 'equity';
  if (n >= 40000 && n < 50000) return 'revenue';
  if (n >= 50000 && n < 100000) return 'expense';
  return undefined;
}
