import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError, generateUlid } from '@oppsera/shared';
import { paymentProviders, paymentProviderCredentials, paymentMerchantAccounts, terminalMerchantAssignments } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type {
  CreateProviderInput,
  UpdateProviderInput,
  SaveCredentialsInput,
  CreateMerchantAccountInput,
  UpdateMerchantAccountInput,
  AssignTerminalMerchantInput,
  UpdateMerchantAccountAchInput,
} from '../gateway-validation';
import { encryptCredentials } from '../helpers/credentials';

/**
 * Create a payment provider for a tenant.
 * Usually a one-time setup (e.g., "cardpointe").
 */
export async function createProvider(ctx: RequestContext, input: CreateProviderInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for duplicate
    const [existing] = await tx
      .select({ id: paymentProviders.id })
      .from(paymentProviders)
      .where(
        and(
          eq(paymentProviders.tenantId, ctx.tenantId),
          eq(paymentProviders.code, input.code),
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppError('PROVIDER_EXISTS', `Provider '${input.code}' already exists`, 409);
    }

    const id = generateUlid();
    await tx.insert(paymentProviders).values({
      id,
      tenantId: ctx.tenantId,
      code: input.code,
      displayName: input.displayName,
      providerType: input.providerType ?? 'gateway',
      config: input.config ?? null,
      isActive: true,
    });

    const event = buildEventFromContext(ctx, 'payment.provider.created.v1', {
      providerId: id,
      code: input.code,
    });

    return { result: { id, code: input.code, displayName: input.displayName }, events: [event] };
  });

  await auditLog(ctx, 'payment.provider.created', 'payment_provider', result.id);
  return result;
}

/**
 * Update a payment provider's display name, active status, or config.
 */
export async function updateProvider(ctx: RequestContext, input: UpdateProviderInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [provider] = await tx
      .select()
      .from(paymentProviders)
      .where(
        and(
          eq(paymentProviders.tenantId, ctx.tenantId),
          eq(paymentProviders.id, input.providerId),
        ),
      )
      .limit(1);

    if (!provider) {
      throw new AppError('PROVIDER_NOT_FOUND', 'Payment provider not found', 404);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.config !== undefined) updates.config = input.config;

    await tx
      .update(paymentProviders)
      .set(updates)
      .where(eq(paymentProviders.id, input.providerId));

    const event = buildEventFromContext(ctx, 'payment.provider.updated.v1', {
      providerId: input.providerId,
    });

    return { result: { id: input.providerId }, events: [event] };
  });

  await auditLog(ctx, 'payment.provider.updated', 'payment_provider', result.id);
  return result;
}

/**
 * Save (encrypt and store) credentials for a provider.
 * Can be tenant-wide (locationId=null) or location-specific.
 */
export async function saveProviderCredentials(ctx: RequestContext, input: SaveCredentialsInput) {
  const encrypted = encryptCredentials(input.credentials);

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify provider exists
    const [provider] = await tx
      .select({ id: paymentProviders.id })
      .from(paymentProviders)
      .where(
        and(
          eq(paymentProviders.tenantId, ctx.tenantId),
          eq(paymentProviders.id, input.providerId),
        ),
      )
      .limit(1);

    if (!provider) {
      throw new AppError('PROVIDER_NOT_FOUND', 'Payment provider not found', 404);
    }

    // Upsert credentials (tenant-wide or location-specific)
    const [existing] = await tx
      .select({ id: paymentProviderCredentials.id })
      .from(paymentProviderCredentials)
      .where(
        and(
          eq(paymentProviderCredentials.tenantId, ctx.tenantId),
          eq(paymentProviderCredentials.providerId, input.providerId),
          input.locationId
            ? eq(paymentProviderCredentials.locationId, input.locationId)
            : eq(paymentProviderCredentials.locationId, ''),
        ),
      )
      .limit(1);

    let credId: string;
    if (existing) {
      credId = existing.id;
      await tx
        .update(paymentProviderCredentials)
        .set({
          credentialsEncrypted: encrypted,
          isSandbox: input.isSandbox ?? false,
          updatedAt: new Date(),
        })
        .where(eq(paymentProviderCredentials.id, existing.id));
    } else {
      credId = generateUlid();
      await tx.insert(paymentProviderCredentials).values({
        id: credId,
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        locationId: input.locationId ?? null,
        credentialsEncrypted: encrypted,
        isSandbox: input.isSandbox ?? false,
        isActive: true,
      });
    }

    const event = buildEventFromContext(ctx, 'payment.credentials.saved.v1', {
      providerId: input.providerId,
      locationId: input.locationId ?? null,
      isSandbox: input.isSandbox ?? false,
    });

    return { result: { credentialId: credId }, events: [event] };
  });

  // Audit without logging credential values
  await auditLog(ctx, 'payment.credentials.saved', 'payment_provider_credentials', result.credentialId);
  return result;
}

