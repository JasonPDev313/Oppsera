import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { and, desc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  db,
  withTenant,
  users,
  memberships,
  roles,
  userRoles,
  roleAssignments,
  userLocations,
  locations,
  userInvites,
  userSecurity,
} from '@oppsera/db';
import { ConflictError, NotFoundError, ValidationError } from '@oppsera/shared';
import { createSupabaseAdmin } from './auth/supabase-client';
import { encryptField, decryptField } from './security/field-encryption';

export type UserStatus = 'invited' | 'active' | 'inactive' | 'locked';

export interface InviteUserInput {
  tenantId: string;
  invitedByUserId: string;
  emailAddress: string;
  roleId: string;
  locationIds?: string[];
}

export interface CreateUserInput {
  tenantId: string;
  createdByUserId: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  userName: string;
  password?: string;
  phoneNumber?: string;
  userRole: string;
  additionalRoleIds?: string[];
  userStatus: Extract<UserStatus, 'active' | 'inactive'>;
  posOverridePin?: string;
  uniqueIdentificationPin?: string;
  userTabColor?: string;
  externalPayrollEmployeeId?: string;
  locationIds?: string[];
  forcePasswordReset?: boolean;
}

export interface UpdateUserInput {
  tenantId: string;
  updatedByUserId: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  emailAddress?: string;
  userName?: string;
  phoneNumber?: string;
  userRole?: string;
  additionalRoleIds?: string[];
  userStatus?: UserStatus;
  posOverridePin?: string;
  uniqueIdentificationPin?: string;
  userTabColor?: string;
  externalPayrollEmployeeId?: string;
  locationIds?: string[];
  passwordResetRequired?: boolean;
  password?: string;
}

export interface ResetPinInput {
  tenantId: string;
  updatedByUserId: string;
  userId: string;
  posOverridePin?: string | null;
  uniqueIdentificationPin?: string | null;
}

export interface AcceptInviteInput {
  token: string;
  password: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

// ── Password Complexity ─────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789',
  '1234567890', 'qwerty123', 'letmein', 'welcome', 'admin123',
  'abc12345', 'iloveyou', 'sunshine', 'princess', 'football',
  'monkey123', 'shadow12', 'master12', 'dragon12', 'trustno1',
]);

/**
 * Validate password strength. Returns null if valid, or a rejection reason.
 * Rules: ≥8 chars, ≤128 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit,
 * ≥1 special char, not a common password.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password must be at most 128 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain at least one special character';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Password is too common — choose something unique';
  return null;
}

/** Common PINs that are trivially guessable — rejected at assignment time. */
const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1212', '2121', '1122', '2211',
  '0123', '3210', '9876', '6789',
  '1010', '2020', '6969', '1357', '2468',
]);

function isSequentialRun(pin: string): boolean {
  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i++) {
    if (Number(pin[i]) !== Number(pin[i - 1]) + 1) ascending = false;
    if (Number(pin[i]) !== Number(pin[i - 1]) - 1) descending = false;
  }
  return ascending || descending;
}

function allSameDigit(pin: string): boolean {
  return pin.split('').every((d) => d === pin[0]);
}

/**
 * Validate a unique ID PIN (exactly 4 digits, rejects weak patterns).
 * Returns `true` if valid, or a rejection reason string if invalid.
 */
export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function validatePinStrength(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'PIN must be exactly 4 digits';
  if (WEAK_PINS.has(pin) || allSameDigit(pin) || isSequentialRun(pin)) {
    return 'PIN is too easy to guess — avoid repeated, sequential, or common patterns';
  }
  return null;
}

/**
 * Validate a manager override PIN (4-8 digits, rejects weak patterns).
 */
export function validateOverridePin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function validateOverridePinStrength(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return 'PIN must be 4–8 digits';
  if (allSameDigit(pin) || isSequentialRun(pin)) {
    return 'PIN is too easy to guess — avoid repeated or sequential patterns';
  }
  // Check the first 4 digits against common weak patterns
  if (WEAK_PINS.has(pin.slice(0, 4)) && pin.length === 4) {
    return 'PIN is too easy to guess — avoid common patterns like 1234';
  }
  return null;
}

