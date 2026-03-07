import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import {
  businessTypes,
  businessTypeVersions,
  businessTypeAccountingTemplates,
  businessCategories,
} from '../schema';
import type { CreateBusinessTypeInput } from '../types/schemas';

export async function createBusinessType(
  input: CreateBusinessTypeInput,
  adminUserId: string,
) {
  const db = createAdminClient();

  // Validate categoryId exists
  const [category] = await db
    .select({ id: businessCategories.id })
    .from(businessCategories)
    .where(eq(businessCategories.id, input.categoryId))
    .limit(1);

  if (!category) {
    throw new Error('INVALID_CATEGORY');
  }

  // Check slug uniqueness
  const [existing] = await db
    .select({ id: businessTypes.id })
    .from(businessTypes)
    .where(eq(businessTypes.slug, input.slug))
    .limit(1);

  if (existing) {
    throw new Error('SLUG_CONFLICT');
  }

  const businessTypeId = generateUlid();
  const versionId = generateUlid();
  const accountingTemplateId = generateUlid();
  const now = new Date();

  // Transaction: create business type + initial draft version + empty accounting template
  await db.transaction(async (tx) => {
    await tx.insert(businessTypes).values({
      id: businessTypeId,
      categoryId: input.categoryId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      iconKey: input.iconKey ?? null,
      isSystem: false,
      isActive: input.isActive,
      showAtSignup: input.showAtSignup,
      sortOrder: input.sortOrder,
      createdBy: adminUserId,
      updatedBy: adminUserId,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(businessTypeVersions).values({
      id: versionId,
      businessTypeId,
      versionNumber: 1,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(businessTypeAccountingTemplates).values({
      id: accountingTemplateId,
      businessTypeVersionId: versionId,
      createdAt: now,
      updatedAt: now,
    });
  });

  const [businessType] = await db
    .select()
    .from(businessTypes)
    .where(eq(businessTypes.id, businessTypeId))
    .limit(1);

  const [draftVersion] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  return { businessType: businessType!, draftVersion: draftVersion! };
}
