import { eq, and } from 'drizzle-orm';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glDocumentAttachments } from '@oppsera/db';
import { withTenant } from '@oppsera/db';

export async function removeDocument(ctx: RequestContext, documentId: string) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    const [deleted] = await tx
      .delete(glDocumentAttachments)
      .where(
        and(
          eq(glDocumentAttachments.id, documentId),
          eq(glDocumentAttachments.tenantId, ctx.tenantId),
        ),
      )
      .returning();

    if (!deleted) {
      throw new Error('Document attachment not found');
    }

    return deleted;
  });

  await auditLog(ctx, 'accounting.document.removed', 'gl_document_attachment', result.id);
  return result;
}
