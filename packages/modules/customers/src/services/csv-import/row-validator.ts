/**
 * Per-row validation against the customer schema.
 *
 * Applies column mappings + transforms to raw CSV rows,
 * coerces types, and produces mapped customer rows with validation messages.
 */

import type {
  ColumnMapping,
  DetectedTransform,
  MappedCustomerRow,
  ValidationMessage,
} from './import-types';
import { getTargetFieldByKey } from './column-aliases';
import {
  splitFullName,
  splitCityStateZip,
  coerceBoolean,
  coerceDate,
  coerceGender,
  coerceStatus,
  parseCurrencyToCents,
  parseTags,
  normalizePhone,
  detectEntityType,
} from './data-transforms';

// ── Email validation ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

// ── Apply single mapping to a value ──────────────────────────────

function coerceValue(
  value: string,
  targetFieldKey: string,
): { result: unknown; warning?: string } {
  const field = getTargetFieldByKey(targetFieldKey);
  if (!field) return { result: value };

  const trimmed = value.trim();
  if (!trimmed) return { result: null };

  switch (field.dataType) {
    case 'boolean': {
      const bool = coerceBoolean(trimmed);
      if (bool === null) {
        return { result: null, warning: `Could not parse "${trimmed}" as boolean` };
      }
      return { result: bool };
    }

    case 'number': {
      // Financial fields: parse as cents
      if (targetFieldKey === 'houseAccountBalance' || targetFieldKey === 'creditLimit') {
        const cents = parseCurrencyToCents(trimmed);
        if (cents === null) {
          return { result: null, warning: `Could not parse "${trimmed}" as currency` };
        }
        return { result: cents };
      }
      // Handicap index
      const num = parseFloat(trimmed);
      if (isNaN(num)) {
        return { result: null, warning: `Could not parse "${trimmed}" as number` };
      }
      return { result: num };
    }

    case 'date': {
      const date = coerceDate(trimmed);
      if (!date) {
        return { result: null, warning: `Could not parse "${trimmed}" as date` };
      }
      return { result: date };
    }

    case 'enum': {
      if (targetFieldKey === 'gender') {
        const gender = coerceGender(trimmed);
        if (!gender) {
          return { result: null, warning: `Unknown gender value "${trimmed}"` };
        }
        return { result: gender };
      }
      if (targetFieldKey === 'status') {
        const status = coerceStatus(trimmed);
        if (!status) {
          return { result: null, warning: `Unknown status value "${trimmed}"` };
        }
        return { result: status };
      }
      if (targetFieldKey === 'type') {
        const lower = trimmed.toLowerCase();
        if (lower === 'person' || lower === 'individual') return { result: 'person' };
        if (lower === 'organization' || lower === 'company' || lower === 'org' || lower === 'business') return { result: 'organization' };
        return { result: null, warning: `Unknown type value "${trimmed}"` };
      }
      if (targetFieldKey === 'preferredContactMethod') {
        const lower = trimmed.toLowerCase();
        if (['email', 'phone', 'sms', 'text', 'call'].includes(lower)) {
          return { result: lower === 'text' || lower === 'call' ? (lower === 'text' ? 'sms' : 'phone') : lower };
        }
        return { result: null, warning: `Unknown contact method "${trimmed}"` };
      }
      // Generic enum: check against enumValues
      if (field.enumValues) {
        const lower = trimmed.toLowerCase();
        const match = field.enumValues.find((v) => v.toLowerCase() === lower);
        if (match) return { result: match };
        return { result: null, warning: `"${trimmed}" not in allowed values: ${field.enumValues.join(', ')}` };
      }
      return { result: trimmed };
    }

    default: {
      // String fields
      if (targetFieldKey === 'email') {
        if (!isValidEmail(trimmed)) {
          return { result: trimmed, warning: `"${trimmed}" may not be a valid email` };
        }
      }
      if (targetFieldKey === 'phone' || targetFieldKey === 'homePhone') {
        return { result: normalizePhone(trimmed) };
      }
      if (targetFieldKey === 'tags') {
        return { result: parseTags(trimmed) };
      }
      return { result: trimmed };
    }
  }
}

// ── Transform Applicator ─────────────────────────────────────────