export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(secret, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifySecret(secret: string, hash: string): boolean {
  const [algo, salt, digest] = hash.split('$');
  if (algo !== 'scrypt' || !salt || !digest) return false;
  const candidate = scryptSync(secret, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

function validatePinsOrThrow(loginPin?: string, overridePin?: string): void {
  if (loginPin) {
    const reason = validatePinStrength(loginPin);
    if (reason) {
      throw new ValidationError('Validation failed', [
        { field: 'uniqueIdentificationPin', message: reason },
      ]);
    }
  }
  if (overridePin) {
    const reason = validateOverridePinStrength(overridePin);
    if (reason) {
      throw new ValidationError('Validation failed', [
        { field: 'posOverridePin', message: reason },
      ]);
    }
  }
  if (loginPin && overridePin && loginPin === overridePin) {
    throw new ValidationError('Validation failed', [
      { field: 'posOverridePin', message: 'Override PIN must differ from login PIN' },
    ]);
  }
  if (loginPin && overridePin && overridePin.startsWith(loginPin)) {
    throw new ValidationError('Validation failed', [
      { field: 'posOverridePin', message: 'Override PIN cannot start with the same digits as the login PIN — this causes conflicts when verifying' },
    ]);
  }
}

async function ensureRoleInTenant(tenantId: string, roleId: string): Promise<void> {
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
  });
  if (!role) throw new NotFoundError('Role', roleId);
}

async function ensureLocationsInTenant(tenantId: string, locationIds: string[]): Promise<void> {
  if (locationIds.length === 0) return;
  const rows = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.tenantId, tenantId), inArray(locations.id, locationIds)));
  if (rows.length !== new Set(locationIds).size) {
    throw new ValidationError('Validation failed', [
      { field: 'locationIds', message: 'One or more locations are invalid for this tenant' },
    ]);
  }
}

async function sendInviteEmail(email: string, inviteUrl: string, mode: 'invite' | 'password_setup' | 'password_reset'): Promise<void> {
  console.info(`[user-email:${mode}] to=${email} url=${inviteUrl}`);
}

