import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface BankAccount {
  id: string;
  tenantId: string;
  glAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string | null;
  accountNumberLast4: string | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListBankAccountsInput {
  tenantId: string;
}

export async function listBankAccounts(
  input: ListBankAccountsInput,
): Promise<BankAccount[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        ba.id,
        ba.tenant_id,
        ba.gl_account_id,
        a.account_number,
        a.name AS account_name,
        ba.bank_name,
        ba.account_number_last4,
        ba.is_active,
        ba.is_default,
        ba.created_at,
        ba.updated_at
      FROM bank_accounts ba
      INNER JOIN gl_accounts a ON a.id = ba.gl_account_id
      WHERE ba.tenant_id = ${input.tenantId}
      ORDER BY a.account_number
    `);

    return Array.from(rows as Iterable<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      glAccountId: String(row.gl_account_id),
      accountNumber: String(row.account_number),
      accountName: String(row.account_name),
      bankName: row.bank_name ? String(row.bank_name) : null,
      accountNumberLast4: row.account_number_last4 ? String(row.account_number_last4) : null,
      isActive: Boolean(row.is_active),
      isDefault: Boolean(row.is_default),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  });
}