function applyTransforms(
  row: Record<string, unknown>,
  transforms: DetectedTransform[],
  rawRow: string[],
): void {
  for (const transform of transforms) {
    const rawValue = rawRow[transform.sourceIndex] ?? '';
    if (!rawValue.trim()) continue;

    switch (transform.type) {
      case 'split_name': {
        const { prefix, firstName, lastName, suffix } = splitFullName(rawValue);
        // Only set if not already explicitly mapped
        if (!row.firstName && firstName) row.firstName = firstName;
        if (!row.lastName && lastName) row.lastName = lastName;
        if (!row.prefix && prefix) row.prefix = prefix;
        if (!row.suffix && suffix) row.suffix = suffix;
        // Remove fullName key since it was split
        delete row.fullName;
        break;
      }
      case 'split_address': {
        const { city, state, postalCode } = splitCityStateZip(rawValue);
        if (!row.city && city) row.city = city;
        if (!row.state && state) row.state = state;
        if (!row.postalCode && postalCode) row.postalCode = postalCode;
        // Remove combined key
        delete row.combinedCityStateZip;
        break;
      }
    }
  }
}

// ── Row Mapper ──────────────────────────────────────────────────

function mapSingleRow(
  rawRow: string[],
  rowIndex: number,
  mappings: ColumnMapping[],
  transforms: DetectedTransform[],
): { mapped: MappedCustomerRow; messages: ValidationMessage[] } {
  const messages: ValidationMessage[] = [];
  const values: Record<string, unknown> = {};

  // Apply column mappings
  for (const mapping of mappings) {
    if (!mapping.targetField) continue;
    const rawValue = rawRow[mapping.sourceIndex] ?? '';
    if (!rawValue.trim()) continue;

    const { result, warning } = coerceValue(rawValue, mapping.targetField);
    if (warning) {
      messages.push({
        row: rowIndex + 1,
        field: mapping.targetField,
        message: warning,
        severity: 'warning',
      });
    }
    if (result !== null && result !== undefined) {
      values[mapping.targetField] = result;
    }
  }

  // Apply transforms (split name, split address)
  applyTransforms(values, transforms, rawRow);

  // Auto-detect entity type
  if (!values.type) {
    values.type = detectEntityType(
      values.firstName as string | undefined,
      values.lastName as string | undefined,
      values.organizationName as string | undefined,
    );
  }

  // Build display name if not explicitly provided
  if (!values.displayName) {
    if (values.type === 'organization' && values.organizationName) {
      values.displayName = values.organizationName;
    } else if (values.firstName || values.lastName) {
      values.displayName = [values.firstName, values.lastName].filter(Boolean).join(' ');
    } else if (values.email) {
      values.displayName = values.email;
    }
  }

  // Validate required: at least one identifying field
  const hasIdentity = !!(values.email || values.phone || values.firstName || values.organizationName);
  if (!hasIdentity) {
    messages.push({
      row: rowIndex + 1,
      message: 'Row has no identifying data (email, phone, name, or organization)',
      severity: 'error',
    });
  }

  // Separate fields by target table
  const customer: Record<string, unknown> = {};
  const address: Record<string, unknown> = {};
  let externalId: string | undefined;
  let billingBalance: number | undefined;
  let creditLimit: number | undefined;

  for (const [key, value] of Object.entries(values)) {
    const field = getTargetFieldByKey(key);
    if (!field) {
      // displayName or other computed fields go to customer
      customer[key] = value;
      continue;
    }

    switch (field.table) {
      case 'customers':
        customer[key] = value;
        break;
      case 'addresses':
        address[key] = value;
        break;
      case 'external_ids':
        externalId = String(value);
        break;
      case 'billing_accounts':
        if (key === 'houseAccountBalance') billingBalance = value as number;
        if (key === 'creditLimit') creditLimit = value as number;
        break;
      default:
        customer[key] = value;
    }
  }

  const mapped: MappedCustomerRow = {
    rowIndex,
    customer,
    address: Object.keys(address).length > 0 ? address : undefined,
    externalId,
    billingBalance,
    creditLimit,
  };

  return { mapped, messages };
}

// ── Public API ──────────────────────────────────────────────────

export interface RowValidationResult {
  validRows: MappedCustomerRow[];
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  validCount: number;
  errorCount: number;
}

export function validateAndMapRows(
  rows: string[][],
  mappings: ColumnMapping[],
  transforms: DetectedTransform[],
): RowValidationResult {
  const validRows: MappedCustomerRow[] = [];
  const errors: ValidationMessage[] = [];
  const warnings: ValidationMessage[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const { mapped, messages } = mapSingleRow(rows[i]!, i, mappings, transforms);

    const rowErrors = messages.filter((m) => m.severity === 'error');
    const rowWarnings = messages.filter((m) => m.severity === 'warning');

    errors.push(...rowErrors);
    warnings.push(...rowWarnings);

    if (rowErrors.length === 0) {
      validRows.push(mapped);
      validCount++;
    } else {
      errorCount++;
    }
  }

  return { validRows, errors, warnings, validCount, errorCount };
}
