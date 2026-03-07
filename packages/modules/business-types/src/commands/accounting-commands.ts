import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { businessTypeAccountingTemplates, businessTypeVersions } from '../schema';
import { AccountingTemplateInputSchema } from '../types/schemas';
import type { AccountingTemplateInput } from '../types/schemas';

export async function saveAccountingTemplate(
  versionId: string,
  payload: AccountingTemplateInput,
  _adminUserId: string,
) {
  const db = createAdminClient();

  // Check version is editable
  const [version] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  if (!version) throw new Error('NOT_FOUND');
  if (version.status !== 'draft') throw new Error('VERSION_NOT_EDITABLE');

  // Defense-in-depth: reject structurally invalid data even though routes validate first
  const parseResult = AccountingTemplateInputSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new Error('INVALID_ACCOUNTING_DATA');
  }

  const validData = parseResult.data;
  const hasRevenue = Object.values(validData.revenueCategories).some((v) => v);
  const hasPayment = Object.values(validData.paymentGlMappings).some((v) => v);
  const validationStatus = (!hasRevenue && !hasPayment) ? 'incomplete' : 'valid';
  const validationErrors: unknown[] = [];

  const now = new Date();

  // Upsert accounting template
  const [existing] = await db
    .select()
    .from(businessTypeAccountingTemplates)
    .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, versionId))
    .limit(1);

  if (existing) {
    await db
      .update(businessTypeAccountingTemplates)
      .set({
        coaTemplateRef: validData.coaTemplateRef ?? null,
        revenueCategories: validData.revenueCategories,
        paymentGlMappings: validData.paymentGlMappings,
        taxBehavior: validData.taxBehavior,
        deferredRevenue: validData.deferredRevenue,
        cogsBehavior: validData.cogsBehavior,
        fiscalSettings: validData.fiscalSettings,
        validationStatus,
        validationErrors,
        updatedAt: now,
      })
      .where(eq(businessTypeAccountingTemplates.id, existing.id));
  } else {
    await db.insert(businessTypeAccountingTemplates).values({
      id: generateUlid(),
      businessTypeVersionId: versionId,
      coaTemplateRef: validData.coaTemplateRef ?? null,
      revenueCategories: validData.revenueCategories,
      paymentGlMappings: validData.paymentGlMappings,
      taxBehavior: validData.taxBehavior,
      deferredRevenue: validData.deferredRevenue,
      cogsBehavior: validData.cogsBehavior,
      fiscalSettings: validData.fiscalSettings,
      validationStatus,
      validationErrors,
      createdAt: now,
      updatedAt: now,
    });
  }

  const [result] = await db
    .select()
    .from(businessTypeAccountingTemplates)
    .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, versionId))
    .limit(1);

  return result!;
}