/**
 * Create a merchant account (MID) for a provider.
 */
export async function createMerchantAccount(ctx: RequestContext, input: CreateMerchantAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for duplicate MID
    const [existing] = await tx
      .select({ id: paymentMerchantAccounts.id })
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
          eq(paymentMerchantAccounts.providerId, input.providerId),
          eq(paymentMerchantAccounts.merchantId, input.merchantId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new AppError('MID_EXISTS', `Merchant ID '${input.merchantId}' already exists`, 409);
    }

    // If this is the default, unset other defaults for this provider
    if (input.isDefault) {
      await tx
        .update(paymentMerchantAccounts)
        .set({ isDefault: false })
        .where(
          and(
            eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
            eq(paymentMerchantAccounts.providerId, input.providerId),
            eq(paymentMerchantAccounts.isDefault, true),
          ),
        );
    }

    const id = generateUlid();
    await tx.insert(paymentMerchantAccounts).values({
      id,
      tenantId: ctx.tenantId,
      providerId: input.providerId,
      locationId: input.locationId ?? null,
      merchantId: input.merchantId,
      displayName: input.displayName,
      isDefault: input.isDefault ?? false,
      isActive: true,
      config: input.config ?? null,
      hsn: input.hsn ?? null,
      achMerchantId: input.achMerchantId ?? null,
      fundingMerchantId: input.fundingMerchantId ?? null,
      useForCardSwipe: input.useForCardSwipe ?? true,
      readerBeep: input.readerBeep ?? true,
      isProduction: input.isProduction ?? false,
      allowManualEntry: input.allowManualEntry ?? false,
      tipOnDevice: input.tipOnDevice ?? false,
    });

    const event = buildEventFromContext(ctx, 'payment.merchant_account.created.v1', {
      merchantAccountId: id,
      merchantId: input.merchantId,
    });

    return { result: { id, merchantId: input.merchantId, displayName: input.displayName }, events: [event] };
  });

  await auditLog(ctx, 'payment.merchant_account.created', 'payment_merchant_account', result.id);
  return result;
}

/**
 * Update a merchant account (display name, active status, default).
 */
