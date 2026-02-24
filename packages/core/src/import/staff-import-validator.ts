/**
 * Staff import validation engine.
 *
 * Pure function — validates parsed rows without touching the database.
 * Duplicate detection against existing users requires a lookup map passed in.
 */

import type {
  StaffColumnMapping,
  StaffImportMode,
  StaffRowError,
  StaffValidationResult,
  StaffValueMappings,
  ValidatedStaffRow,
} from './staff-import-types';

// ── Normalization Helpers ────────────────────────────────────────────

function normalizeStatus(raw: string): 'active' | 'inactive' {
  const lower = raw.toLowerCase().trim();
  const activeSet = new Set(['active', 'yes', 'y', 'true', '1', 'enabled', 'on']);
  return activeSet.has(lower) ? 'active' : 'inactive';
}

function normalizeEmail(raw: string): string {
  return raw.toLowerCase().trim();
}

function generateUsername(email: string | null, firstName: string | null, lastName: string | null): string | null {
  if (email) {
    return email.split('@')[0]!.replace(/[^a-z0-9._-]/gi, '').toLowerCase();
  }
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName}`.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);
  }
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^\d{3,8}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// ── Existing Users Lookup ────────────────────────────────────────────

export interface ExistingUserLookup {
  byEmail: Map<string, string>;        // normalized email → userId
  byUsername: Map<string, string>;      // normalized username → userId
  byPayrollId: Map<string, string>;    // externalPayrollEmployeeId → userId
}

// ── Validator ────────────────────────────────────────────────────────

export function validateStaffImport(input: {
  rows: string[][];
  columnMappings: StaffColumnMapping[];
  valueMappings: StaffValueMappings;
  existingUsers: ExistingUserLookup;
  importMode: StaffImportMode;
  autoGenerateUsername: boolean;
  defaultRoleId: string | null;
  defaultLocationIds: string[];
}): StaffValidationResult {
  const {
    rows,
    columnMappings,
    valueMappings,
    existingUsers,
    importMode,
    autoGenerateUsername,
    defaultRoleId,
    defaultLocationIds,
  } = input;

  // Build index for quick column lookup
  const fieldToCol = new Map<string, number>();
  for (const m of columnMappings) {
    if (m.targetField) fieldToCol.set(m.targetField, m.columnIndex);
  }

  // Build value mapping lookups
  const roleMap = new Map<string, string>();
  for (const r of valueMappings.roles) {
    if (r.oppsEraRoleId) roleMap.set(r.legacyValue.toLowerCase().trim(), r.oppsEraRoleId);
  }
  const locationMap = new Map<string, string[]>();
  for (const l of valueMappings.locations) {
    if (l.oppsEraLocationIds.length > 0) locationMap.set(l.legacyValue.toLowerCase().trim(), l.oppsEraLocationIds);
  }

  const emailsSeenInFile = new Map<string, number[]>(); // email → [rowNumbers]
  const validatedRows: ValidatedStaffRow[] = [];
  const duplicateEmailsInFile: string[] = [];
  const unmappedRoles = new Set<string>();
  const unmappedLocations = new Set<string>();

  // ── First pass: parse + validate each row ──
  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    const rowNumber = rowIdx + 2; // 1-indexed + header row
    const errors: StaffRowError[] = [];
    const warnings: StaffRowError[] = [];

    // Build rawData dict
    const rawData: Record<string, string> = {};
    for (const m of columnMappings) {
      rawData[m.sourceHeader] = row[m.columnIndex] ?? '';
    }

    // Extract fields
    const getVal = (field: string): string => {
      const colIdx = fieldToCol.get(field);
      return colIdx != null ? (row[colIdx] ?? '').trim() : '';
    };

    let firstName = getVal('firstName') || null;
    let lastName = getVal('lastName') || null;
    let email = getVal('email') || null;
    let username = getVal('username') || null;
    const phone = getVal('phone') || null;
    const statusRaw = getVal('status');
    const roleRaw = getVal('role') || null;
    const locationRaw = getVal('location') || null;
    const posPin = getVal('posPin') || null;
    const overridePin = getVal('overridePin') || null;
    const tabColor = getVal('tabColor') || null;
    const employeeColor = getVal('employeeColor') || null;
    const externalPayrollEmployeeId = getVal('externalPayrollEmployeeId') || null;
    const externalPayrollId = getVal('externalPayrollId') || null;

    // ── Normalize ──
    const statusValue = statusRaw ? normalizeStatus(statusRaw) : 'active';
    if (email) email = normalizeEmail(email);

    // ── Auto-generate username ──
    if (!username && autoGenerateUsername) {
      username = generateUsername(email, firstName, lastName);
    }

    // ── Validate required fields ──
    if (!firstName && !lastName) {
      errors.push({ field: 'firstName', code: 'MISSING_NAME', message: 'First name or last name is required' });
    }
    if (!email && !username) {
      errors.push({ field: 'email', code: 'MISSING_IDENTITY', message: 'Email or username is required' });
    }
    if (email && !EMAIL_RE.test(email)) {
      errors.push({ field: 'email', code: 'INVALID_EMAIL', message: `Invalid email format: ${email}` });
    }

    // ── Validate PINs ──
    if (posPin && !PIN_RE.test(posPin)) {
      errors.push({ field: 'posPin', code: 'INVALID_PIN', message: `POS PIN must be 3-8 digits, got "${posPin}"` });
    }
    if (overridePin && !PIN_RE.test(overridePin)) {
      errors.push({ field: 'overridePin', code: 'INVALID_PIN', message: `Override PIN must be 3-8 digits, got "${overridePin}"` });
    }

    // ── Validate colors ──
    if (tabColor && !COLOR_RE.test(tabColor)) {
      warnings.push({ field: 'tabColor', code: 'INVALID_COLOR', message: `Tab color "${tabColor}" is not a valid hex color (#RRGGBB)` });
    }
    if (employeeColor && !COLOR_RE.test(employeeColor)) {
      warnings.push({ field: 'employeeColor', code: 'INVALID_COLOR', message: `Employee color "${employeeColor}" is not a valid hex color` });
    }

    // ── Resolve role ──
    let roleId: string | null = null;
    if (roleRaw) {
      roleId = roleMap.get(roleRaw.toLowerCase().trim()) ?? null;
      if (!roleId) {
        unmappedRoles.add(roleRaw);
        if (defaultRoleId) {
          roleId = defaultRoleId;
          warnings.push({ field: 'role', code: 'UNMAPPED_ROLE', message: `Role "${roleRaw}" not mapped — using default role` });
        } else {
          errors.push({ field: 'role', code: 'UNMAPPED_ROLE', message: `Role "${roleRaw}" is not mapped to any OppsEra role` });
        }
      }
    } else if (defaultRoleId) {
      roleId = defaultRoleId;
    } else {
      warnings.push({ field: 'role', code: 'NO_ROLE', message: 'No role specified and no default set' });
    }

    // ── Resolve locations ──
    let locationIds: string[] = [];
    if (locationRaw) {
      locationIds = locationMap.get(locationRaw.toLowerCase().trim()) ?? [];
      if (locationIds.length === 0) {
        unmappedLocations.add(locationRaw);
        if (defaultLocationIds.length > 0) {
          locationIds = defaultLocationIds;
          warnings.push({ field: 'location', code: 'UNMAPPED_LOCATION', message: `Location "${locationRaw}" not mapped — using default locations` });
        } else {
          warnings.push({ field: 'location', code: 'UNMAPPED_LOCATION', message: `Location "${locationRaw}" is not mapped to any OppsEra location` });
        }
      }
    } else if (defaultLocationIds.length > 0) {
      locationIds = defaultLocationIds;
    }

    // ── Duplicate detection against existing users ──
    let matchType: string | null = null;
    let matchedUserId: string | null = null;

    if (email && existingUsers.byEmail.has(email)) {
      matchType = 'email_match';
      matchedUserId = existingUsers.byEmail.get(email)!;
    } else if (username && existingUsers.byUsername.has(username.toLowerCase())) {
      matchType = 'username_match';
      matchedUserId = existingUsers.byUsername.get(username.toLowerCase())!;
    } else if (externalPayrollEmployeeId && existingUsers.byPayrollId.has(externalPayrollEmployeeId)) {
      matchType = 'payroll_id_match';
      matchedUserId = existingUsers.byPayrollId.get(externalPayrollEmployeeId)!;
    }

    // ── Duplicate tracking within file ──
    if (email) {
      const existing = emailsSeenInFile.get(email);
      if (existing) {
        existing.push(rowNumber);
        if (!matchType) matchType = 'duplicate_in_file';
        warnings.push({ field: 'email', code: 'DUPLICATE_IN_FILE', message: `Email "${email}" appears multiple times in the file` });
      } else {
        emailsSeenInFile.set(email, [rowNumber]);
      }
    }

    // ── Determine action ──
    let action: ValidatedStaffRow['action'] = 'error';
    if (errors.length > 0) {
      action = 'error';
    } else if (matchedUserId) {
      if (importMode === 'create_only') {
        action = 'skip';
        warnings.push({ field: '_row', code: 'SKIPPED_EXISTS', message: 'User already exists — import mode is Create Only' });
      } else {
        action = 'update';
      }
    } else {
      if (importMode === 'update_only') {
        action = 'skip';
        warnings.push({ field: '_row', code: 'SKIPPED_NOT_FOUND', message: 'User not found — import mode is Update Only' });
      } else {
        action = 'create';
        matchType = 'new';
      }
    }

    validatedRows.push({
      rowNumber,
      rawData,
      firstName,
      lastName,
      email,
      username,
      phone,
      statusValue,
      roleId,
      roleRaw,
      locationIds,
      locationRaw,
      posPin,
      overridePin,
      tabColor,
      employeeColor,
      externalPayrollEmployeeId,
      externalPayrollId,
      matchType,
      matchedUserId,
      action,
      isValid: errors.length === 0,
      errors,
      warnings,
    });
  }

  // Collect duplicate emails in file
  for (const [email, rowNums] of emailsSeenInFile.entries()) {
    if (rowNums.length > 1) duplicateEmailsInFile.push(email);
  }

  const createCount = validatedRows.filter((r) => r.action === 'create').length;
  const updateCount = validatedRows.filter((r) => r.action === 'update').length;
  const skipCount = validatedRows.filter((r) => r.action === 'skip').length;
  const errorRows = validatedRows.filter((r) => !r.isValid).length;

  return {
    isValid: errorRows === 0,
    rows: validatedRows,
    summary: {
      totalRows: rows.length,
      validRows: rows.length - errorRows,
      errorRows,
      createCount,
      updateCount,
      skipCount,
      distinctRolesUnmapped: [...unmappedRoles],
      distinctLocationsUnmapped: [...unmappedLocations],
      duplicateEmailsInFile,
    },
  };
}
