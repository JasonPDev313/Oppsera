import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface BankAccount {
  id: string;
  tenantId: string;
  glAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankRoutingNumber: string | null;
  accountType: string | null;
  isActive: boolean;
  lastReconciledDate: string | null;
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
        ba.bank_account_number,
        ba.bank_routing_number,
        ba.account_type,
        ba.is_active,
        ba.last_reconciled_date,
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
      bankAccountNumber: row.bank_account_number ? String(row.bank_account_number) : null,
      bankRoutingNumber: row.bank_routing_number ? String(row.bank_routing_number) : null,
      accountType: row.account_type ? String(row.account_type) : null,
      isActive: Boolean(row.is_active),
      lastReconciledDate: row.last_reconciled_date ? String(row.last_reconciled_date) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }));
  });
}