export async function updateMerchantAccount(ctx: RequestContext, input: UpdateMerchantAccountInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [account] = await tx
      .select()
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
          eq(paymentMerchantAccounts.id, input.merchantAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new AppError('MERCHANT_ACCOUNT_NOT_FOUND', 'Merchant account not found', 404);
    }

    // If setting as default, unset other defaults
    if (input.isDefault === true) {
      await tx
        .update(paymentMerchantAccounts)
        .set({ isDefault: false })
        .where(
          and(
            eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
            eq(paymentMerchantAccounts.providerId, account.providerId),
            eq(paymentMerchantAccounts.isDefault, true),
          ),
        );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.isDefault !== undefined) updates.isDefault = input.isDefault;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.config !== undefined) updates.config = input.config;
    // ── Merchant Account Settings (migration 0188) ──
    if (input.hsn !== undefined) updates.hsn = input.hsn;
    if (input.achMerchantId !== undefined) updates.achMerchantId = input.achMerchantId;
    if (input.fundingMerchantId !== undefined) updates.fundingMerchantId = input.fundingMerchantId;
    if (input.useForCardSwipe !== undefined) updates.useForCardSwipe = input.useForCardSwipe;
    if (input.readerBeep !== undefined) updates.readerBeep = input.readerBeep;
    if (input.isProduction !== undefined) updates.isProduction = input.isProduction;
    if (input.allowManualEntry !== undefined) updates.allowManualEntry = input.allowManualEntry;
    if (input.tipOnDevice !== undefined) updates.tipOnDevice = input.tipOnDevice;

    await tx
      .update(paymentMerchantAccounts)
      .set(updates)
      .where(eq(paymentMerchantAccounts.id, input.merchantAccountId));

    return { result: { id: input.merchantAccountId }, events: [] };
  });

  await auditLog(ctx, 'payment.merchant_account.updated', 'payment_merchant_account', result.id);
  return result;
}

/**
 * Assign a merchant account (MID) to a terminal.
 * One terminal can only have one MID assignment at a time.
 */
export async function assignTerminalMerchant(ctx: RequestContext, input: AssignTerminalMerchantInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify merchant account exists
    const [account] = await tx
      .select({ id: paymentMerchantAccounts.id })
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
          eq(paymentMerchantAccounts.id, input.merchantAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new AppError('MERCHANT_ACCOUNT_NOT_FOUND', 'Merchant account not found', 404);
    }

    // Upsert terminal assignment (unique on tenant+terminal)
    const [existing] = await tx
      .select({ id: terminalMerchantAssignments.id })
      .from(terminalMerchantAssignments)
      .where(
        and(
          eq(terminalMerchantAssignments.tenantId, ctx.tenantId),
          eq(terminalMerchantAssignments.terminalId, input.terminalId),
        ),
      )
      .limit(1);

    let assignmentId: string;
    if (existing) {
      assignmentId = existing.id;
      await tx
        .update(terminalMerchantAssignments)
        .set({
          merchantAccountId: input.merchantAccountId,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(terminalMerchantAssignments.id, existing.id));
    } else {
      assignmentId = generateUlid();
      await tx.insert(terminalMerchantAssignments).values({
        id: assignmentId,
        tenantId: ctx.tenantId,
        terminalId: input.terminalId,
        merchantAccountId: input.merchantAccountId,
        isActive: true,
      });
    }

    return { result: { id: assignmentId }, events: [] };
  });

  await auditLog(ctx, 'payment.terminal_assignment.updated', 'terminal_merchant_assignment', result.id);
  return result;
}

/**
 * Update ACH-specific settings on a merchant account.
 * Controls whether ACH is enabled for this MID, default SEC code,
 * company name (required by NACHA — appears on bank statements),
 * company ID, and verification mode.
 */
export async function updateMerchantAccountAch(ctx: RequestContext, input: UpdateMerchantAccountAchInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [account] = await tx
      .select()
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
          eq(paymentMerchantAccounts.id, input.merchantAccountId),
        ),
      )
      .limit(1);

    if (!account) {
      throw new AppError('MERCHANT_ACCOUNT_NOT_FOUND', 'Merchant account not found', 404);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.achEnabled !== undefined) updates.achEnabled = input.achEnabled;
    if (input.achDefaultSecCode !== undefined) updates.achDefaultSecCode = input.achDefaultSecCode;
    if (input.achCompanyName !== undefined) updates.achCompanyName = input.achCompanyName;
    if (input.achCompanyId !== undefined) updates.achCompanyId = input.achCompanyId;

    await tx
      .update(paymentMerchantAccounts)
      .set(updates)
      .where(eq(paymentMerchantAccounts.id, input.merchantAccountId));

    return { result: { id: input.merchantAccountId }, events: [] };
  });

  await auditLog(ctx, 'payment.merchant_account.ach_updated', 'payment_merchant_account', result.id);
  return result;
}
