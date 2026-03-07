import { eq } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { businessTypes, businessCategories } from '../schema';
import type { UpdateBusinessTypeMetadataInput } from '../types/schemas';

export async function updateBusinessTypeMetadata(
  id: string,
  input: UpdateBusinessTypeMetadataInput,
  adminUserId: string,
) {
  const db = createAdminClient();

  const [existing] = await db
    .select()
    .from(businessTypes)
    .where(eq(businessTypes.id, id))
    .limit(1);

  if (!existing) {
    throw new Error('NOT_FOUND');
  }

  // Cannot deactivate while visible at signup
  if (input.isActive === false && existing.showAtSignup) {
    throw new Error('CANNOT_DEACTIVATE_SIGNUP_VISIBLE');
  }

  // Cannot edit system business types
  if (existing.isSystem) {
    throw new Error('SYSTEM_TYPE_IMMUTABLE');
  }

  // Validate categoryId if being changed
  if (input.categoryId !== undefined) {
    const [category] = await db
      .select({ id: businessCategories.id })
      .from(businessCategories)
      .where(eq(businessCategories.id, input.categoryId))
      .limit(1);

    if (!category) {
      throw new Error('INVALID_CATEGORY');
    }
  }

  const updates: Record<string, unknown> = {
    updatedBy: adminUserId,
    updatedAt: new Date(),
  };

  // Only set fields that were provided — slug is intentionally excluded (immutable)
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.iconKey !== undefined) updates.iconKey = input.iconKey;
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  if (input.showAtSignup !== undefined) updates.showAtSignup = input.showAtSignup;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
  if (input.categoryId !== undefined) updates.categoryId = input.categoryId;

  await db
    .update(businessTypes)
    .set(updates)
    .where(eq(businessTypes.id, id));

  const [updated] = await db
    .select()
    .from(businessTypes)
    .where(eq(businessTypes.id, id))
    .limit(1);

  return updated;
}
