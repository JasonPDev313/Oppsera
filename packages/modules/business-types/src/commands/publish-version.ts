import { eq, and, sql } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { businessTypeVersions } from '../schema';
import { validateForPublish } from '../validators/publish-gate';

export async function publishVersion(
  versionId: string,
  changeSummary: string,
  adminUserId: string,
) {
  const db = createAdminClient();

  // Fetch version
  const [version] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  if (!version) throw new Error('NOT_FOUND');
  if (version.status !== 'draft') throw new Error('NOT_DRAFT');

  // Run publish gate validation (outside transaction — read-only checks)
  const validation = await validateForPublish(versionId);
  if (!validation.isValid) {
    const err = new Error('PUBLISH_VALIDATION_FAILED') as Error & {
      validationResult: typeof validation;
    };
    err.validationResult = validation;
    throw err;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    // Re-check status inside transaction with row lock to prevent TOCTOU race
    const lockResult = await tx.execute(
      sql`SELECT status FROM business_type_versions WHERE id = ${versionId} FOR UPDATE`,
    );
    const rows = Array.from(lockResult as Iterable<{ status: string }>);
    if (!rows[0] || rows[0].status !== 'draft') {
      throw new Error('NOT_DRAFT');
    }

    // Archive any existing published version for this business type
    await tx
      .update(businessTypeVersions)
      .set({ status: 'archived', updatedAt: now })
      .where(
        and(
          eq(businessTypeVersions.businessTypeId, version.businessTypeId),
          eq(businessTypeVersions.status, 'published'),
        ),
      );

    // Publish the draft
    await tx
      .update(businessTypeVersions)
      .set({
        status: 'published',
        changeSummary,
        publishedAt: now,
        publishedBy: adminUserId,
        updatedAt: now,
      })
      .where(eq(businessTypeVersions.id, versionId));
  });

  const [published] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  return { version: published, validation };
}