async function createInviteTx(tx: typeof db, args: {
  tenantId: string;
  userId: string;
  email: string;
  invitedByUserId: string;
  expiresInHours?: number;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = makeInviteToken();
  const expiresAt = new Date(Date.now() + (args.expiresInHours ?? 72) * 60 * 60 * 1000);
  await tx.insert(userInvites).values({
    tenantId: args.tenantId,
    userId: args.userId,
    email: args.email,
    tokenHash: hashInviteToken(token),
    expiresAt,
    invitedByUserId: args.invitedByUserId,
  });
  return { token, expiresAt };
}

export async function listUsers(input: { tenantId: string; limit?: number; cursor?: string }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  return withTenant(input.tenantId, async (tx) => {
    const where = input.cursor
      ? and(eq(memberships.tenantId, input.tenantId), lt(users.id, input.cursor))
      : eq(memberships.tenantId, input.tenantId);

    const rows = await tx
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        displayName: users.displayName,
        phoneNumber: users.phone,
        status: users.status,
        primaryRoleId: users.primaryRoleId,
        tabColor: users.tabColor,
        externalPayrollEmployeeId: users.externalPayrollEmployeeId,
        passwordResetRequired: users.passwordResetRequired,
        lastLoginAt: users.lastLoginAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(where)
      .orderBy(desc(users.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const ids = items.map((x) => x.id);

    const roleRows = ids.length
      ? await tx
          .select({
            userId: userRoles.userId,
            roleId: userRoles.roleId,
            roleName: roles.name,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(and(eq(userRoles.tenantId, input.tenantId), inArray(userRoles.userId, ids)))
      : [];

    const locationRows = ids.length
      ? await tx
          .select({
            userId: userLocations.userId,
            locationId: userLocations.locationId,
            locationName: locations.name,
          })
          .from(userLocations)
          .innerJoin(locations, eq(userLocations.locationId, locations.id))
          .where(and(eq(userLocations.tenantId, input.tenantId), inArray(userLocations.userId, ids)))
      : [];

    const rolesByUser = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of roleRows) {
      if (!rolesByUser.has(row.userId)) rolesByUser.set(row.userId, []);
      rolesByUser.get(row.userId)!.push({ id: row.roleId, name: row.roleName });
    }

    const locationsByUser = new Map<string, Array<{ id: string; name: string }>>();
    for (const row of locationRows) {
      if (!locationsByUser.has(row.userId)) locationsByUser.set(row.userId, []);
      locationsByUser.get(row.userId)!.push({ id: row.locationId, name: row.locationName });
    }

    return {
      items: items.map((u) => ({
        ...u,
        phoneNumber: decryptField(u.phoneNumber),
        roles: rolesByUser.get(u.id) ?? [],
        locations: locationsByUser.get(u.id) ?? [],
      })),
      cursor: hasMore ? items[items.length - 1]!.id : null,
      hasMore,
    };
  });
}

export async function getUserById(input: { tenantId: string; userId: string }) {
  return withTenant(input.tenantId, async (tx) => {
    const user = await tx.query.users.findFirst({
      where: and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)),
    });
    if (!user) throw new NotFoundError('User', input.userId);

    const [roleRows, locationRows] = await Promise.all([
      tx
        .select({ id: roles.id, name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.tenantId, input.tenantId), eq(userRoles.userId, input.userId))),
      tx
        .select({ id: locations.id, name: locations.name })
        .from(userLocations)
        .innerJoin(locations, eq(userLocations.locationId, locations.id))
        .where(and(eq(userLocations.tenantId, input.tenantId), eq(userLocations.userId, input.userId))),
    ]);

    // Strip sensitive fields before returning
    const { passwordHash: _ph, authProviderId: _ap, ...safeUser } = user;
    return {
      ...safeUser,
      phone: decryptField(safeUser.phone),
      roles: roleRows,
      locations: locationRows,
    };
  });
}

async function ensureUniqueByTenant(
  tenantId: string,
  email: string,
  username: string,
  excludeUserId?: string,
): Promise<void> {
  const emailConflict = await db.query.users.findFirst({
    where: and(
      eq(users.tenantId, tenantId),
      sql`LOWER(${users.email}) = ${email}`,
      excludeUserId ? sql`${users.id} <> ${excludeUserId}` : undefined,
    ),
  });
  if (emailConflict) throw new ConflictError('Email already exists for this tenant');

  const usernameConflict = await db.query.users.findFirst({
    where: and(
      eq(users.tenantId, tenantId),
      sql`LOWER(${users.username}) = ${username}`,
      excludeUserId ? sql`${users.id} <> ${excludeUserId}` : undefined,
    ),
  });
  if (usernameConflict) throw new ConflictError('Username already exists for this tenant');
}

async function setRolesForUser(tx: typeof db, tenantId: string, userId: string, primaryRoleId: string, additionalRoleIds: string[] = []): Promise<void> {
  const allRoleIds = Array.from(new Set([primaryRoleId, ...additionalRoleIds]));
  if (allRoleIds.length === 0) return;

  await Promise.all(allRoleIds.map((roleId) => ensureRoleInTenant(tenantId, roleId)));

  await tx.delete(userRoles).where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.userId, userId)));
  await tx.delete(roleAssignments).where(and(eq(roleAssignments.tenantId, tenantId), eq(roleAssignments.userId, userId), isNull(roleAssignments.locationId)));

  await tx.insert(userRoles).values(allRoleIds.map((roleId) => ({
    tenantId,
    userId,
    roleId,
  })));

  await tx.insert(roleAssignments).values(allRoleIds.map((roleId) => ({
    tenantId,
    userId,
    roleId,
    locationId: null,
  })));
}

async function setLocationsForUser(tx: typeof db, tenantId: string, userId: string, locationIds: string[] = []): Promise<void> {
  const deduped = Array.from(new Set(locationIds));
  await ensureLocationsInTenant(tenantId, deduped);
  await tx.delete(userLocations).where(and(eq(userLocations.tenantId, tenantId), eq(userLocations.userId, userId)));
  if (deduped.length > 0) {
    await tx.insert(userLocations).values(deduped.map((locationId) => ({
      tenantId,
      userId,
      locationId,
    })));
  }
}

