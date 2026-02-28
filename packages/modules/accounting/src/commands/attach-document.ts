import { eq, and } from 'drizzle-orm';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glDocumentAttachments, glJournalEntries } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { withTenant } from '@oppsera/db';

export interface AttachDocumentInput {
  journalEntryId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  storageKey: string;
  description?: string;
}

export async function attachDocument(ctx: RequestContext, input: AttachDocumentInput) {
  const result = await withTenant(ctx.tenantId, async (tx) => {
    // Verify journal entry exists and belongs to tenant
    const [entry] = await tx
      .select({ id: glJournalEntries.id })
      .from(glJournalEntries)
      .where(
        and(
          eq(glJournalEntries.id, input.journalEntryId),
          eq(glJournalEntries.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!entry) {
      throw new Error('Journal entry not found');
    }

    const id = generateUlid();
    const [attachment] = await tx
      .insert(glDocumentAttachments)
      .values({
        id,
        tenantId: ctx.tenantId,
        journalEntryId: input.journalEntryId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSizeBytes: input.fileSizeBytes,
        storageKey: input.storageKey,
        description: input.description ?? null,
        uploadedBy: ctx.user.id,
      })
      .returning();

    return attachment!;
  });

  await auditLog(ctx, 'accounting.document.attached', 'gl_document_attachment', result.id);
  return result;
}
