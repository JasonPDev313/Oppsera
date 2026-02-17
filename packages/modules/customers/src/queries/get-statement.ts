import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { statements } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetStatementInput {
  tenantId: string;
  statementId: string;
}

export async function getStatement(
  input: GetStatementInput,
): Promise<typeof statements.$inferSelect> {
  return withTenant(input.tenantId, async (tx) => {
    const [statement] = await tx
      .select()
      .from(statements)
      .where(
        and(
          eq(statements.id, input.statementId),
          eq(statements.tenantId, input.tenantId),
        ),
      )
      .limit(1);

    if (!statement) {
      throw new NotFoundError('Statement', input.statementId);
    }

    return statement;
  });
}