export async function inviteUser(input: InviteUserInput): Promise<{ userId: string }> {
  const email = normalizeEmail(input.emailAddress);
  await ensureRoleInTenant(input.tenantId, input.roleId);
  await ensureLocationsInTenant(input.tenantId, input.locationIds ?? []);

  const result = await withTenant(input.tenantId, async (tx) => {
    const existing = await tx.query.users.findFirst({
      where: and(eq(users.tenantId, input.tenantId), sql`LOWER(${users.email}) = ${email}`),
    });

    let userId = existing?.id;
    if (!userId) {
      const fallbackName = email.split('@')[0] ?? 'user';
      const [created] = await tx.insert(users).values({
        tenantId: input.tenantId,
        email,
        username: `${fallbackName}-${randomBytes(3).toString('hex')}`.toLowerCase(),
        name: fallbackName,
        firstName: fallbackName,
        status: 'invited',
        primaryRoleId: input.roleId,
        createdByUserId: input.invitedByUserId,
        updatedByUserId: input.invitedByUserId,
      }).returning({ id: users.id });
      userId = created!.id;
      await tx.insert(userSecurity).values({ userId });
      await tx.insert(memberships).values({
        tenantId: input.tenantId,
        userId,
        status: 'inactive',
      });
    } else {
      await tx.update(users).set({
        status: 'invited',
        primaryRoleId: input.roleId,
        updatedByUserId: input.invitedByUserId,
        updatedAt: new Date(),
      }).where(and(eq(users.id, userId), eq(users.tenantId, input.tenantId)));
    }

    await setRolesForUser(tx, input.tenantId, userId, input.roleId);
    await setLocationsForUser(tx, input.tenantId, userId, input.locationIds ?? []);

    const invite = await createInviteTx(tx, {
      tenantId: input.tenantId,
      userId,
      email,
      invitedByUserId: input.invitedByUserId,
      expiresInHours: 72,
    });

    const inviteUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/invite/accept?token=${encodeURIComponent(invite.token)}`;
    await sendInviteEmail(email, inviteUrl, 'invite');

    return { userId };
  });

  return result;
}

export async function createUser(input: CreateUserInput): Promise<{ userId: string; invited: boolean }> {
  const email = normalizeEmail(input.emailAddress);
  const username = normalizeUsername(input.userName);
  validatePinsOrThrow(input.uniqueIdentificationPin, input.posOverridePin);
  if (input.password) {
    const pwReason = validatePasswordStrength(input.password);
    if (pwReason) {
      throw new ValidationError('Validation failed', [{ field: 'password', message: pwReason }]);
    }
  }
  await ensureRoleInTenant(input.tenantId, input.userRole);
  await ensureUniqueByTenant(input.tenantId, email, username);
  await ensureLocationsInTenant(input.tenantId, input.locationIds ?? []);

  const now = new Date();
  const displayName = `${input.firstName.trim()} ${input.lastName.trim()}`.trim();
  const passwordHash = input.password ? hashSecret(input.password) : null;
  const pinHash = input.uniqueIdentificationPin ? hashSecret(input.uniqueIdentificationPin) : null;
  const overrideHash = input.posOverridePin ? hashSecret(input.posOverridePin) : null;

  const result = await withTenant(input.tenantId, async (tx) => {
    const [created] = await tx.insert(users).values({
      tenantId: input.tenantId,
      email,
      username,
      name: displayName || input.firstName.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      displayName,
      phone: encryptField(input.phoneNumber?.trim()),
      status: input.userStatus,
      primaryRoleId: input.userRole,
      tabColor: input.userTabColor?.trim(),
      employeeColor: input.userTabColor?.trim(),
      externalPayrollEmployeeId: input.externalPayrollEmployeeId?.trim(),
      externalPayrollId: input.externalPayrollEmployeeId?.trim(),
      passwordHash,
      passwordResetRequired: Boolean(input.password && input.forcePasswordReset),
      createdByUserId: input.createdByUserId?.startsWith('admin:') ? null : input.createdByUserId,
      updatedByUserId: input.createdByUserId?.startsWith('admin:') ? null : input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: users.id });

    const userId = created!.id;
    await tx.insert(userSecurity).values({
      userId,
      uniqueLoginPinHash: pinHash,
      posOverridePinHash: overrideHash,
      updatedAt: now,
    });

    await tx.insert(memberships).values({
      tenantId: input.tenantId,
      userId,
      status: input.userStatus === 'active' ? 'active' : 'inactive',
      createdAt: now,
    });

    await setRolesForUser(tx, input.tenantId, userId, input.userRole, input.additionalRoleIds ?? []);
    await setLocationsForUser(tx, input.tenantId, userId, input.locationIds ?? []);

    if (!input.password) {
      const invite = await createInviteTx(tx, {
        tenantId: input.tenantId,
        userId,
        email,
        invitedByUserId: input.createdByUserId,
        expiresInHours: 72,
      });
      const inviteUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/invite/accept?token=${encodeURIComponent(invite.token)}`;
      await sendInviteEmail(email, inviteUrl, 'password_setup');
      return { userId, invited: true as const };
    }

    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new ConflictError(error?.message ?? 'Unable to create auth account');
    }
    await tx.update(users).set({
      authProviderId: data.user.id,
      updatedAt: new Date(),
      updatedByUserId: input.createdByUserId,
    }).where(and(eq(users.id, userId), eq(users.tenantId, input.tenantId)));
    return { userId, invited: false as const };
  });

  return result;
}

