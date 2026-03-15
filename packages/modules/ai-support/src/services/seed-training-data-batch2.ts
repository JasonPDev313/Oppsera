import { db, aiSupportAnswerCards } from '@oppsera/db';

// ─── Batch 2: 40 ERP/Accounting Training Answer Cards ───────────────────────
// Grounded in actual OppsEra codebase features. Inserted as 'draft' for admin review.

const TRAINING_CARDS_BATCH2 = [
  {
    slug: 'erp-howto-create-invoice',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'how do I create a new invoice|create invoice|new invoice|generate invoice|make an invoice|bill a customer|send an invoice|invoice a customer',
    approvedAnswerMarkdown: `## Creating a New Invoice

1. Go to **Customers** → **Billing**
2. Click **New Invoice**
3. Select the **customer**
4. Add line items — each line needs:
   - GL account (revenue account)
   - Description
   - Quantity and unit price
   - Tax group (if taxable)
5. Review the total (auto-calculated from line items + tax)
6. Click **Save** to create as a draft

### Posting the Invoice
A draft invoice doesn't affect the GL or the customer's balance. To make it live:
1. Open the draft invoice
2. Click **Post**
3. The system creates a GL entry (Dr Accounts Receivable / Cr Revenue + Tax Payable)
4. The invoice appears on the customer's AR ledger

### Invoice Statuses
- **Draft** — editable, no financial impact
- **Posted** — live, affects AR balance
- **Partial** — partially paid
- **Paid** — fully paid
- **Voided** — reversed

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'erp-howto-edit-invoice-after-sent',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'edit invoice after sent|edit posted invoice|change invoice after posting|modify sent invoice|update a posted invoice|fix a sent invoice|invoice already sent how to change',
    approvedAnswerMarkdown: `## Editing an Invoice After It Has Been Sent or Posted

### Draft Invoices
Draft invoices can be edited freely — just open the invoice and make changes.

### Posted Invoices
Posted invoices **cannot be directly edited** — this preserves the audit trail.

### How to Correct a Posted Invoice
1. Go to **Customers** → **Billing**
2. Find the posted invoice
3. **Void** the invoice (creates a reversing GL entry)
4. Create a **new invoice** with the correct details
5. Post the new invoice

### Alternative: Credit Memo
If you only need to reduce the amount (not change line items):
1. Issue a **Credit Memo** against the original invoice
2. The credit reduces the customer's AR balance
3. The original invoice remains on record

**Permission required:** \`ar.manage\`

**Tip:** Always add a note referencing the original invoice number when creating corrections.`,
  },
  {
    slug: 'erp-howto-record-customer-payment',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'record a customer payment|receive payment|apply payment to invoice|how to enter payment|customer paid how to record|payment received|log a payment|receipt for customer payment',
    approvedAnswerMarkdown: `## Recording a Customer Payment

1. Go to **Customers** → **Billing**
2. Click **New Receipt** (or **Record Payment**)
3. Select the **customer**
4. Enter the payment amount and date
5. Select the **bank account** receiving the funds
6. **Allocate** the payment to one or more open invoices:
   - Click each invoice and enter the amount applied
   - The total allocated must not exceed the receipt amount
7. Click **Save** to create a draft receipt
8. Click **Post** to finalize

### What Happens When You Post
- GL entry: Dr Bank Account / Cr Accounts Receivable
- Each allocated invoice updates its \`amountPaid\` and \`balanceDue\`
- Invoice status changes to **partial** or **paid** depending on the amount

### Partial Payments
You can apply less than the full invoice amount. The invoice moves to **partial** status. Additional receipts can be applied later until the balance is zero.

### Unapplied Payments
If the receipt amount exceeds the allocated total, the remainder stays as an unapplied credit on the customer's account.

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'erp-troubleshoot-invoice-still-unpaid',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'invoice still showing unpaid|invoice not marked paid|payment entered but invoice unpaid|why is invoice still open|invoice balance wrong|payment not reflecting on invoice',
    approvedAnswerMarkdown: `## Invoice Still Showing as Unpaid

### Common Causes

1. **Receipt not posted** — The payment may have been entered as a draft but not posted. Check the receipt status.
2. **Payment not allocated** — The receipt was posted but wasn't allocated to this specific invoice. Check the receipt's allocation list.
3. **Payment applied to wrong invoice** — The receipt may be allocated to a different invoice for the same customer. Check the AR ledger.
4. **Partial payment** — The payment amount may not cover the full invoice balance. The invoice shows as **partial**, not **paid**.
5. **Payment posted to wrong customer** — Verify the receipt customer matches the invoice customer.

### How to Diagnose
1. Go to **Customers** → find the customer → **Billing** tab
2. Check the **AR Ledger** — this shows all invoices, receipts, and their allocations
3. Look for the specific receipt and verify its allocation
4. Check if the receipt status is **posted** (not draft)

### If the Payment Was Correctly Recorded
- Void the receipt, then re-create it with the correct allocation
- Or create an additional receipt to cover the remaining balance

**If you've verified everything and the status is still wrong, contact support with the invoice and receipt numbers.**`,
  },
  {
    slug: 'erp-corrections-issue-refund-credit-memo',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'issue a refund|issue credit memo|credit note|refund a customer|credit memo for customer|reverse a charge|give customer credit|create credit memo',
    approvedAnswerMarkdown: `## Issuing a Refund or Credit Memo

### Credit Memo (Reduce Balance Without Cash Refund)
1. Go to **Customers** → **Billing**
2. Find the original invoice
3. Click **Issue Credit Memo**
4. Enter the credit amount and reason
5. Post the credit memo

The credit memo reduces the customer's outstanding balance and creates a reversing GL entry.

### Cash/Card Refund
For refunding money back to the customer:
- **POS returns** — Use the Return workflow from the Orders page
- **AR refund** — Void the original receipt (reverses the GL entry), then process the refund through your payment method

### Important Notes
- Credit memos are for AR balance adjustments (accounting level)
- POS refunds are for returning items purchased at the register
- Both create GL entries automatically
- Credit memos cannot exceed the original invoice amount

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'erp-corrections-void-reverse-payment',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'void a payment|reverse a payment|undo a payment|cancel a payment|payment was wrong|reverse a receipt|void receipt|undo payment entry',
    approvedAnswerMarkdown: `## Voiding or Reversing a Payment

### Void an AR Receipt (Customer Payment)
1. Go to **Customers** → **Billing**
2. Find the posted receipt
3. Click **Void**
4. Confirm

This will:
- Create a reversing GL entry (Cr Bank / Dr Accounts Receivable)
- Un-apply the allocations — affected invoices revert to their previous balance/status
- The void appears in the audit trail

### Void an AP Payment (Vendor Payment)
1. Go to **AP** → **Payments**
2. Find the posted payment
3. Click **Void**
4. Confirm

Same reversal logic applies — bills return to their previous balance.

### Important Notes
- Only posted receipts/payments can be voided (drafts can be deleted)
- Voiding is irreversible — you cannot un-void
- If you voided in error, create a new receipt/payment to replace it
- All voids are logged in the audit trail

**Permission required:** \`ar.manage\` (AR) or \`ap.manage\` (AP)`,
  },
  {
    slug: 'erp-howto-create-vendor-bill',
    moduleKey: 'ap',
    route: null,
    questionPattern:
      'create a bill for vendor|enter a vendor bill|vendor invoice|record a bill|new vendor bill|AP bill|create AP entry|enter a bill from supplier',
    approvedAnswerMarkdown: `## Creating a Vendor Bill

1. Go to **AP** (Accounts Payable)
2. Click **New Bill**
3. Select the **vendor** (must be an active vendor)
4. Enter the bill date and due date
5. Add line items — each line needs:
   - **Type**: expense, inventory, or freight
   - **GL account** (expense or inventory account)
   - **Amount**
   - Optional: project, department
6. Click **Save** to create as a draft

### Posting the Bill
1. Open the draft bill
2. Click **Post**
3. The system creates a GL entry (Dr Expense/Inventory / Cr Accounts Payable)
4. The bill appears on the vendor's AP ledger

### From a Receiving Receipt
Bills can also be auto-created from an inventory receipt:
- When you receive inventory, use **Create Bill from Receipt** to generate an AP bill with the receipt's line items and costs pre-filled

### Payment Terms
Set up payment terms (Net 30, Net 60, etc.) to auto-calculate due dates.

**Permission required:** \`ap.manage\``,
  },
  {
    slug: 'erp-howto-record-vendor-payment',
    moduleKey: 'ap',
    route: null,
    questionPattern:
      'record vendor payment|pay a vendor|pay a bill|vendor payment|AP payment|make a payment to vendor|pay supplier|how to pay vendor bill',
    approvedAnswerMarkdown: `## Recording a Vendor Payment

1. Go to **AP** (Accounts Payable)
2. Click **New Payment**
3. Select the **vendor**
4. Enter the payment amount, date, and bank account
5. **Allocate** the payment to one or more open bills:
   - Select each bill and enter the amount applied
   - Total allocated cannot exceed the payment amount
6. Click **Save** to create a draft
7. Click **Post** to finalize

### What Happens When You Post
- GL entry: Dr Accounts Payable / Cr Bank Account
- Each allocated bill updates its balance and status (partial or paid)

### Partial Payments
Apply less than the full bill amount — the bill moves to **partial** status. Additional payments can be applied later.

### Vendor Credits
If the vendor issued a credit memo:
1. Create a **Vendor Credit** to record it
2. Use **Apply Vendor Credit** to offset against an open bill

### Cash Requirements
Use the **Cash Requirements** report to see upcoming AP payments by due date.

**Permission required:** \`ap.manage\``,
  },
  {
    slug: 'erp-howto-enter-expense',
    moduleKey: 'expenses',
    route: null,
    questionPattern:
      'enter an expense|record expense|create expense|log an expense|submit expense|expense report|track expenses|how to enter expenses|add expense',
    approvedAnswerMarkdown: `## Entering an Expense

1. Go to **Expenses**
2. Click **New Expense**
3. Fill in the details:
   - **Category** (maps to GL account)
   - **Vendor name** (who you paid)
   - **Amount**
   - **Date**
   - **Payment method** used
   - **GL account** (auto-suggested from category)
   - **Project** (optional — for project cost tracking)
   - **Is reimbursable** flag (if an employee paid out of pocket)
4. Click **Save**

### Expense Lifecycle
- **Draft** → **Submitted** → **Approved** / **Rejected** → **Posted** → **Reimbursed**

### Approval Workflow
1. Employee creates and **submits** the expense
2. Manager **approves** or **rejects** with notes
3. Once approved, the expense can be **posted** to the GL
4. If reimbursable, mark as **reimbursed** when the employee is paid back

### Expense Policies
Administrators can create expense policies with rules and limits. Expenses are validated against the applicable policy.

**Permissions:** \`expenses.create\` (enter), \`expenses.approve\` (approve/reject), \`expenses.manage\` (full control)`,
  },
  {
    slug: 'erp-howto-categorize-transactions',
    moduleKey: 'accounting',
    route: '/accounting/mappings',
    questionPattern:
      'categorize transactions|assign GL account|how to categorize|transaction classification|map transactions to accounts|GL mapping|which account does this go to|wrong category',
    approvedAnswerMarkdown: `## Categorizing Transactions Correctly

OppsEra auto-categorizes most transactions via **GL mappings**. Here's how it works:

### Automatic Categorization
Every business event (sale, payment, refund, receipt, etc.) is automatically posted to the correct GL accounts via **27 GL posting adapters**. These adapters use mappings configured in:

**Accounting → Mappings**
- **Transaction type mappings** — map each event type to specific GL accounts
- **Payment type defaults** — map each tender type (cash, card, gift card) to accounts
- **Tax group defaults** — map tax groups to liability accounts
- **F&B category mappings** — map food/beverage categories to revenue accounts
- **Discount GL mappings** — map discounts to contra-revenue accounts
- **Sub-department defaults** — map departments to accounts

### Checking for Gaps
- **Mapping Coverage Report** — shows which events have mappings vs. which don't
- **Unmapped Events** — lists events that fired but had no GL mapping (these won't post to the GL)

### Manual Transactions
For manual journal entries, expenses, and bills — you select the GL account directly when creating the entry.

### If Something Is Categorized Wrong
1. Check the mapping in **Accounting → Mappings**
2. Update the mapping to the correct account
3. For already-posted entries: void and re-post, or create a correcting journal entry

**Permission required:** \`mappings.manage\``,
  },
  {
    slug: 'erp-howto-manage-chart-of-accounts',
    moduleKey: 'accounting',
    route: '/accounting/coa',
    questionPattern:
      'create chart of accounts|edit chart of accounts|add GL account|new account|manage accounts|COA|add account to chart|set up chart of accounts|chart of accounts setup',
    approvedAnswerMarkdown: `## Managing the Chart of Accounts

### Creating a New Account
1. Go to **Accounting** → **Chart of Accounts**
2. Click **New Account**
3. Fill in:
   - **Account number**
   - **Account name**
   - **Account type** (Asset, Liability, Equity, Revenue, Expense)
   - **Classification** (e.g., Cash & Bank, Accounts Receivable, etc.)
   - **Parent account** (optional — for hierarchy)
4. Save

### Editing an Account
1. Find the account in the COA list
2. Click to open
3. Edit name, classification, or parent — account type cannot be changed after creation
4. Save

### Other COA Operations
- **Renumber** — Change an account number without losing history
- **Merge** — Combine two accounts (all journal lines move to the target account)
- **Deactivate** — Hide from dropdowns without deleting (preserves history)
- **Import from CSV** — Bulk-import via Accounting → COA Import wizard

### COA Health Check
Go to **Accounting → COA Health** to identify:
- Accounts with no activity
- Missing account types
- Mapping coverage gaps

### Default COA
New tenants get a starter COA automatically. Customize it to match your business.

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'erp-howto-post-journal-entry',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'post a journal entry|create journal entry|manual journal entry|make a GL entry|record a journal entry|how to post JE|manual journal|accounting adjustment',
    approvedAnswerMarkdown: `## Posting a Journal Entry

1. Go to **Accounting** → **Journals**
2. Click **New Journal Entry**
3. Enter a **description** (be specific — e.g., "Prepaid insurance adjustment March 2026")
4. Add debit and credit lines:
   - Each line needs a **GL account** and **amount**
   - Total debits must equal total credits (the system enforces this)
5. Set the **business date** (can be backdated to a prior open period)
6. Click **Post**

### Draft vs. Posted
- **Save as draft** — no GL impact, can be edited
- **Post** — creates the GL entry immediately, cannot be edited after posting

### Recurring Journal Entries
For entries that repeat monthly/quarterly/annually:
1. Go to **Accounting** → **Recurring Templates**
2. Create a template with the debit/credit lines
3. Set the frequency and start date
4. The system auto-generates entries on schedule

### Tips
- Voided entries cannot be unvoided — create a new entry instead
- Posted entries in a closed period cannot be reversed; post the correction to the current period
- All journal entries are logged in the audit trail

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'erp-howto-reverse-journal-entry',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'reverse a journal entry|undo journal entry|reverse JE|void a journal entry|cancel journal entry|how to reverse GL entry|undo a posting',
    approvedAnswerMarkdown: `## Reversing a Journal Entry

1. Go to **Accounting** → **Journals**
2. Find the journal entry you want to reverse
3. Click **Void**
4. Confirm

### What Happens
- The system creates an **equal and opposite entry** (debits become credits, credits become debits)
- Both the original and the reversing entry appear in the GL
- The net effect is zero

### Important Notes
- Voiding is a **one-way operation** — you cannot un-void
- If the original entry is in a **closed period**, the reversing entry posts to the current open period
- If you voided by mistake, create a new journal entry to replicate the original
- Both entries remain visible in the GL for audit purposes

### Alternative: Draft Entries
If the journal entry is still a **draft** (not yet posted), you can simply delete it — no void needed.

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'erp-corrections-fix-wrong-je',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'fix journal entry wrong account|JE posted to wrong account|correct a journal entry|move entry to different account|journal entry on wrong GL code|reclassify a journal entry',
    approvedAnswerMarkdown: `## Fixing a Journal Entry Posted to the Wrong Account

Posted journal entries **cannot be edited**. To correct:

1. **Void the original** — Go to Accounting → Journals → find the entry → Void
2. **Post a new entry** — Create a new journal entry with the correct accounts and amounts
3. **Reference the original** — Add a note on the new entry referencing the voided entry number

### If the Original Is in a Closed Period
- You cannot void entries in closed periods directly
- Post a **correcting reclassification entry** in the current open period:
  - Debit the correct account
  - Credit the incorrect account
  - Add a note explaining the reclassification

### Tips
- Review the **GL Detail Report** filtered by the wrong account to identify all affected entries
- For large-scale reclassifications, the **GL Remap** tool may help
- Consider running a **Trial Balance** after corrections to verify everything balances

**Permission required:** \`accounting.manage\`

**Caution:** This affects financial statements. Consult your accounting manager if you're unsure which accounts to use.`,
  },
  {
    slug: 'erp-howto-bank-reconciliation-v2',
    moduleKey: 'accounting',
    route: '/accounting/bank-reconciliation',
    questionPattern:
      'reconcile bank account|bank reconciliation process|how to do bank rec|match bank transactions|bank statement reconciliation|clear bank items|reconcile my bank',
    approvedAnswerMarkdown: `## Reconciling Your Bank Account

### Starting a Reconciliation
1. Go to **Accounting** → **Bank Reconciliation**
2. Select the **bank account** to reconcile
3. Click **New Session**
4. Enter the **statement ending balance** and **statement date** from your bank statement

### Matching Transactions
1. Review the list of uncleared GL items
2. **Match** each item against your bank statement:
   - Check off items that appear on both the bank statement and in the system
   - Items not on the statement remain uncleared
3. Use **Auto-Match** to pair obvious matches automatically
4. For items on the bank statement but not in the system, add **Bank Adjustments**

### Completing the Reconciliation
- When the difference between the statement balance and the cleared GL balance is **$0.00**, click **Complete**
- The system locks the reconciled items

### Additional Tools
- **Settlement Matching** — Match card processor settlements to tenders
- **Settlement CSV Import** — Import processor settlement files for bulk matching
- **Daily Reconciliation** — View status by individual day
- **Reconciliation Waterfall** — Track the progression of unreconciled items over time

**Permission required:** \`banking.reconcile\``,
  },
  {
    slug: 'erp-troubleshoot-bank-balance-mismatch',
    moduleKey: 'accounting',
    route: '/accounting/bank-reconciliation',
    questionPattern:
      'bank balance doesn\'t match|ledger balance wrong|bank and GL don\'t match|why is my bank balance off|reconciliation difference|bank balance mismatch|ledger doesn\'t match bank',
    approvedAnswerMarkdown: `## Bank Balance Not Matching Ledger Balance

### Common Causes

1. **Uncleared items** — Checks written or deposits made that haven't cleared the bank yet (outstanding checks / deposits in transit)
2. **Bank fees/interest not recorded** — Bank charges or interest credits not yet entered in the system
3. **Timing differences** — Transactions recorded on different dates in the system vs. the bank
4. **Unrecorded card settlements** — Card processor settlements that haven't been matched to GL entries
5. **Duplicate entries** — Same transaction entered twice in the system
6. **Voided transactions** — A voided payment in the system that still cleared at the bank

### How to Diagnose
1. Start a **bank reconciliation session** — this shows all uncleared items
2. Compare the uncleared items list against your bank statement
3. Items on the bank statement but not in the system → create **bank adjustments**
4. Items in the system but not on the bank statement → likely outstanding (leave uncleared)
5. Check the **Reconciliation Waterfall** to see if uncleared items are growing over time

### If the Difference Persists
- Check for manual journal entries posted to the bank GL account
- Review voided receipts/payments — they reverse the GL but the bank may have already processed them
- Use the **GL Detail Report** filtered to the bank account for a complete transaction list`,
  },
  {
    slug: 'erp-integrations-bank-feed',
    moduleKey: 'accounting',
    route: '/accounting/bank-reconciliation',
    questionPattern:
      'connect bank feed|bank feed import|automatic bank import|reconnect bank feed|Plaid|bank sync|automatic transactions|bank data import|connect my bank',
    approvedAnswerMarkdown: `## Bank Feed Connectivity

**OppsEra does not currently have live bank feed connectivity** (no Plaid, Yodlee, or open banking integration).

### What IS Available
- **Manual bank reconciliation** — Match your bank statement to GL items manually or with auto-match
- **Settlement CSV import** — Import card processor settlement files for matching
- **Manual journal entries** — Record bank fees, interest, and other items not captured by the system

### How Reconciliation Works Without a Bank Feed
1. Download your bank statement (PDF or CSV) from your bank's website
2. Go to **Accounting → Bank Reconciliation**
3. Create a new session with the statement balance
4. Match items manually or use auto-match
5. Add bank adjustments for items on the statement but not in the system
6. Complete the reconciliation when the difference is $0.00

### Bank Transactions Not Importing?
Since there's no automated import, all transactions are either:
- **Auto-generated** by the system (sales, payments, receipts, refunds via GL posting adapters)
- **Manually entered** (journal entries, bank adjustments, expenses)

If you're missing transactions, check that the originating event (sale, receipt, etc.) was posted successfully.`,
  },
  {
    slug: 'erp-troubleshoot-bank-transactions-not-importing',
    moduleKey: 'accounting',
    route: '/accounting/bank-reconciliation',
    questionPattern:
      'bank transactions not importing|transactions not showing|bank feed not working|bank not syncing|missing bank transactions|transactions not appearing|bank import broken',
    approvedAnswerMarkdown: `## Bank Transactions Not Importing

### Understanding How Transactions Enter the System
OppsEra does **not** have a bank feed that imports transactions automatically. Transactions appear in the GL through two paths:

1. **Automated GL posting** — When you complete a sale, record a payment, post a receipt, etc., the GL posting adapters automatically create journal entries
2. **Manual entry** — Journal entries, expenses, bank adjustments

### If Transactions Are Missing
Check these in order:

1. **Was the source event posted?** — A draft invoice, receipt, or bill doesn't create a GL entry until posted
2. **Is there a GL mapping?** — Check Accounting → Mappings. If an event type has no mapping, it won't post to the GL
3. **Check unmapped events** — Accounting → Mappings → Unmapped Events shows events that fired but had no GL destination
4. **Check posting status** — Some entries may show as Pending or Failed in the GL
5. **Closed period** — If the transaction date falls in a closed period, the entry can't post

### Settlement Import
For card processor settlements:
- Use **Accounting → Bank Reconciliation → Import Settlement CSV** to import batch settlement files from your payment processor

**If GL entries are consistently not posting for a specific event type, contact support.**`,
  },
  {
    slug: 'erp-howto-close-accounting-period',
    moduleKey: 'accounting',
    route: '/accounting/period-close',
    questionPattern:
      'close the month|close accounting period|month end close|period close|close the books|month end process|close financial period|lock the period|end of month',
    approvedAnswerMarkdown: `## Closing the Month / Accounting Period

### Before You Start
Period close is **irreversible** — once closed, no entries can be posted to that period.

### Process
1. Go to **Accounting** → **Period Close**
2. Review the **Close Checklist**:
   - All journal entries posted or voided (no drafts remaining)
   - Bank accounts reconciled
   - Settlements matched
   - Open AP/AR items reviewed
   - All locations ready
3. Resolve any open items flagged by the checklist
4. Click **Run Close Orchestrator**
5. The system will:
   - Lock the period from further posting
   - Generate retained earnings entries
   - Update period status across all locations
6. Confirm the close

### Tips
- Run a **Trial Balance** first to verify all accounts balance
- Review the **P&L** and **Balance Sheet** before closing
- All locations must complete their close before the period can be locked
- Corrections to closed periods must be posted in the next open period

**Permission required:** \`period.close\``,
  },
  {
    slug: 'erp-howto-reopen-closed-period',
    moduleKey: 'accounting',
    route: '/accounting/period-close',
    questionPattern:
      'reopen a closed period|reopen accounting period|unlock closed period|undo period close|reverse period close|open a closed month|unlock the books',
    approvedAnswerMarkdown: `## Reopening a Closed Period

**Closed accounting periods cannot be reopened.** The period lock is one-directional by design — this protects the integrity of finalized financial statements.

### What to Do Instead

If you need to make corrections to a closed period:
1. **Post corrections to the current open period** — Create adjusting journal entries dated in the current period that correct the error
2. **Add a note** on the correcting entry referencing the original period and entry
3. **Run comparative reports** to verify the correction achieves the intended result

### Why Can't Periods Be Reopened?
- Closed periods guarantee that published financial statements remain unchanged
- Auditors rely on period locks to verify financial integrity
- Reopening would invalidate any retained earnings calculations that ran at close

### If This Is Urgent
Contact support to discuss options. In extreme cases, a database-level adjustment may be possible, but this is not a standard workflow and requires careful coordination.

**Tip:** Always review the P&L and Balance Sheet thoroughly before closing a period to avoid needing corrections later.`,
  },
  {
    slug: 'erp-reporting-profit-loss',
    moduleKey: 'accounting',
    route: '/accounting/statements/profit-loss',
    questionPattern:
      'run P&L|profit and loss report|income statement|how to see P&L|P&L report|run profit and loss|revenue and expenses report|P&L by location|P&L by department',
    approvedAnswerMarkdown: `## Running a Profit & Loss Report

1. Go to **Accounting** → **Statements** → **Profit & Loss**
2. Set your **date range** (month, quarter, year, or custom dates)
3. Optionally filter by:
   - **Location** — see P&L for a specific site
   - **Department** — drill down by business unit
4. Click **Generate**

### What the P&L Shows
- **Revenue** — all income accounts
- **Cost of Goods Sold** — COGS accounts
- **Gross Profit** — Revenue minus COGS
- **Operating Expenses** — by category
- **Net Income** — bottom line

### Related Reports
- **Consolidated P&L** — Compare all locations side-by-side (Accounting → Reports → Consolidated P&L)
- **Budget vs. Actual** — See variance against budgets
- **Period Comparison** — Compare current period to prior periods

### Export
Click the **Export/Download** button to save as CSV for Excel.

**Permission required:** \`financials.view\` (view), \`reports.export\` (CSV download)`,
  },
  {
    slug: 'erp-reporting-balance-sheet',
    moduleKey: 'accounting',
    route: '/accounting/statements/balance-sheet',
    questionPattern:
      'balance sheet|run balance sheet|how to see balance sheet|assets and liabilities|balance sheet report|statement of financial position|net worth report',
    approvedAnswerMarkdown: `## Running a Balance Sheet Report

1. Go to **Accounting** → **Statements** → **Balance Sheet**
2. Set the **as-of date** (the balance sheet shows account balances as of a specific date)
3. Optionally filter by **location**
4. Click **Generate**

### What the Balance Sheet Shows
- **Assets** — Cash, AR, inventory, fixed assets, prepaid expenses
- **Liabilities** — AP, tax payable, accrued expenses, loans
- **Equity** — Owner's equity, retained earnings, current year net income

### Balance Check
The report includes an **isBalanced** indicator:
- **Balanced** — Assets = Liabilities + Equity (within $0.01)
- **Unbalanced** — Something is off; investigate journal entries

### Current Year Net Income
The balance sheet automatically includes **current year net income** (calculated from revenue/expense accounts since the fiscal year start) in the equity section, even before period close.

### Export
Click the **Export** button to download as CSV.

**Permission required:** \`financials.view\``,
  },
  {
    slug: 'erp-reporting-cash-flow',
    moduleKey: 'accounting',
    route: '/accounting/statements/cash-flow',
    questionPattern:
      'cash flow report|cash flow statement|how to see cash flow|where is money going|cash in and cash out|statement of cash flows|run cash flow',
    approvedAnswerMarkdown: `## Running a Cash Flow Report

1. Go to **Accounting** → **Statements** → **Cash Flow**
2. Set your **date range**
3. Click **Generate**

### What the Cash Flow Statement Shows (Indirect Method)
- **Operating Activities** — Net income adjusted for non-cash items (depreciation) and working capital changes (AR, AP, inventory)
- **Investing Activities** — Fixed asset purchases and disposals
- **Financing Activities** — Equity changes, loan proceeds/payments
- **Net Change in Cash** — Total change for the period
- **Beginning Cash Balance** — Cash at the start of the period
- **Ending Cash Balance** — Cash at the end of the period

### Related Reports
- **Cash Flow Forecast** — Forward-looking projection based on AP due dates, recurring entries, and trends (Accounting → Reports → Cash Flow Forecast)
- **Cash Requirements** — Upcoming AP payments by due date (AP module)

### Export
Click the **Export** button to download as CSV.

**Permission required:** \`financials.view\``,
  },
  {
    slug: 'erp-reporting-export-reports',
    moduleKey: 'reporting',
    route: null,
    questionPattern:
      'export report to Excel|download report CSV|export to PDF|save report|download financial statement|export accounting data|get data into Excel|export report to spreadsheet',
    approvedAnswerMarkdown: `## Exporting Reports to Excel, CSV, or PDF

### CSV Export (Most Reports)
Almost all report pages have an **Export** or **Download CSV** button:
1. Navigate to the report
2. Set your filters (date range, location, etc.)
3. Click **Export** / **Download CSV**
4. The file downloads to your computer
5. Open in Excel, Google Sheets, or any spreadsheet app

### Where to Find Exports
- **Financial Statements** — P&L, Balance Sheet, Cash Flow, Trial Balance
- **Accounting Reports** — GL Detail, GL Summary, Sales Tax, Budget vs Actual
- **AR/AP Reports** — Aging reports, ledger reports
- **Sales Reports** — Daily sales, item sales, customer spending
- **Inventory Reports** — Valuation, movements
- **PMS/Spa Reports** — Manager's report, provider performance

### PDF Export
Financial statements can be printed to PDF using the browser's print function (Ctrl+P / Cmd+P). The print layout is optimized for standard page sizes.

### Custom Reports
Custom reports (Reports → Custom) can also be exported to CSV.

**Permission required:** \`reports.export\`

**Tip:** If you don't see the Export button, you may not have the \`reports.export\` permission. Ask your administrator.`,
  },
  {
    slug: 'erp-reporting-filter-by-location',
    moduleKey: 'accounting',
    route: '/accounting/statements/profit-loss',
    questionPattern:
      'filter report by location|report by department|filter by class|segment report|location report|department breakdown|filter financial report|report by site|compare locations',
    approvedAnswerMarkdown: `## Filtering Reports by Location, Department, or Class

### Financial Statements (P&L, Balance Sheet)
1. Open the report (e.g., Accounting → Statements → Profit & Loss)
2. Use the **Location** dropdown to filter to a specific site
3. Use the **Department** dropdown to filter by business unit
4. Click **Generate**

### Consolidated Reports
To compare **all locations side-by-side**:
- Go to **Accounting → Reports → Consolidated P&L**
- Each location appears as a column with a combined total

### GL Reports
- **GL Detail Report** — filter by location and/or department
- **GL Summary** — aggregated view with location filter

### Other Reports
Most reports across the system support location filtering:
- **Sales reports** — filter by location
- **Inventory** — automatically scoped to location
- **PMS Manager's Report** — property-specific
- **Spa Reports** — location-specific

### Tips
- Journal entries can be tagged with a location at posting time
- If a report doesn't show location/department filters, it may be an aggregate-only report
- Custom reports (Reports → Custom) allow building queries with location and department dimensions

**Permission required:** \`financials.view\` or \`reports.view\``,
  },
  {
    slug: 'erp-troubleshoot-reports-not-balancing',
    moduleKey: 'accounting',
    route: '/accounting/reports/trial-balance',
    questionPattern:
      'reports not balancing|financial statements don\'t balance|trial balance off|debits don\'t equal credits|balance sheet unbalanced|reports are wrong|financial data incorrect|GL out of balance',
    approvedAnswerMarkdown: `## Financial Reports Not Balancing

### First: Run a Trial Balance
1. Go to **Accounting** → **Reports** → **Trial Balance**
2. Set the date range
3. Check if total debits equal total credits
4. If they don't match, there's a posting issue

### Common Causes

1. **Failed GL postings** — Check for entries with **Failed** status in the GL. These have errors that prevented posting.
2. **One-sided journal entries** — A manual JE that somehow didn't balance (the system should prevent this, but check)
3. **Voided entries with orphaned reversals** — Rare; check that every void has its reversing counterpart
4. **Missing GL mappings** — Events that fired without a mapping won't post, creating incomplete records
5. **Closed period entries** — Entries that couldn't post because the period was closed

### How to Investigate
1. **Trial Balance** — Identifies which accounts are off
2. **GL Detail Report** — Drill into specific accounts to find the problematic entries
3. **Unmapped Events** — Check Accounting → Mappings for events without GL destinations
4. **COA Health Check** — Verify account types and classifications are correct
5. **Balance Sheet "isBalanced" flag** — The balance sheet explicitly checks A = L + E

### If You Can't Find the Issue
Contact support with the period date range and the trial balance showing the discrepancy.`,
  },
  {
    slug: 'erp-config-tax-rates',
    moduleKey: 'accounting',
    route: '/accounting/tax',
    questionPattern:
      'set up tax rates|change tax rate|configure tax|create tax rate|update tax rate|add a new tax rate|tax rate setup|sales tax configuration|modify tax rates',
    approvedAnswerMarkdown: `## Setting Up or Changing Tax Rates

### Creating a Tax Rate
1. Go to **Accounting** → **Tax**
2. Click **New Tax Rate**
3. Enter:
   - **Name** (e.g., "State Sales Tax")
   - **Rate** as a percentage (e.g., 8.25)
   - **Type** — exclusive (added on top) or inclusive (embedded in price)
4. Save

### Creating a Tax Group
Tax groups combine multiple rates (e.g., state + county + city):
1. Go to **Accounting** → **Tax** → **Tax Groups**
2. Click **New Tax Group**
3. Add the individual rates to the group
4. Assign a GL liability account for tax collected
5. Save

### Assigning to Items
1. Go to **Catalog** → find the item → **Edit**
2. Select the appropriate **Tax Group**
3. Save — the tax applies to all future sales of this item

### Important Notes
- Tax rates are **manually configured** — no automated lookup (Avalara/TaxJar)
- Changes apply to **new orders only** — existing orders are not retroactively updated
- Different locations can have different tax rates via location-specific tax groups
- The tax engine uses integer cents math to prevent rounding errors

**Permission required:** \`tax.view\` (view), \`accounting.manage\` (create/edit)`,
  },
  {
    slug: 'erp-troubleshoot-sales-tax-incorrect',
    moduleKey: 'accounting',
    route: '/accounting/tax',
    questionPattern:
      'sales tax wrong|tax calculating incorrectly|wrong tax amount|tax not right|tax calculation error|incorrect tax|overcharging tax|undercharging tax|tax rate is off',
    approvedAnswerMarkdown: `## Sales Tax Calculating Incorrectly

### Diagnostic Steps

1. **Check the item's tax group** — Go to Catalog → find the item → verify a tax group is assigned. No tax group = no tax.
2. **Check the tax rate** — Go to Accounting → Tax → verify the rate is correct for your jurisdiction
3. **Check inclusive vs. exclusive** — Inclusive tax is embedded in the price; exclusive is added on top. A mismatch here causes confusing totals.
4. **Check for tax-exempt flags** — Is the order or customer marked as tax-exempt?
5. **Check location** — Different locations may have different rates. Verify the sale location matches the expected tax jurisdiction.

### How Tax Calculation Works
- Tax is calculated **per line item**, then summed
- All math uses **integer cents** (no floating point)
- Rounding uses proportional allocation with last-rate remainder (guarantees exact totals)
- Multiple rates in a tax group are applied independently and summed

### After Fixing the Configuration
- Rate changes only affect **new orders** — existing orders keep their original tax
- To correct tax on a posted order, process a **return/void** and re-ring the sale

### Sales Tax Reports
- **Sales Tax Liability** — Accounting → Reports → Sales Tax
- **Tax Remittance Report** — Accounting → Reports → Tax Remittance (for filing)
- **Tax Rate Breakdown** — Shows tax collected by rate

**If the configuration looks correct but tax is still wrong, escalate with a specific order number.**`,
  },
  {
    slug: 'erp-howto-track-sales-tax-payable',
    moduleKey: 'accounting',
    route: '/accounting/reports/sales-tax',
    questionPattern:
      'file sales tax|track sales tax|tax payable|sales tax report|how much tax do I owe|sales tax filing|tax remittance|sales tax due|track tax collected',
    approvedAnswerMarkdown: `## Filing and Tracking Sales Tax

### Sales Tax Reports
OppsEra provides reports to help you prepare your tax filings:

1. **Sales Tax Liability Report**
   - Go to **Accounting** → **Reports** → **Sales Tax**
   - Shows total tax collected by rate and period
   - Filter by location and date range

2. **Tax Remittance Report**
   - Go to **Accounting** → **Reports** → **Tax Remittance**
   - Formatted for filing — shows taxable sales, exempt sales, and tax due by jurisdiction

3. **Tax Rate Breakdown**
   - Drill down into individual tax rates
   - Useful for jurisdictions requiring separate state/county/city reporting

### How Tax Is Tracked
- Every taxable sale auto-posts to a **Tax Payable** GL liability account (configured in tax group settings)
- The liability accumulates until you remit payment to the tax authority
- When you pay, record a journal entry: Dr Tax Payable / Cr Bank

### Export
All tax reports can be exported to CSV for your accountant or for uploading to your state's filing portal.

**Permission required:** \`tax.view\` (view reports), \`reports.export\` (CSV export)`,
  },
  {
    slug: 'erp-howto-ar-aging',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'accounts receivable aging|AR aging|aged receivables|who owes money|outstanding invoices|overdue invoices|customer balances|AR report|receivables report|how much is owed',
    approvedAnswerMarkdown: `## Managing Accounts Receivable Aging

### AR Aging Report
1. Go to **Accounting** → **Reports** → **Aged Trial Balance** (or access from the Customers → Billing section)
2. View outstanding invoices grouped by age buckets:
   - **Current** (not yet due)
   - **1–30 days** past due
   - **31–60 days** past due
   - **61–90 days** past due
   - **90+ days** past due
3. Filter by location, customer, or date range

### Customer-Level AR
- Go to **Customers** → select a customer → **Billing** tab
- View their complete AR ledger: invoices, receipts, credits, and current balance
- See aging breakdown per customer

### Taking Action on Overdue Invoices
- **Send a statement** — Generate and send a statement showing outstanding balances
- **Record a payment** — When payment is received, create an AR receipt
- **Issue a credit** — If the charge needs to be adjusted
- **Write off** — For uncollectable amounts (posts to Bad Debt Expense)

### Cash Requirements
The **Cash Requirements** report in AP shows what you owe vendors, which together with AR aging gives you a complete cash flow picture.

**Permission required:** \`ar.view\` (view), \`ar.manage\` (take action)`,
  },
  {
    slug: 'erp-howto-ap-aging',
    moduleKey: 'ap',
    route: null,
    questionPattern:
      'accounts payable aging|AP aging|what do we owe|vendor balances|outstanding bills|bills due|payable aging|AP report|who do we owe|upcoming payments',
    approvedAnswerMarkdown: `## Managing Accounts Payable Aging

### AP Aging Report
1. Go to **AP** → **Aging** (or Accounting → Reports → AP Aging)
2. View outstanding bills grouped by age:
   - **Current** (not yet due)
   - **1–30 days** past due
   - **31–60 days** past due
   - **61–90 days** past due
   - **90+ days** past due
3. Filter by vendor, location, or date range

### Open Bills
- View all open (unpaid/partially paid) bills in one list
- Sort by due date to prioritize payments

### Cash Requirements Report
- Shows upcoming payments organized by due date
- Helps you plan cash flow for vendor payments

### Taking Action
- **Pay a bill** — Create an AP payment with allocations
- **Apply a vendor credit** — Offset a credit against an open bill
- **Void a bill** — If it was entered in error

### Vendor Ledger
For vendor-specific history:
- Select a vendor → view their complete AP ledger
- See all bills, payments, credits, and current balance

**Permission required:** \`ap.view\` (view), \`ap.manage\` (take action)`,
  },
  {
    slug: 'erp-howto-write-off-bad-debt',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'write off bad debt|write off uncollectable|bad debt expense|write off an invoice|customer won\'t pay|uncollectable account|write off receivable|bad debt write off',
    approvedAnswerMarkdown: `## Writing Off a Bad Debt

### How to Write Off
Bad debt write-offs are handled through the customer billing system:

1. Go to **Customers** → find the customer → **Billing** tab
2. Record a **write-off adjustment** on the customer's account
3. The system automatically posts to the GL:
   - **Debit** Bad Debt Expense account
   - **Credit** Accounts Receivable control account

### GL Account Configuration
The Bad Debt Expense account is configurable in **Accounting Settings** (defaults to account 6030). Ensure this is set to the correct account for your chart of accounts.

### Important Notes
- Write-offs reduce the customer's AR balance
- The original invoice remains on record for audit purposes
- Both the invoice and write-off appear in the customer's AR ledger
- Write-offs are logged in the audit trail

### Partial Write-Off
You can write off a portion of the balance — the remainder stays on the customer's account.

### If the Customer Later Pays
Record a receipt as normal. The payment will reduce the customer's (now negative or zero) balance and post a recovery entry to the GL.

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'erp-howto-partial-installment-payments',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'partial payment|installment payment|payment plan|pay in installments|split invoice payment|pay over time|partial invoice payment|multiple payments on invoice',
    approvedAnswerMarkdown: `## Handling Partial and Installment Payments

### Recording a Partial Payment
1. Go to **Customers** → **Billing** → **New Receipt**
2. Select the customer
3. Enter the partial payment amount
4. **Allocate** the payment to the invoice — enter the amount being paid (less than the invoice total)
5. Post the receipt

The invoice status changes from **posted** to **partial**, and the **balance due** is updated.

### Recording Additional Payments
Repeat the process each time a payment is received:
- Create a new receipt
- Allocate to the same invoice
- The balance decreases with each payment
- When the balance reaches $0, the invoice status changes to **paid**

### Multi-Invoice Allocation
A single receipt can be split across multiple invoices:
- Enter the total payment amount
- Allocate portions to different invoices
- Each invoice updates independently

### No Scheduled Payment Plans
OppsEra does not have a formal payment plan or installment schedule feature. Partial payments are handled ad-hoc — record each payment as it comes in.

### Tracking
- The **AR Aging Report** shows outstanding balances
- Each customer's **Billing** tab shows all receipts and remaining balances

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'erp-howto-recurring-invoices-bills',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'recurring invoices|recurring bills|automatic invoices|set up recurring billing|scheduled invoice|auto-generate bills|repeated invoices|recurring charges|subscription billing',
    approvedAnswerMarkdown: `## Setting Up Recurring Invoices or Bills

### Recurring GL Journal Templates
OppsEra supports **recurring journal entry templates** for repeating GL entries:

1. Go to **Accounting** → **Recurring Templates**
2. Click **New Template**
3. Configure:
   - **Name** and description
   - **Frequency**: monthly, quarterly, or annually
   - **Day of period** (e.g., 1st of month)
   - **Start and end dates**
   - **Debit/credit lines** (must balance)
4. Save

The system auto-generates journal entries on schedule. Each generated entry is idempotent (won't duplicate if run twice for the same period).

### Important: No Recurring AR Invoices or AP Bills
The recurring template system works at the **GL journal level**, not at the AR invoice or AP bill level. This means:
- It **does not** auto-create invoices that appear on a customer's AR ledger
- It **does not** auto-create bills on a vendor's AP ledger
- It creates journal entries that post directly to GL accounts

### For Recurring Customer Billing
If you need to bill a customer on a schedule (e.g., monthly membership dues):
- The **Membership module** handles recurring membership charges
- For other recurring billing, manually create invoices each period

### For Recurring Vendor Bills
Manually create bills each period, or use **Create Bill from Receipt** when receiving recurring inventory deliveries.`,
  },
  {
    slug: 'erp-howto-fixed-assets-depreciation',
    moduleKey: 'accounting',
    route: '/accounting/fixed-assets',
    questionPattern:
      'track fixed assets|depreciation|record depreciation|fixed asset management|depreciate assets|asset tracking|add a fixed asset|asset schedule|depreciation schedule',
    approvedAnswerMarkdown: `## Tracking Fixed Assets and Depreciation

### Adding a Fixed Asset
1. Go to **Accounting** → **Fixed Assets**
2. Click **New Asset**
3. Enter:
   - **Name** and asset number
   - **Category**: building, equipment, vehicle, furniture, technology, leasehold improvement, or other
   - **Acquisition date** and **cost**
   - **Salvage value** (residual value at end of life)
   - **Useful life** in months
   - **Depreciation method**: Straight-Line, Declining Balance, or Sum of Years' Digits
   - **GL accounts**: Asset, Accumulated Depreciation, Depreciation Expense, Disposal
4. Save

### Running Depreciation
**Monthly (recommended):**
1. Go to **Accounting** → **Fixed Assets**
2. Click **Run Monthly Depreciation**
3. Select the period
4. The system calculates and posts depreciation for all active assets

**Per-asset:**
1. Open an individual asset
2. Click **Record Depreciation** for a specific period

Each depreciation entry posts: Dr Depreciation Expense / Cr Accumulated Depreciation.

### Disposing of an Asset
1. Open the asset → click **Dispose**
2. Enter disposal proceeds (sale price)
3. The system posts a 4-line GL entry handling the asset removal, accumulated depreciation, and gain/loss on disposal

### Reports
- **Depreciation Schedule** — projected future depreciation by asset
- **Asset Summary** — overview of all assets, NBV, and status

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'erp-howto-import-opening-balances',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'import opening balances|enter opening balances|historical balances|starting balances|import historical data|set up initial balances|beginning balances|migration balances|opening balance entry',
    approvedAnswerMarkdown: `## Importing Opening Balances

### No Dedicated Import Tool
OppsEra does not have a dedicated opening balance import wizard. Opening balances are entered via **manual journal entries**.

### How to Enter Opening Balances
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Set the **business date** to your go-live date (or last day of the prior period)
3. Add lines for each account with a balance:
   - **Asset accounts** — Debit the balance
   - **Liability accounts** — Credit the balance
   - **Equity accounts** — Credit the balance
   - Use **Opening Balance Equity** as the offset account to keep the entry balanced
4. Add a description: "Opening balances as of [date]"
5. Post

### Tips
- Enter all balances in a single journal entry if possible (easier to verify)
- The total debits should equal total credits
- After posting, run a **Balance Sheet** as of the go-live date to verify it matches your prior system
- For AR/AP: create individual invoices/bills to establish customer/vendor balances (opening balance JEs only affect the GL, not the subledger)

### Chart of Accounts
Import your COA first (via the **COA Import wizard** with CSV) before entering opening balances.

### Historical Transactions
There is no bulk import for historical transactions. If you need full transaction history, enter summary journal entries by period.`,
  },
  {
    slug: 'erp-integrations-sync-payroll-pos-erp',
    moduleKey: null,
    route: null,
    questionPattern:
      'sync with payroll|sync with POS|sync with ERP|data sync|POS data not in accounting|integration sync|systems not syncing|payroll not matching|POS to GL sync',
    approvedAnswerMarkdown: `## Syncing with Payroll, POS, or ERP

### POS → Accounting (Built-In)
OppsEra's POS and accounting are **fully integrated** — no sync needed:
- Every POS sale, payment, refund, and void automatically creates GL journal entries via **27 GL posting adapters**
- Card settlements, tips, drawer events all post to the GL
- Check **Accounting → Mappings** to ensure all event types have GL account assignments
- If POS data isn't appearing in accounting, check for **unmapped events** or **failed GL postings**

### Payroll
**OppsEra does not have a payroll module.** To get data to your payroll provider:
- Export **tip reports**, **commission reports**, and **sales data** to CSV
- Import the CSV into your payroll system (ADP, Gusto, Paychex, etc.)
- Record the payroll journal entry in OppsEra manually (Dr Wages Expense / Cr Bank)

### Other Modules → Accounting
All OppsEra modules automatically post to the GL:
- **Inventory** — receipts, adjustments, COGS
- **AP** — bills and payments
- **AR** — invoices and receipts
- **Spa** — commissions, package sales
- **PMS** — folio charges, deposits
- **Membership** — recurring charges, revenue recognition

### If Data Isn't Syncing
1. Check **GL posting status** — look for Failed entries
2. Check **Accounting → Mappings** for the relevant event type
3. Check **Unmapped Events** list
4. Verify the source transaction was **posted** (drafts don't create GL entries)`,
  },
  {
    slug: 'erp-troubleshoot-payroll-journal-sync',
    moduleKey: null,
    route: null,
    questionPattern:
      'payroll journal not syncing|payroll entries missing|payroll GL wrong|payroll not in accounting|payroll data not matching|payroll journal entry wrong|payroll discrepancy',
    approvedAnswerMarkdown: `## Payroll Journal Not Syncing

### Understanding Payroll in OppsEra
**OppsEra does not process payroll** and has no direct payroll integration. Payroll-related GL entries must be created manually.

### How to Record Payroll
After running payroll in your external provider (ADP, Gusto, Paychex, etc.):

1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Create entries for:
   - **Dr** Wages/Salary Expense
   - **Dr** Payroll Tax Expense (employer portion)
   - **Cr** Bank Account (net pay)
   - **Cr** Payroll Tax Payable (withholdings)
   - **Cr** Benefits Payable (if applicable)
3. Set the business date to the pay period
4. Post

### If Payroll Amounts Don't Match OppsEra Data
Common causes of discrepancy between payroll and OppsEra data:
- **Tip amounts** — Compare OppsEra tip reports against payroll tip declarations
- **Commissions** — Compare spa commission reports against payroll
- **Hours** — OppsEra does not track employee hours; verify against your time-tracking system

### Recurring Payroll Entry
Use **Accounting → Recurring Templates** to create a recurring journal template for regular payroll amounts, then adjust each period as needed.`,
  },
  {
    slug: 'erp-permissions-accounting',
    moduleKey: 'settings',
    route: '/settings',
    questionPattern:
      'accounting permissions|who can access accounting|restrict accounting access|accounting user roles|GL permissions|financial access control|who can post journal entries|accounting security',
    approvedAnswerMarkdown: `## User Permissions for Accounting

### Accounting-Related Permissions

| Permission | What It Controls |
|-----------|-----------------|
| \`accounting.view\` | View GL entries, chart of accounts |
| \`accounting.manage\` | Post journal entries, manage COA, void entries |
| \`mappings.manage\` | Configure GL mappings |
| \`period.close\` | Close accounting periods |
| \`banking.view\` | View bank accounts |
| \`banking.reconcile\` | Perform bank reconciliation |
| \`tax.view\` | View tax rates and reports |
| \`financials.view\` | View P&L, Balance Sheet, Cash Flow |
| \`revenue.view\` | View revenue reports |
| \`cogs.manage\` | Calculate and post COGS |
| \`ar.view\` / \`ar.manage\` | View/manage accounts receivable |
| \`ap.view\` / \`ap.manage\` | View/manage accounts payable |
| \`expenses.create\` / \`expenses.approve\` / \`expenses.manage\` | Expense workflow |
| \`reports.view\` / \`reports.export\` | View reports / export to CSV |
| \`audit.view\` | View audit trail |

### Role Defaults
- **Owner** — Full access to everything
- **Manager** — Most accounting features
- **Supervisor/Cashier/Server/Staff** — Typically no accounting access

### Setting Permissions
1. Go to **Settings** → **Users**
2. Assign the appropriate **role** to each user
3. Roles use predefined permission sets (no custom roles)

**Permission required:** \`users.manage\` to change roles`,
  },
  {
    slug: 'erp-howto-audit-history-v2',
    moduleKey: 'accounting',
    route: '/accounting/audit',
    questionPattern:
      'audit history|who changed a transaction|see who edited|audit trail|audit log for accounting|track changes to GL|who posted this|who voided this|transaction history',
    approvedAnswerMarkdown: `## Viewing Audit History

### Platform Audit Log
1. Go to **Accounting** → **Audit**
2. Filter by:
   - **User** — who made the change
   - **Module** — which area (accounting, AR, AP, etc.)
   - **Action type** — create, update, void, etc.
   - **Date range** — when the change occurred
3. Each entry shows: user, action, entity, timestamp, and old/new values

### What Gets Audited
Every write operation that requires audit permission is automatically logged:
- Journal entries posted and voided
- Invoices created, posted, and voided
- Receipts and payments posted and voided
- Bills created, posted, and voided
- GL account changes
- Period close operations
- Mapping changes
- Tax rate changes

### Additional Audit Trails
- **GL Tender Audit Trail** — Every payment tender and its GL posting
- **Customer Audit Trail** — Field-level change log for customer profiles
- **Tag Audit Log** — Customer tag assignments and removals
- **Item Change Log** — Catalog item modifications

### Important
- Audit entries **cannot be deleted or modified**
- The audit log includes old and new values for changed fields
- All entries include the user ID and timestamp

**Permission required:** \`audit.view\``,
  },
];

// ─── Seed Function ───────────────────────────────────────────────────────────

export async function seedTrainingDataBatch2(tenantId: string | null = null) {
  await db
    .insert(aiSupportAnswerCards)
    .values(
      TRAINING_CARDS_BATCH2.map((c) => ({
        ...c,
        tenantId,
        status: 'draft' as const,
        version: 1,
      })),
    )
    .onConflictDoNothing();

  return {
    answerCardsInserted: TRAINING_CARDS_BATCH2.length,
    message: `Inserted ${TRAINING_CARDS_BATCH2.length} answer cards as draft. Review and activate from the admin portal at /ai-assistant/answers.`,
  };
}
