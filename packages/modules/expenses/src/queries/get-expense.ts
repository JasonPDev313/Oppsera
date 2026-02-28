import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { AppError } from '@oppsera/shared';

export async function getExpense(tenantId: string, expenseId: string) {
  return withTenant(tenantId, async (tx) => {
    const [expense] = await tx.execute<{
      id: string;
      tenant_id: string;
      location_id: string | null;
      expense_number: string;
      employee_user_id: string;
      expense_policy_id: string | null;
      status: string;
      expense_date: string;
      vendor_name: string | null;
      category: string;
      description: string | null;
      amount: string;
      currency: string;
      payment_method: string | null;
      is_reimbursable: boolean;
      receipt_url: string | null;
      receipt_file_name: string | null;
      gl_account_id: string | null;
      project_id: string | null;
      gl_journal_entry_id: string | null;
      submitted_at: string | null;
      submitted_by: string | null;
      approved_at: string | null;
      approved_by: string | null;
      rejected_at: string | null;
      rejected_by: string | null;
      rejection_reason: string | null;
      posted_at: string | null;
      posted_by: string | null;
      voided_at: string | null;
      voided_by: string | null;
      void_reason: string | null;
      reimbursed_at: string | null;
      reimbursement_method: string | null;
      reimbursement_reference: string | null;
      notes: string | null;
      metadata: Record<string, unknown>;
      client_request_id: string | null;
      version: number;
      created_at: string;
      updated_at: string;
    }>(sql`
      SELECT
        id, tenant_id, location_id, expense_number,
        employee_user_id, expense_policy_id, status,
        expense_date, vendor_name, category, description,
        amount, currency, payment_method, is_reimbursable,
        receipt_url, receipt_file_name,
        gl_account_id, project_id, gl_journal_entry_id,
        submitted_at, submitted_by,
        approved_at, approved_by,
        rejected_at, rejected_by, rejection_reason,
        posted_at, posted_by,
        voided_at, voided_by, void_reason,
        reimbursed_at, reimbursement_method, reimbursement_reference,
        notes, metadata, client_request_id, version,
        created_at, updated_at
      FROM expenses
      WHERE tenant_id = ${tenantId} AND id = ${expenseId}
    `);

    if (!expense) {
      throw new AppError('NOT_FOUND', 'Expense not found', 404);
    }

    // Fetch receipts
    const receiptRows = await tx.execute<{
      id: string;
      file_name: string | null;
      mime_type: string | null;
      size_bytes: number | null;
      storage_key: string;
      uploaded_by: string | null;
      uploaded_at: string;
    }>(sql`
      SELECT id, file_name, mime_type, size_bytes, storage_key,
        uploaded_by, uploaded_at
      FROM expense_receipts
      WHERE expense_id = ${expenseId}
      ORDER BY uploaded_at ASC
    `);

    const receipts = Array.from(receiptRows as Iterable<typeof receiptRows[number]>).map((r) => ({
      id: r.id,
      fileName: r.file_name ?? null,
      mimeType: r.mime_type ?? null,
      sizeBytes: r.size_bytes ?? null,
      storageKey: r.storage_key,
      uploadedBy: r.uploaded_by ?? null,
      uploadedAt: r.uploaded_at,
    }));

    // Fetch policy if assigned
    let policy = null;
    if (expense.expense_policy_id) {
      const [policyRow] = await tx.execute<{
        id: string;
        name: string;
        auto_approve_threshold: string | null;
        requires_receipt_above: string | null;
        max_amount_per_expense: string | null;
      }>(sql`
        SELECT id, name, auto_approve_threshold, requires_receipt_above, max_amount_per_expense
        FROM expense_policies
        WHERE id = ${expense.expense_policy_id}
      `);
      if (policyRow) {
        policy = {
          id: policyRow.id,
          name: policyRow.name,
          autoApproveThreshold: policyRow.auto_approve_threshold ? Number(policyRow.auto_approve_threshold) : null,
          requiresReceiptAbove: policyRow.requires_receipt_above ? Number(policyRow.requires_receipt_above) : null,
          maxAmountPerExpense: policyRow.max_amount_per_expense ? Number(policyRow.max_amount_per_expense) : null,
        };
      }
    }

    return {
      id: expense.id,
      tenantId: expense.tenant_id,
      locationId: expense.location_id ?? null,
      expenseNumber: expense.expense_number,
      employeeUserId: expense.employee_user_id,
      expensePolicyId: expense.expense_policy_id ?? null,
      status: expense.status,
      expenseDate: expense.expense_date,
      vendorName: expense.vendor_name ?? null,
      category: expense.category,
      description: expense.description ?? null,
      amount: Number(expense.amount),
      currency: expense.currency,
      paymentMethod: expense.payment_method ?? null,
      isReimbursable: expense.is_reimbursable,
      receiptUrl: expense.receipt_url ?? null,
      receiptFileName: expense.receipt_file_name ?? null,
      glAccountId: expense.gl_account_id ?? null,
      projectId: expense.project_id ?? null,
      glJournalEntryId: expense.gl_journal_entry_id ?? null,
      submittedAt: expense.submitted_at ?? null,
      submittedBy: expense.submitted_by ?? null,
      approvedAt: expense.approved_at ?? null,
      approvedBy: expense.approved_by ?? null,
      rejectedAt: expense.rejected_at ?? null,
      rejectedBy: expense.rejected_by ?? null,
      rejectionReason: expense.rejection_reason ?? null,
      postedAt: expense.posted_at ?? null,
      postedBy: expense.posted_by ?? null,
      voidedAt: expense.voided_at ?? null,
      voidedBy: expense.voided_by ?? null,
      voidReason: expense.void_reason ?? null,
      reimbursedAt: expense.reimbursed_at ?? null,
      reimbursementMethod: expense.reimbursement_method ?? null,
      reimbursementReference: expense.reimbursement_reference ?? null,
      notes: expense.notes ?? null,
      metadata: expense.metadata,
      version: Number(expense.version),
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
      receipts,
      policy,
    };
  });
}