export async function updateUser(input: UpdateUserInput): Promise<{ userId: string }> {
  const existing = await db.query.users.findFirst({
    where: and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)),
  });
  if (!existing) throw new NotFoundError('User', input.userId);

  const email = input.emailAddress ? normalizeEmail(input.emailAddress) : normalizeEmail(existing.email);
  const username = input.userName ? normalizeUsername(input.userName) : normalizeUsername(existing.username ?? existing.email);
  await ensureUniqueByTenant(input.tenantId, email, username, input.userId);
  validatePinsOrThrow(input.uniqueIdentificationPin, input.posOverridePin);
  if (input.password) {
    const pwReason = validatePasswordStrength(input.password);
    if (pwReason) {
      throw new ValidationError('Validation failed', [{ field: 'password', message: pwReason }]);
    }
  }

  if (input.userRole) await ensureRoleInTenant(input.tenantId, input.userRole);
  if (input.locationIds) await ensureLocationsInTenant(input.tenantId, input.locationIds);

  // If password provided, update Supabase Auth BEFORE entering the transaction
  // (external API call — keep outside transaction to avoid holding locks)
  if (input.password) {
    const supabase = createSupabaseAdmin();
    if (existing.authProviderId) {
      const { error } = await supabase.auth.admin.updateUserById(existing.authProviderId, {
        password: input.password,
        email_confirm: true,
      });
      if (error) throw new ConflictError(error.message);
    } else {
      // User has no Supabase Auth account yet — create one
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: input.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new ConflictError(error?.message ?? 'Unable to create auth account');
      // authProviderId will be set inside the transaction below
      (existing as { authProviderId: string | null }).authProviderId = data.user.id;
    }
  }

  await withTenant(input.tenantId, async (tx) => {
    const firstName = input.firstName?.trim() ?? existing.firstName ?? '';
    const lastName = input.lastName?.trim() ?? existing.lastName ?? '';
    const displayName = `${firstName} ${lastName}`.trim();

    const passwordFields: Record<string, unknown> = {};
    if (input.password) {
      passwordFields.passwordHash = hashSecret(input.password);
      passwordFields.passwordResetRequired = false;
      passwordFields.authProviderId = existing.authProviderId;
    }

    await tx.update(users).set({
      email,
      username,
      name: displayName || existing.name,
      firstName,
      lastName,
      displayName: displayName || null,
      phone: input.phoneNumber !== undefined ? encryptField(input.phoneNumber.trim()) : existing.phone,
      status: input.userStatus ?? existing.status,
      primaryRoleId: input.userRole ?? existing.primaryRoleId,
      tabColor: input.userTabColor ?? existing.tabColor,
      employeeColor: input.userTabColor ?? existing.employeeColor,
      externalPayrollEmployeeId: input.externalPayrollEmployeeId ?? existing.externalPayrollEmployeeId,
      externalPayrollId: input.externalPayrollEmployeeId ?? existing.externalPayrollId,
      passwordResetRequired: input.passwordResetRequired ?? existing.passwordResetRequired,
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date(),
      ...passwordFields,
    }).where(and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)));

    if (input.userStatus) {
      await tx.update(memberships).set({
        status: input.userStatus === 'active' ? 'active' : 'inactive',
      }).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.userId)));
    }

    if (input.uniqueIdentificationPin !== undefined || input.posOverridePin !== undefined) {
      const loginPinHash = input.uniqueIdentificationPin
        ? hashSecret(input.uniqueIdentificationPin)
        : null;
      const overridePinHash = input.posOverridePin
        ? hashSecret(input.posOverridePin)
        : null;
      const pinSet: Record<string, unknown> = { updatedAt: new Date() };
      if (input.uniqueIdentificationPin !== undefined) {
        pinSet.uniqueLoginPinHash = loginPinHash;
      }
      if (input.posOverridePin !== undefined) {
        pinSet.posOverridePinHash = overridePinHash;
      }
      await tx
        .insert(userSecurity)
        .values({
          userId: input.userId,
          uniqueLoginPinHash: loginPinHash,
          posOverridePinHash: overridePinHash,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userSecurity.userId,
          set: pinSet,
        });
    }

    if (input.userRole !== undefined || input.additionalRoleIds !== undefined) {
      await setRolesForUser(tx, input.tenantId, input.userId, input.userRole ?? existing.primaryRoleId ?? '', input.additionalRoleIds ?? []);
    }
    if (input.locationIds) {
      await setLocationsForUser(tx, input.tenantId, input.userId, input.locationIds);
    }
  });

  return { userId: input.userId };
}

