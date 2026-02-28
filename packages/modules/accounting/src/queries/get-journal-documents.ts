import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { glDocumentAttachments } from '@oppsera/db';

export interface GetJournalDocumentsInput {
  tenantId: string;
  journalEntryId: string;
}

export async function getJournalDocuments(input: GetJournalDocumentsInput) {
  return withTenant(input.tenantId, async (tx) => {
    const documents = await tx
      .select()
      .from(glDocumentAttachments)
      .where(
        and(
          eq(glDocumentAttachments.tenantId, input.tenantId),
          eq(glDocumentAttachments.journalEntryId, input.journalEntryId),
        ),
      );

    return documents;
  });
}