export async function resetPassword(input: { tenantId: string; userId: string; actorUserId: string }): Promise<void> {
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)),
  });
  if (!user) throw new NotFoundError('User', input.userId);

  await withTenant(input.tenantId, async (tx) => {
    await tx.update(users).set({
      passwordResetRequired: true,
      updatedByUserId: input.actorUserId,
      updatedAt: new Date(),
    }).where(and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)));

    const invite = await createInviteTx(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      email: user.email,
      invitedByUserId: input.actorUserId,
      expiresInHours: 2,
    });
    const inviteUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/invite/accept?token=${encodeURIComponent(invite.token)}`;
    await sendInviteEmail(user.email, inviteUrl, 'password_reset');
  });
}

export async function resetPins(input: ResetPinInput): Promise<void> {
  validatePinsOrThrow(input.uniqueIdentificationPin ?? undefined, input.posOverridePin ?? undefined);
  await withTenant(input.tenantId, async (tx) => {
    const user = await tx.query.users.findFirst({
      where: and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)),
    });
    if (!user) throw new NotFoundError('User', input.userId);

    const loginPinHash = input.uniqueIdentificationPin
      ? hashSecret(input.uniqueIdentificationPin)
      : null;
    const overridePinHash = input.posOverridePin
      ? hashSecret(input.posOverridePin)
      : null;
    await tx
      .insert(userSecurity)
      .values({
        userId: input.userId,
        uniqueLoginPinHash: loginPinHash,
        posOverridePinHash: overridePinHash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSecurity.userId,
        set: {
          uniqueLoginPinHash: loginPinHash,
          posOverridePinHash: overridePinHash,
          updatedAt: new Date(),
        },
      });

    await tx.update(users).set({
      updatedByUserId: input.updatedByUserId,
      updatedAt: new Date(),
    }).where(and(eq(users.id, input.userId), eq(users.tenantId, input.tenantId)));
  });
}

export async function acceptInvite(input: AcceptInviteInput): Promise<{ userId: string; tenantId: string }> {
  const tokenHash = hashInviteToken(input.token);
  const now = new Date();
  const invite = await db.query.userInvites.findFirst({
    where: and(
      eq(userInvites.tokenHash, tokenHash),
      isNull(userInvites.consumedAt),
      gt(userInvites.expiresAt, now),
    ),
  });
  if (!invite) throw new ValidationError('Invite token is invalid or expired');

  const pwReason = validatePasswordStrength(input.password);
  if (pwReason) {
    throw new ValidationError('Validation failed', [{ field: 'password', message: pwReason }]);
  }

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, invite.userId), eq(users.tenantId, invite.tenantId)),
  });
  if (!user) throw new NotFoundError('User', invite.userId);

  const supabase = createSupabaseAdmin();
  const passwordHash = hashSecret(input.password);

  await withTenant(invite.tenantId, async (tx) => {
    let authProviderId = user.authProviderId;
    if (authProviderId) {
      const { error } = await supabase.auth.admin.updateUserById(authProviderId, {
        password: input.password,
        email_confirm: true,
      });
      if (error) throw new ConflictError(error.message);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: input.password,
        email_confirm: true,
      });
      if (error || !data.user) throw new ConflictError(error?.message ?? 'Unable to create auth user');
      authProviderId = data.user.id;
    }

    await tx.update(users).set({
      authProviderId,
      status: user.status === 'invited' ? 'active' : user.status,
      passwordHash,
      passwordResetRequired: false,
      updatedAt: now,
    }).where(and(eq(users.id, user.id), eq(users.tenantId, invite.tenantId)));

    await tx.update(memberships).set({
      status: 'active',
    }).where(and(eq(memberships.tenantId, invite.tenantId), eq(memberships.userId, user.id)));

    await tx.update(userInvites).set({
      consumedAt: now,
    }).where(and(eq(userInvites.id, invite.id), eq(userInvites.tenantId, invite.tenantId)));
  });

  return { userId: user.id, tenantId: invite.tenantId };
}
