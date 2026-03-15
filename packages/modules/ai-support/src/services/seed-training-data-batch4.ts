import { db, aiSupportAnswerCards } from '@oppsera/db';

// ─── Batch 4: 50 Accounting / Finance Training Answer Cards ─────────────────
// Grounded in actual OppsEra codebase features. Inserted as 'draft' for admin review.

const TRAINING_CARDS_BATCH4 = [
  {
    slug: 'acct-howto-customer-statement-open-balances',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'create customer statement|customer statement open balances|generate statement|send a statement|print statement|statement for all open balances|outstanding balance statement',
    approvedAnswerMarkdown: `## Creating a Customer Statement for All Open Balances

### How to Generate a Statement
1. Go to **Customers** → select the customer → **Billing** tab
2. The customer's AR ledger shows all invoices, receipts, credits, and the current balance
3. Use the **AR Aging Report** for a formatted view of open balances:
   - Go to **Accounting** → **Reports** → **Aged Trial Balance**
   - Filter by the specific customer
   - This shows all outstanding invoices grouped by aging buckets (Current, 1–30, 31–60, 61–90, 90+)

### Export
- Click **Export** to download a CSV of the customer's open items
- Use this as a statement to send to the customer

### Important Notes
- OppsEra does not have a dedicated "statement template" with auto-email — statements are generated from the aging report or customer ledger export
- The AR ledger includes every posted invoice, receipt, credit memo, and write-off
- Filter by date range to create a statement for a specific period

**Permission required:** \`ar.view\``,
  },
  {
    slug: 'acct-howto-manual-accrual-month-end',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'manual accrual|month-end accrual|post accrual|accrue expense|accrual journal entry|month end adjustment|accrued expense entry|post an accrual at month end',
    approvedAnswerMarkdown: `## Posting a Manual Accrual at Month-End

### Steps
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Set the **business date** to the last day of the period (e.g., March 31)
3. Add lines:
   - **Debit** the expense account (e.g., Utilities Expense)
   - **Credit** the accrued liability account (e.g., Accrued Expenses)
4. Add a description: "Month-end accrual — [description of expense]"
5. Click **Post**

### Reversing the Accrual
When the actual bill arrives next month:
1. **Void** the accrual entry (or post a reversing entry on day 1 of the next period)
2. Record the actual vendor bill in **AP** with the correct amount

### Using Recurring Templates
If you accrue the same items every month (e.g., rent, insurance):
1. Go to **Accounting** → **Recurring Templates**
2. Create a template with the accrual lines
3. Set frequency to **monthly**
4. The system auto-generates the accrual entry each period

### Important
- Accruals are standard GL journal entries — they have full audit trail
- The period must be **open** (not locked) to post into it
- Use the **Close Checklist** to track which accruals have been posted

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-recurring-journal-entry',
    moduleKey: 'accounting',
    route: '/accounting/recurring-templates',
    questionPattern:
      'recurring journal entry|set up recurring entry|recurring rent entry|recurring subscription entry|auto journal entry|scheduled journal entry|repeating journal entry|recurring GL entry',
    approvedAnswerMarkdown: `## Setting Up a Recurring Journal Entry

### Creating a Recurring Template
1. Go to **Accounting** → **Recurring Templates**
2. Click **New Template**
3. Configure:
   - **Name** — e.g., "Monthly Rent" or "Software Subscription"
   - **Frequency** — Monthly, Quarterly, or Annually
   - **Day of period** — which day to generate (e.g., 1st of each month)
   - **Start date** and optional **end date**
   - **Debit/credit lines** — must balance (e.g., Dr Rent Expense / Cr Prepaid Rent)
4. Click **Save**

### How It Works
- The system generates journal entries on schedule when recurring templates are executed
- Each generated entry is **idempotent** — running twice for the same period won't create duplicates
- Generated entries are standard GL journal entries with full audit trail

### Managing Templates
- **Edit** — change amounts, accounts, or schedule
- **Deactivate** — stop generating without deleting history
- View all templates at **Accounting** → **Recurring Templates**

### Common Use Cases
- Monthly rent or lease payments
- Software subscriptions
- Insurance amortization
- Depreciation (though the Fixed Assets module handles this automatically)
- Monthly accruals for estimated expenses

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-map-payment-type-gl',
    moduleKey: 'accounting',
    route: '/accounting/mappings',
    questionPattern:
      'map payment type to GL|payment type GL account|new payment type mapping|configure payment GL|payment tender GL mapping|map tender to account|payment type GL setup',
    approvedAnswerMarkdown: `## Mapping a New Payment Type to the Correct GL Account

### How GL Mappings Work for Payment Types
Every payment tender (cash, credit card, gift card, etc.) needs GL account assignments so that POS transactions post correctly to the general ledger.

### Setting Up a Payment Type Mapping
1. Go to **Accounting** → **Mappings** → **Payment Types**
2. Find the payment type or click **New Mapping**
3. Assign GL accounts:
   - **Cash Account** — where the money lands (e.g., Cash on Hand, Merchant Clearing)
   - **Clearing Account** — for settlement timing differences (e.g., Credit Card Clearing)
   - **Fee Account** — for processing fees (e.g., Merchant Fee Expense)
4. Save

### Common Mappings
| Tender | Cash Account | Clearing | Fee |
|--------|-------------|----------|-----|
| Cash | Cash on Hand | — | — |
| Credit Card | Merchant Clearing | CC Clearing | Merchant Fees |
| Gift Card | Gift Card Liability | — | — |
| House Account | Accounts Receivable | — | — |

### What Happens If a Tender Is Unmapped
- The POS transaction still processes (business ops never fail)
- The GL posting is skipped and an **unmapped event** is created
- Check **Accounting** → **Unmapped Events** to find and fix missing mappings
- Once mapped, use **Backfill GL from Tenders** to retroactively post

**Permission required:** \`mappings.manage\``,
  },
  {
    slug: 'acct-troubleshoot-trial-balance-out-of-balance',
    moduleKey: 'accounting',
    route: '/accounting/reports/trial-balance',
    questionPattern:
      'trial balance out of balance|trial balance not balancing|trial balance wrong|debits not equal credits|trial balance discrepancy|TB out of balance|unbalanced trial balance',
    approvedAnswerMarkdown: `## Trial Balance Out of Balance

### Understanding the Issue
A trial balance should always have total debits equal to total credits. If it doesn't, there's an issue with the underlying journal entries.

### Diagnostic Steps

1. **Check for unposted draft entries** — Draft journal entries don't affect the GL but may cause confusion if you're looking at a mixed view
2. **Run the Subledger Reconciliation** — Go to **Accounting** → **Reports** → **Reconcile Subledger** to compare AR, AP, and other control accounts against their subledgers
3. **Check for voided entries** — Ensure all voids created proper reversing entries
4. **Review recent journal entries** — Go to **Accounting** → **Journals** and sort by most recent. Look for entries where debits ≠ credits (the system validates this, but check anyway)
5. **Check GL posting gaps** — Go to **Accounting** → **GL Posting Gaps** to find failed or skipped GL postings

### Common Causes
- **Opening balance entry** that doesn't balance (especially during initial setup)
- **Manual journal entry** with a data issue
- **Failed GL posting adapter** that created a partial entry

### Resolution
- If a specific entry is unbalanced, void it and re-enter correctly
- If the issue stems from opening balances, create a correcting journal entry using Opening Balance Equity as the offset

**Permission required:** \`accounting.view\`, \`accounting.manage\` (to fix)`,
  },
  {
    slug: 'acct-howto-aged-receivables-by-location',
    moduleKey: 'ar',
    route: '/accounting/reports/aged-trial-balance',
    questionPattern:
      'aged receivables by location|AR aging by location|receivables report by location|customer aging per location|outstanding invoices by location|location AR report',
    approvedAnswerMarkdown: `## Running an Aged Receivables Report by Location

### Steps
1. Go to **Accounting** → **Reports** → **Aged Trial Balance**
2. Set the report type to **Receivables** (or filter to AR control accounts)
3. Use the **Location** filter to select a specific location
4. The report shows outstanding invoices grouped by aging buckets:
   - **Current** (not yet due)
   - **1–30 days** past due
   - **31–60 days** past due
   - **61–90 days** past due
   - **90+ days** past due

### Alternative: AR Aging Query
- The AR module's \`getArAging\` query supports filtering by location
- Access from **Customers** → **Billing** and filter by location

### Export
- Click **Export** to download the data as CSV
- Useful for location managers who need their own aging review

### Multi-Location View
- Remove the location filter to see all locations combined
- Use the **Consolidated P&L** report for a multi-location financial overview

**Permission required:** \`ar.view\``,
  },
  {
    slug: 'acct-howto-aged-payables-by-vendor',
    moduleKey: 'ap',
    route: '/accounting/reports/ap-aging',
    questionPattern:
      'aged payables by vendor|AP aging by vendor|vendor aging report|outstanding bills by vendor|payables report by vendor|what do we owe each vendor',
    approvedAnswerMarkdown: `## Running an Aged Payables Report by Vendor

### Steps
1. Go to **AP** → **Aging** (or **Accounting** → **Reports** → **AP Aging**)
2. View outstanding bills grouped by aging buckets:
   - **Current** (not yet due)
   - **1–30 days** past due
   - **31–60 days** past due
   - **61–90 days** past due
   - **90+ days** past due
3. Filter by **vendor** to see a specific vendor's outstanding bills
4. Filter by **location** or **date range** for more detail

### Vendor Ledger
For a complete history with one vendor:
- Go to the vendor's profile → **Ledger** tab
- View all bills, payments, credits, and the current balance

### Cash Requirements
- The **Cash Requirements** report shows upcoming payments organized by due date
- Helps prioritize which vendors to pay first based on due dates and payment terms

### Export
- All AP reports can be exported to CSV for your accountant

**Permission required:** \`ap.view\``,
  },
  {
    slug: 'acct-howto-post-nsf-bounced-payment',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'NSF payment|bounced check|bounced payment|returned check|post NSF|record bounced check|NSF fee|insufficient funds|dishonored payment|returned payment',
    approvedAnswerMarkdown: `## Posting an NSF or Bounced Payment

### Steps
1. **Void the original receipt** — Go to **Customers** → **Billing** → find the receipt → click **Void**
   - This reverses the GL entry (Dr Accounts Receivable / Cr Bank)
   - The customer's invoices revert to their prior status (posted/partial)

2. **Record the NSF fee** (if applicable):
   - Go to **Accounting** → **Journals** → **New Journal Entry**
   - Debit the customer's AR (or a separate NSF Receivable account)
   - Credit Bank Fees Income (or NSF Fee Revenue)
   - Alternatively, create a new invoice for the fee amount

3. **Notify the customer** — Their balance has increased by the original payment amount plus any NSF fee

### Important Notes
- Voiding the receipt automatically re-opens the original invoices
- The void creates a reversing GL entry with full audit trail
- If you charged an NSF fee, consider creating a dedicated invoice so it appears on the customer's statement
- Bank fees charged to *you* by your bank should be recorded as a separate expense (Dr Bank Fees Expense / Cr Bank)

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'acct-howto-move-payment-wrong-customer',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'move payment to different customer|payment applied to wrong customer|transfer payment between customers|wrong customer payment|reassign payment|misapplied payment|payment on wrong account',
    approvedAnswerMarkdown: `## Moving a Payment Applied to the Wrong Customer

### Steps
1. **Void the incorrect receipt** — Go to **Customers** → **Billing** → find the receipt on the wrong customer → click **Void**
   - This reverses the GL entry and re-opens the invoices it was allocated to
2. **Create a new receipt** on the correct customer:
   - Go to the correct customer → **Billing** → **New Receipt**
   - Enter the same payment amount and date
   - Allocate to the correct invoice(s)
   - Post

### Important Notes
- Always void and re-enter — do not try to manually adjust with journal entries, as this won't update the AR subledger correctly
- The void + new receipt creates a clean audit trail showing exactly what happened
- Add a note on both transactions referencing the correction

### If the Receipt Was Already Reconciled
- You may need to **reopen the bank reconciliation** first (if one was completed covering this period)
- Void the receipt, then create the new one
- Re-reconcile the period

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'acct-howto-write-off-small-balance',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'write off small balance|write off old invoice|small balance write off|clear small balance|write off remaining balance|minor balance adjustment|write off pennies|write off cents',
    approvedAnswerMarkdown: `## Writing Off a Small Balance on an Old Invoice

### Steps
1. Go to **Customers** → find the customer → **Billing** tab
2. Record a **write-off adjustment** for the remaining balance
3. The system posts to GL:
   - **Debit** Bad Debt Expense (or a Small Balance Write-Off account)
   - **Credit** Accounts Receivable

### Alternative: Journal Entry Approach
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Debit a write-off expense account
3. Credit Accounts Receivable
4. Post — note this updates the GL but not the AR subledger invoice status

### Best Practice
- Use the customer billing write-off (not a manual JE) so the invoice status updates to reflect the write-off
- Keep a threshold policy (e.g., write off balances under $5.00 at month-end)
- Review the **AR Aging Report** filtered to balances under your threshold to find candidates

### GL Account Setup
Configure the write-off expense account in **Accounting Settings** (default is Bad Debt Expense). For small balance write-offs specifically, some businesses create a separate "Small Balance Adjustments" expense account.

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'acct-howto-create-finance-charge',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'create finance charge|late fee|add finance charge|charge interest|late payment fee|overdue fee|interest on overdue|finance charge invoice|add late fee to invoice',
    approvedAnswerMarkdown: `## Creating a Finance Charge or Late Fee

### How to Add a Finance Charge
OppsEra does not auto-calculate finance charges. To charge a late fee:

1. Go to **Customers** → find the customer → **Billing** tab
2. Click **New Invoice**
3. Add a line item:
   - **Description**: "Finance charge — Invoice #[original invoice number]"
   - **GL Account**: Finance Charge Revenue (or Interest Income)
   - **Amount**: the calculated fee
   - **Tax Group**: typically non-taxable
4. Post the invoice

### Calculating the Fee
Common approaches:
- **Flat fee** — e.g., $25.00 late fee
- **Percentage** — e.g., 1.5% per month on the overdue balance
- **Tiered** — different rates based on aging bucket

### Tracking
- The finance charge invoice appears on the customer's AR ledger
- It ages like any other invoice
- The **AR Aging Report** shows the original invoice and the finance charge separately

### Important
- Check your local regulations — some jurisdictions require advance notice before charging late fees
- Document your late fee policy and communicate it to customers in advance

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'acct-howto-reopen-reconciliation',
    moduleKey: 'accounting',
    route: '/accounting/bank-reconciliations',
    questionPattern:
      'reopen reconciliation|undo reconciliation|completed reconciliation by mistake|reverse bank reconciliation|fix completed reconciliation|reopen bank rec|bank reconciliation error',
    approvedAnswerMarkdown: `## Reopening a Completed Bank Reconciliation

### How to Reopen
1. Go to **Accounting** → **Bank Reconciliations**
2. Find the completed reconciliation
3. Click **Reopen** (changes status from completed back to in-progress)
4. Make corrections:
   - Clear or unclear items
   - Add missing adjustments (bank fees, interest, etc.)
   - Fix the ending balance
5. **Complete** the reconciliation again when finished

### What Reopening Does
- Changes the reconciliation status back to **in-progress**
- All cleared items remain marked as cleared (you can change them)
- No GL entries are reversed — the reconciliation is a tracking tool, not a posting tool

### Important Notes
- Reopening does **not** affect GL balances — bank reconciliation is a verification process
- If the error involves a transaction that was posted incorrectly, void and re-enter the transaction separately from the reconciliation
- After fixing, the reconciliation should show the bank's ending balance matching the adjusted GL balance

### Prevention
- Always verify the ending statement balance before completing a reconciliation
- Review the **outstanding items** list before completing — these should genuinely be items that haven't cleared the bank

**Permission required:** \`banking.reconcile\``,
  },
  {
    slug: 'acct-troubleshoot-settlement-not-matching',
    moduleKey: 'accounting',
    route: '/accounting/settlements',
    questionPattern:
      'settlement not matching|settlement mismatch|card totals don\'t match|settlement discrepancy|processor settlement wrong|card settlement off|batch settlement difference|settlement variance',
    approvedAnswerMarkdown: `## Settlement Not Matching Card Totals

### Understanding Settlements
A settlement is the deposit from your card processor. It should match your recorded card transactions minus processing fees.

### Diagnostic Steps
1. Go to **Accounting** → **Settlements** → find the settlement
2. Click **Match Tenders** to see which POS transactions are matched
3. Check for **unmatched tenders** — these are card transactions in OppsEra that didn't match the settlement

### Common Causes of Mismatch
- **Processing fees** — The processor deducts fees before depositing. Check if fees are accounted for.
- **Timing differences** — Transactions near midnight may fall into the next batch
- **Refunds** — Card refunds reduce the settlement amount
- **Chargebacks** — Disputed charges are deducted from settlements
- **Tips** — Adjusted tips (tip adjustments after authorization) can cause differences
- **Voided transactions** — A void after batch close may not be in the same settlement

### Resolution
1. Compare the settlement detail from your processor against OppsEra's matched tenders
2. Identify the specific transactions causing the difference
3. Use **Smart Resolution Suggestions** to auto-match common discrepancies
4. For remaining differences, post an adjustment entry

### Reports
- **Unmatched Tenders** report shows transactions not yet matched to a settlement
- **Tender Audit Trail** shows the full history of each payment

**Permission required:** \`banking.reconcile\``,
  },
  {
    slug: 'acct-howto-review-unreconciled-deposits',
    moduleKey: 'accounting',
    route: '/accounting/bank-reconciliations',
    questionPattern:
      'unreconciled deposits|review unreconciled deposits|outstanding deposits|deposits not cleared|deposits in transit|bank deposits not reconciled|missing deposits',
    approvedAnswerMarkdown: `## Reviewing Unreconciled Deposits

### Finding Outstanding Deposits
1. Go to **Accounting** → **Bank Reconciliations**
2. Open the current (in-progress) reconciliation for the bank account
3. Review the **Outstanding Deposits** section — these are deposits recorded in OppsEra but not yet cleared by the bank

### Alternative Views
- **Deposit Slips** — Go to **Accounting** → **Deposit Slips** to see prepared, deposited, and reconciled deposit slips
- **Cash Management Dashboard** — Shows open drawers, pending deposits, and cash balances
- **Daily Reconciliation** — Review daily deposit totals against bank activity

### Common Reasons for Unreconciled Deposits
- **Deposit in transit** — recorded in OppsEra but bank hasn't processed yet (normal for 1–2 business days)
- **Missing deposit** — cash was recorded but never physically deposited — investigate immediately
- **Amount mismatch** — the bank shows a different amount than OppsEra (partial deposit, error, etc.)
- **Wrong date** — the deposit posted to the bank on a different date than expected

### Resolution
- Deposits in transit are normal — they'll clear in the next bank statement
- For discrepancies, compare the deposit slip details against the bank statement line by line
- Record adjustments in the bank reconciliation if needed

**Permission required:** \`banking.reconcile\``,
  },
  {
    slug: 'acct-howto-retained-earnings-year-end',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'retained earnings|year-end close|close the year|year end closing entry|retained earnings setup|annual close|close fiscal year|year-end retained earnings|roll forward retained earnings',
    approvedAnswerMarkdown: `## Setting Up Retained Earnings for Year-End Close

### How Year-End Close Works
At year-end, all revenue and expense accounts are closed to zero, and the net income (or loss) is transferred to the Retained Earnings equity account.

### Steps
1. Go to **Accounting** → **Period Close** or use the **Close Orchestrator**
2. The system supports a **Generate Retained Earnings** command that:
   - Calculates net income (total revenue minus total expenses for the fiscal year)
   - Creates a journal entry:
     - **Debit** each revenue account (zeroing it out)
     - **Credit** each expense account (zeroing it out)
     - **Credit** (or debit) Retained Earnings for the net income (or loss)
3. Post the closing entry

### GL Account Setup
Ensure you have a **Retained Earnings** account in your Chart of Accounts:
- Account type: **Equity**
- This is typically set up during COA bootstrap (account 3200 in the default template)

### Important Notes
- Close all 12 monthly periods before running year-end close
- Run all month-end procedures first (accruals, depreciation, COGS, etc.)
- The closing entry is a standard journal entry — it can be voided if needed
- Revenue and expense accounts start at zero in the new fiscal year

### Checklist
Use the **Close Checklist** to ensure all steps are completed before closing the year.

**Permission required:** \`period.close\`, \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-create-budget-by-department',
    moduleKey: 'accounting',
    route: '/accounting/budgets',
    questionPattern:
      'create budget|budget by department|set up a budget|department budget|new budget|departmental budget|budget setup|create a budget for each department',
    approvedAnswerMarkdown: `## Creating a Budget for Each Department

### Steps
1. Go to **Accounting** → **Budgets**
2. Click **New Budget**
3. Configure:
   - **Name** — e.g., "2026 Annual Budget — Food & Beverage"
   - **Fiscal year** and period type (monthly/quarterly)
   - **Location** (optional — for location-specific budgets)
4. Save the budget (created in **draft** status)
5. Click **Edit Budget Lines** to enter amounts:
   - Each line corresponds to a GL account
   - Enter planned amounts per period (monthly or quarterly)
   - You can budget revenue accounts and expense accounts
6. Save

### Budget Workflow
- **Draft** — editable, in progress
- **Approved** — reviewed and approved, still editable by authorized users
- **Locked** — frozen, no further changes allowed

### Department Budgets
To create per-department budgets:
- Create a separate budget for each department
- Filter GL accounts by department classification when adding budget lines
- Or create one company-wide budget with all departments' accounts

### Comparing Budget to Actuals
Once a budget is approved:
- Go to **Accounting** → **Reports** → **Budget vs. Actual**
- Select the budget
- View variance analysis showing planned vs. actual amounts and percentage differences

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-budget-vs-actual',
    moduleKey: 'accounting',
    route: '/accounting/reports/budget-vs-actual',
    questionPattern:
      'compare budget to actual|budget vs actual|budget variance|actuals against budget|how are we doing against budget|over budget|under budget|budget comparison|monthly budget review',
    approvedAnswerMarkdown: `## Comparing Actuals to Budget

### Running the Budget vs. Actual Report
1. Go to **Accounting** → **Reports** → **Budget vs. Actual**
2. Select the **budget** to compare against
3. Choose the **period** (month, quarter, or year-to-date)
4. The report shows:
   - **Budget** — planned amount per account
   - **Actual** — GL balance for the period
   - **Variance ($)** — difference (favorable or unfavorable)
   - **Variance (%)** — percentage deviation

### Reading the Report
- **Revenue accounts** — actual > budget = favorable (positive variance)
- **Expense accounts** — actual < budget = favorable (positive variance)
- Large unfavorable variances are flagged for attention

### Drilling Down
- Click on any account to see the GL detail — individual journal entries that make up the actual balance
- This helps identify *why* actuals differ from the budget

### Period Comparison Alternative
For a non-budget comparison (e.g., this month vs. last month, or this year vs. last year):
- Use **Accounting** → **Reports** → **Period Comparison**
- Compare any two date ranges side by side

### Export
All budget reports can be exported to CSV.

**Permission required:** \`financials.view\``,
  },
  {
    slug: 'acct-howto-post-depreciation',
    moduleKey: 'accounting',
    route: '/accounting/fixed-assets',
    questionPattern:
      'post depreciation|record depreciation|run depreciation|depreciation entry|monthly depreciation|book depreciation|depreciate this month|depreciation journal entry',
    approvedAnswerMarkdown: `## Posting Depreciation for Fixed Assets

### Monthly Depreciation (All Assets)
1. Go to **Accounting** → **Fixed Assets**
2. Click **Run Monthly Depreciation**
3. Select the **period** (month/year)
4. Review the calculated amounts — the system uses each asset's configured method (Straight-Line, Declining Balance, or Sum of Years' Digits)
5. Confirm to post

### What Gets Posted
For each active asset, the system creates a journal entry:
- **Debit** Depreciation Expense (per the asset's configured expense account)
- **Credit** Accumulated Depreciation (per the asset's configured accum. depreciation account)

### Single Asset Depreciation
To depreciate one asset at a time:
1. Open the individual asset
2. Click **Record Depreciation**
3. Select the period and confirm

### Depreciation Methods Supported
- **Straight-Line** — equal amounts over useful life
- **Declining Balance** — accelerated, higher early depreciation
- **Sum of Years' Digits** — accelerated, based on remaining life fraction

### Reports
- **Depreciation Schedule** — projected future depreciation by asset and period
- **Asset Summary** — current net book value, accumulated depreciation, and status for all assets

### Important
- Depreciation is **idempotent** — running it twice for the same period won't create duplicates
- The period must be **open** to post depreciation

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-add-new-fixed-asset',
    moduleKey: 'accounting',
    route: '/accounting/fixed-assets',
    questionPattern:
      'add fixed asset|new fixed asset|create fixed asset|register an asset|enter a fixed asset|add equipment|add a new asset|start depreciating an asset',
    approvedAnswerMarkdown: `## Adding a New Fixed Asset and Starting Depreciation

### Steps
1. Go to **Accounting** → **Fixed Assets**
2. Click **New Asset**
3. Enter details:
   - **Name** — descriptive name (e.g., "Commercial Oven — Kitchen")
   - **Asset number** — your internal tracking number
   - **Category** — building, equipment, vehicle, furniture, technology, leasehold improvement, or other
   - **Acquisition date** — when purchased
   - **Acquisition cost** — purchase price
   - **Salvage value** — estimated residual value at end of useful life
   - **Useful life** — in months (e.g., 60 months for 5 years)
   - **Depreciation method** — Straight-Line, Declining Balance, or Sum of Years' Digits
4. Assign GL accounts:
   - **Asset account** (e.g., Equipment)
   - **Accumulated Depreciation account**
   - **Depreciation Expense account**
   - **Disposal account** (for gains/losses on disposal)
5. Save

### Recording the Purchase
If the asset was purchased via AP:
- Create a vendor bill with line type **asset** — this records the purchase and can be linked to the fixed asset record
- Alternatively, post a manual journal entry: Dr Asset / Cr Bank or AP

### Starting Depreciation
- Depreciation begins when you run **Monthly Depreciation** for a period after the acquisition date
- The first month's depreciation is typically prorated based on the acquisition date

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-retire-dispose-fixed-asset',
    moduleKey: 'accounting',
    route: '/accounting/fixed-assets',
    questionPattern:
      'retire fixed asset|dispose asset|sell fixed asset|write off asset|remove asset|dispose of equipment|asset disposal|get rid of asset|fixed asset disposal',
    approvedAnswerMarkdown: `## Retiring or Disposing of a Fixed Asset

### Steps
1. Go to **Accounting** → **Fixed Assets**
2. Find and open the asset
3. Click **Dispose**
4. Enter:
   - **Disposal date**
   - **Disposal proceeds** — the sale price (enter $0 if scrapped)
5. Confirm

### What the System Posts
The disposal creates a 4-line GL journal entry:
1. **Debit** Accumulated Depreciation (removes the accum. depreciation balance)
2. **Credit** Asset account (removes the asset from the books)
3. **Debit or Credit** Disposal/Gain-Loss account:
   - If proceeds > net book value → **Gain on Disposal** (credit)
   - If proceeds < net book value → **Loss on Disposal** (debit)
4. **Debit** Bank/Cash (for the proceeds, if any)

### Before Disposing
- Ensure depreciation is current through the disposal date
- Run depreciation for the final partial month if needed

### Asset Status
After disposal, the asset status changes to **disposed** and no further depreciation is calculated.

### Important Notes
- The asset record is preserved for historical reference — it is not deleted
- The disposal entry has a full audit trail
- If the asset was fully depreciated (NBV = $0) and scrapped, the entry just removes the cost and accumulated depreciation with no gain/loss

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-correct-wrong-department-posting',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'wrong department posting|sales posted to wrong department|correct department|reclassify revenue|move revenue to different department|department posting error|fix department code',
    approvedAnswerMarkdown: `## Correcting Sales That Posted to the Wrong Department

### Understanding Department Postings
Revenue posts to GL accounts based on **sub-department GL mappings**. If revenue landed in the wrong department, the mapping may be incorrect or the item may be assigned to the wrong sub-department.

### Correcting with a Reclassification Entry
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Create a reclassification entry:
   - **Debit** the incorrect revenue account (reduces it)
   - **Credit** the correct revenue account (increases it)
3. Set the business date to the original transaction date (if the period is still open)
4. Add a description: "Reclassify revenue from [wrong dept] to [correct dept] — [reason]"
5. Post

### Fixing the Root Cause
To prevent future mis-postings:
1. Go to **Accounting** → **Mappings** → **Sub-Departments**
2. Find the sub-department for the affected items
3. Update the **revenue GL account** to the correct department account
4. Save — future sales of items in this sub-department will post correctly

### Checking Item Assignments
If the item itself is in the wrong sub-department:
1. Go to **Catalog** → find the item → **Edit**
2. Change the **sub-department** assignment
3. Save — this affects future sales only

**Permission required:** \`accounting.manage\`, \`mappings.manage\``,
  },
  {
    slug: 'acct-howto-split-revenue-across-departments',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'split revenue across departments|revenue split|allocate revenue multiple departments|divide revenue|revenue allocation|split one transaction across departments|multi-department revenue',
    approvedAnswerMarkdown: `## Splitting Revenue from One Transaction Across Multiple Departments

### How Revenue Posting Works
In OppsEra, each line item on an order posts to the GL account configured for its sub-department. If a single order has items from different sub-departments, they automatically post to different revenue accounts.

### If Items Are Already in Correct Sub-Departments
No action needed — the GL posting adapters handle this automatically. A single order with a food item and a beverage item will post food revenue and beverage revenue to their respective accounts.

### If You Need to Reclassify After the Fact
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Create a reclassification entry:
   - **Debit** the original revenue account for the portion to move
   - **Credit** the target department's revenue account for that same amount
3. Post with an appropriate description

### For Bundled or Package Items
If a single line item (e.g., a package or bundle) needs to split across departments:
- Configure the package's sub-department mapping to the primary revenue account
- Use a month-end reclassification journal entry to split the portion to other departments
- Or consider breaking the package into separate line items at the catalog level

### Best Practice
Design your catalog with correct sub-department assignments from the start — this eliminates the need for manual reclassifications.

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-troubleshoot-gratuity-wrong-account',
    moduleKey: 'accounting',
    route: '/accounting/mappings',
    questionPattern:
      'gratuity wrong account|tips posting to wrong account|gratuity liability account|tip GL account|tips not posting correctly|gratuity posting error|tip account wrong',
    approvedAnswerMarkdown: `## Gratuity Posting to the Wrong Liability Account

### How Tips Post to the GL
Tips are handled by the **F&B Tip Pool Posting Adapter** and the **POS Posting Adapter**. When a tip is recorded:
- **Debit** the payment tender account (e.g., Credit Card Clearing)
- **Credit** Tips Payable liability account

### Checking the Mapping
1. Go to **Accounting** → **Mappings**
2. Check the **Payment Type** mappings — tips may use the fee or clearing account from the tender configuration
3. Review **Accounting Settings** for the default tip payable GL account

### Common Causes
- **Tip payable account not configured** — Check Accounting Settings for the default tips payable account
- **Wrong account selected** — The mapping points to the wrong liability account
- **Multiple tip types** — Credit card tips, cash tips, and tip pool distributions may use different accounts

### Fixing the Mapping
1. Update the GL account in the payment type mapping or accounting settings
2. For transactions already posted to the wrong account:
   - Create a reclassification journal entry:
     - **Debit** the incorrect liability account
     - **Credit** the correct liability account
   - Or use **Remap GL for Tender** to batch-correct historical postings

### Tip Reports
- **Tip Balances** — Shows accrued tip liabilities
- **Tip Payouts** — Shows tips paid out to employees

**Permission required:** \`mappings.manage\`, \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-journal-entries-for-order',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'journal entries for an order|GL entries for a payment|trace order to GL|find journal entry for order|see accounting for an order|order GL posting|what GL entries did this order create',
    approvedAnswerMarkdown: `## Reviewing Every Journal Entry Tied to One Order or Payment

### Using the GL Detail Report
1. Go to **Accounting** → **Reports** → **GL Detail Report**
2. Use the **source reference** or **idempotency key** to search — journal entries created by POS adapters include the order ID or payment ID in the source field
3. All related debits and credits appear in the report

### Using the Tender Audit Trail
1. Go to **Accounting** → **Tender Audit Trail**
2. Search by order number or payment reference
3. View the complete chain: tender → settlement → GL posting

### How GL Entries Are Created from Orders
Each order event generates GL entries through posting adapters:
- **Order placed** → Revenue + COGS entries (via POS Posting Adapter)
- **Payment tendered** → Cash/clearing entries (via POS Posting Adapter)
- **Tips** → Tip liability entries (via F&B Tip Pool Adapter)
- **Voids** → Reversing entries (via Void Posting Adapter)
- **Returns** → Return/refund entries (via Return Posting Adapter)
- **Discounts/comps** → Discount/comp entries (via Comp/Void Adapter)

### Checking for Missing GL Entries
If an order didn't generate GL entries:
- Check **Accounting** → **Unmapped Events** — the event type may not have a GL mapping
- Check **GL Posting Gaps** for failed postings

**Permission required:** \`accounting.view\`, \`audit.view\``,
  },
  {
    slug: 'acct-howto-see-who-posted-entry',
    moduleKey: 'accounting',
    route: '/accounting/audit',
    questionPattern:
      'who posted this entry|who made this journal entry|see which user posted|who created this GL entry|accounting entry author|who voided this|journal entry audit trail|who posted this transaction',
    approvedAnswerMarkdown: `## Seeing Which User Posted an Accounting Entry

### On the Journal Entry
1. Go to **Accounting** → **Journals**
2. Open the specific journal entry
3. The entry shows:
   - **Created by** — the user who created the entry
   - **Created at** — timestamp
   - **Source** — whether it was manual, auto-posted by an adapter, or generated by a recurring template

### Using the Audit Log
1. Go to **Accounting** → **Audit**
2. Filter by:
   - **Module**: Accounting
   - **Action**: create, post, void, etc.
   - **Date range**
3. Each audit entry shows the **user**, **action**, **entity**, and **timestamp**

### For Auto-Posted Entries
Entries created by GL posting adapters (from POS sales, payments, etc.) are attributed to the **system** rather than a specific user. To trace who initiated the original transaction:
- Check the source order or payment for the user who rang it up
- The POS audit trail shows who processed each sale

### Important
- All audit entries are **immutable** — they cannot be edited or deleted
- The audit log captures both the user ID and the full action details

**Permission required:** \`audit.view\``,
  },
  {
    slug: 'acct-howto-export-gl-detail-report',
    moduleKey: 'accounting',
    route: '/accounting/reports/gl-detail',
    questionPattern:
      'export GL detail|export general ledger|download GL report|GL detail CSV|export ledger report|general ledger export|download journal entries|export GL to CSV',
    approvedAnswerMarkdown: `## Exporting a General Ledger Detail Report

### Steps
1. Go to **Accounting** → **Reports** → **GL Detail Report**
2. Set your filters:
   - **Date range** — the period you want to export
   - **Account(s)** — specific GL accounts or all accounts
   - **Location** — filter by location if needed
3. Click **Export** to download as CSV

### What's Included
The GL Detail Report contains:
- Journal entry number
- Business date
- GL account number and name
- Debit and credit amounts
- Description/memo
- Source reference (order, invoice, bill, etc.)
- Location (if applicable)

### Other Exportable Reports
All financial reports support CSV export:
- **Trial Balance** — account balances for a period
- **P&L** — revenue and expenses
- **Balance Sheet** — assets, liabilities, equity
- **AR Aging** / **AP Aging** — outstanding receivables/payables
- **Budget vs. Actual** — variance analysis

### For Your Accountant
The GL Detail Report CSV is the most common export for external accountants. It provides transaction-level detail that can be imported into their accounting software for review.

**Permission required:** \`reports.export\``,
  },
  {
    slug: 'acct-howto-balance-sheet-one-location',
    moduleKey: 'accounting',
    route: '/accounting/reports/balance-sheet',
    questionPattern:
      'balance sheet one location|balance sheet by location|single location balance sheet|location-specific balance sheet|balance sheet for a store|location financial statement',
    approvedAnswerMarkdown: `## Generating a Balance Sheet for Only One Location

### Steps
1. Go to **Accounting** → **Reports** → **Balance Sheet**
2. Select the **date** (balance sheet is a point-in-time report)
3. Use the **Location** filter to select the specific location
4. The report shows assets, liabilities, and equity for that location only

### Important Notes
- The balance sheet filters journal entry lines by location
- Some accounts (e.g., corporate equity, shared liabilities) may not have a location tag — these won't appear in a location-filtered view
- For a complete picture, compare the location-specific balance sheet against the consolidated (all-locations) version

### Consolidated View
- Remove the location filter to see all locations combined
- Use the **Consolidated P&L** report for a multi-location income statement comparison

### Multi-Location Balance Sheet
The GL journal lines support **location** as a dimension. When posting entries, ensure the location is set correctly so that location-level reporting is accurate.

### Export
Click **Export** to download the location-specific balance sheet as CSV.

**Permission required:** \`financials.view\``,
  },
  {
    slug: 'acct-howto-daily-cash-over-short',
    moduleKey: 'accounting',
    route: '/accounting/cash-management',
    questionPattern:
      'cash over short|cash overage|cash shortage|register over short|drawer over short|daily cash count|cash variance|cash discrepancy by register|register cash difference',
    approvedAnswerMarkdown: `## Seeing Daily Cash Over/Short by Register

### Using the Cash Management Dashboard
1. Go to **Accounting** → **Cash Management**
2. The dashboard shows:
   - Open drawers and their current balances
   - Pending deposits
   - Cash position summary

### Drawer Close Reports
When a drawer session is closed:
- The system records the expected cash amount (based on cash tenders) vs. the actual counted amount
- The difference is the **cash over/short**
- The **Drawer Close Posting Adapter** creates a GL entry for any variance:
  - **Over**: Cr Cash Over/Short (income)
  - **Short**: Dr Cash Over/Short (expense)

### Daily Reconciliation
1. Go to **Accounting** → **Daily Reconciliation**
2. Select the date and location
3. View the reconciliation of expected vs. actual deposits by tender type
4. Cash variances are highlighted

### Reports
- **Operations Summary** — high-level view of daily cash activity
- **Tender Audit Trail** — trace individual cash transactions
- **Deposit Slips** — track physical cash deposits to the bank

### Investigating Shortages
- Review the drawer session details for the specific register
- Check for voided transactions or returns that may explain the difference
- Compare against security footage if necessary

**Permission required:** \`banking.view\`, \`accounting.view\``,
  },
  {
    slug: 'acct-howto-accrue-payroll-liabilities',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'accrue payroll|payroll accrual|accrue wages|payroll liability accrual|accrue payroll liabilities|record payroll accrual|payroll is external how to accrue|estimated payroll entry',
    approvedAnswerMarkdown: `## Accruing Payroll-Related Liabilities (External Payroll)

### Why Accrue
Since OppsEra doesn't have a payroll module, you should accrue payroll liabilities at month-end so your financial statements accurately reflect expenses incurred but not yet paid.

### Creating the Accrual Entry
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Set the business date to the **last day of the month**
3. Add lines for each payroll component:
   - **Dr** Wages & Salary Expense / **Cr** Accrued Wages Payable
   - **Dr** Payroll Tax Expense (employer FICA, FUTA, SUTA) / **Cr** Payroll Taxes Payable
   - **Dr** Benefits Expense (health, 401k match) / **Cr** Accrued Benefits Payable
4. Use estimated amounts based on:
   - Prior pay period actuals
   - OppsEra tip reports and commission reports for tipped/commissioned employees
5. Post

### Reversing When Payroll Runs
When actual payroll processes in the next period:
1. Void the accrual entry (or post a reversing entry on day 1)
2. Record the actual payroll journal entry with exact amounts from your payroll provider

### Recurring Template
Set up a **Recurring Template** for the standard accrual amount:
- Go to **Accounting** → **Recurring Templates**
- Create a monthly template with the estimated payroll lines
- Adjust as needed each month

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-clear-unapplied-credits',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'clear unapplied credits|unapplied credit|customer credit balance|apply credit to invoice|customer overpayment|credit on account|use customer credit|apply open credit',
    approvedAnswerMarkdown: `## Clearing Old Unapplied Credits on Customer Accounts

### Understanding Unapplied Credits
An unapplied credit exists when a customer payment (receipt) exceeds the amount allocated to invoices. The excess sits as a credit balance on the customer's AR ledger.

### Applying the Credit to an Invoice
1. Go to **Customers** → find the customer → **Billing** tab
2. View the customer's ledger — unapplied credits appear as negative balances
3. Create a **New Receipt** with a $0 payment amount
4. Allocate the existing credit to an open invoice
5. Post

### Alternative: Credit Memo
If the credit should reduce a specific invoice:
1. Issue a **Credit Memo** referencing the original overpayment
2. Apply the credit memo against the invoice

### Refunding the Credit
If the customer wants a refund instead:
1. Record a refund via the customer's billing (or issue a refund from POS)
2. Create a journal entry: Dr Accounts Receivable / Cr Bank
3. This zeroes out the credit balance

### Writing Off Small Credits
For old, immaterial credit balances:
1. Record a write-off adjustment
2. GL entry: Dr Accounts Receivable / Cr Miscellaneous Income (or Credit Adjustment)

### Prevention
- When recording receipts, always allocate the full amount to specific invoices
- If the customer overpays, immediately note the overpayment and plan to apply it to future invoices

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'acct-howto-refund-from-ar',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'customer refund from AR|refund from accounts receivable|refund without POS|issue refund from billing|AR refund|refund a customer payment|return payment to customer',
    approvedAnswerMarkdown: `## Issuing a Customer Refund from AR (Not POS)

### When to Refund from AR
Use this when the refund relates to an AR invoice/receipt (e.g., a billing correction, overpayment return, or service cancellation) — not a POS return.

### Steps
1. **Void the original receipt** (if refunding the full amount):
   - Go to **Customers** → find the customer → **Billing** tab
   - Find the receipt → click **Void**
   - This reverses the GL entry and re-opens the invoices

2. **For partial refunds or adjustments:**
   - Create a **Credit Memo** for the refund amount
   - Apply the credit memo to the original invoice
   - Record the actual refund payment:
     - Go to **Accounting** → **Journals** → **New Journal Entry**
     - **Debit** Accounts Receivable (reduces the customer's credit)
     - **Credit** Bank Account (the refund paid out)
     - Post

3. **Void the invoice** (if the charge was entirely incorrect):
   - Open the invoice → click **Void**
   - Then void the receipt if a payment was received
   - Issue the refund via journal entry (Dr AR / Cr Bank)

### Important
- Always process through the AR system (void receipt + credit memo) rather than just posting a journal entry — this keeps the AR subledger accurate
- The refund should reference the original invoice and receipt numbers

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'acct-howto-vendor-credit-apply-to-bill',
    moduleKey: 'ap',
    route: '/ap/bills',
    questionPattern:
      'vendor credit|apply vendor credit|vendor credit memo|credit from vendor|apply credit to bill|vendor credit against bill|vendor issued credit|post vendor credit',
    approvedAnswerMarkdown: `## Posting a Vendor Credit and Applying It to an Open Bill

### Creating the Vendor Credit
1. Go to **AP** → **Vendor Credits** (or **New Credit**)
2. Select the **vendor**
3. Enter:
   - **Credit amount**
   - **Date**
   - **Reference number** (the vendor's credit memo number)
   - **Line items** — the GL accounts to credit (e.g., Inventory, Expense)
4. Save and **Post**

### GL Entry on Posting
- **Debit** Accounts Payable (reduces what you owe the vendor)
- **Credit** the expense or inventory accounts (per line items)

### Applying the Credit to an Open Bill
1. Go to **AP** → find the open bill
2. Click **Apply Credit** (or create a payment with the credit offset)
3. Select the vendor credit to apply
4. The bill's balance is reduced by the credit amount

### Alternatively: Offset via Payment
When paying the vendor:
1. Create an AP payment
2. Allocate to the bill
3. Apply the vendor credit as an offset — the net payment amount is reduced

### Important
- Vendor credits reduce the vendor's AP balance
- The credit and its application appear on the **Vendor Ledger**
- If the credit exceeds the bill amount, the remainder stays as a credit on the vendor's account

**Permission required:** \`ap.manage\``,
  },
  {
    slug: 'acct-howto-reverse-vendor-payment-wrong-bill',
    moduleKey: 'ap',
    route: '/ap/payments',
    questionPattern:
      'reverse vendor payment|payment cleared wrong bill|void AP payment|vendor payment mistake|fix vendor payment|payment applied to wrong bill|undo vendor payment|wrong bill paid',
    approvedAnswerMarkdown: `## Reversing a Vendor Payment That Cleared the Wrong Bill

### Steps
1. **Void the incorrect payment**:
   - Go to **AP** → **Payments** → find the payment
   - Click **Void**
   - This reverses the GL entry (Dr Bank / Cr Accounts Payable) and re-opens the bill(s)

2. **Create a new payment** for the correct bill:
   - Go to **AP** → **New Payment**
   - Select the vendor
   - Enter the payment amount
   - Allocate to the **correct bill**
   - Post

### If the Payment Was Already Reconciled
- You may need to reopen the bank reconciliation for the affected period
- Void the payment, create the new one, then re-reconcile

### Important Notes
- Always void and re-enter — don't try to manually adjust with journal entries
- Voiding creates a clean reversing entry with full audit trail
- The original payment and void both appear on the vendor ledger for transparency
- Add notes referencing the correction on both the void and the new payment

**Permission required:** \`ap.manage\``,
  },
  {
    slug: 'acct-howto-intercompany-transfers',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'intercompany transfer|inter-location transfer|book intercompany|transfer between locations|inter-location journal entry|intercompany entry|move money between locations|location transfer',
    approvedAnswerMarkdown: `## Booking Intercompany or Inter-Location Transfers

### How to Record
OppsEra tracks locations as a dimension on journal entry lines. For inter-location transfers:

1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Create a balanced entry with location tags:
   - **Line 1**: Debit the receiving account at **Location A** (e.g., Dr Cash — Location A)
   - **Line 2**: Credit the sending account at **Location B** (e.g., Cr Cash — Location B)
   - **Line 3**: Credit Intercompany Payable at **Location A**
   - **Line 4**: Debit Intercompany Receivable at **Location B**
3. Add a description: "Inter-location transfer — [details]"
4. Post

### Simplified Approach (Same Entity)
If locations are within the same legal entity:
- **Debit** the asset/expense at the receiving location
- **Credit** the asset/expense at the sending location
- Use a Due To/Due From intercompany clearing account

### GL Account Setup
Create intercompany accounts in your COA:
- **Intercompany Receivable** (Current Asset) — "Due From [Location]"
- **Intercompany Payable** (Current Liability) — "Due To [Location]"
- These should net to zero in the consolidated balance sheet

### Important
- Always tag journal lines with the correct **location** for accurate location-level reporting
- Intercompany balances should be reviewed and reconciled monthly
- The **Consolidated P&L** report shows combined results across all locations

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-gift-card-liabilities',
    moduleKey: 'accounting',
    route: '/accounting/reports/gl-detail',
    questionPattern:
      'gift card liabilities|outstanding gift cards|gift card balance report|gift card liability balance|how much in gift cards|unredeemed gift cards|stored value liability',
    approvedAnswerMarkdown: `## Seeing All Outstanding Gift Card Liabilities

### How Gift Cards Affect the GL
When a gift card is sold:
- **Debit** Cash/Bank (payment received)
- **Credit** Gift Card Liability (deferred revenue)

When a gift card is redeemed:
- **Debit** Gift Card Liability (liability decreases)
- **Credit** Revenue (revenue recognized)

These entries are created automatically by the **Stored Value Posting Adapter** and **Voucher Posting Adapter**.

### Viewing the Liability Balance
1. Go to **Accounting** → **Reports** → **GL Detail Report**
2. Filter by the **Gift Card Liability** account
3. The balance represents all sold but unredeemed gift cards

### Alternative: Balance Sheet
1. Go to **Accounting** → **Reports** → **Balance Sheet**
2. Find the Gift Card Liability under **Current Liabilities**
3. This is the total outstanding liability

### Breakage
Over time, some gift cards are never redeemed. OppsEra supports **breakage review**:
- Go to **Accounting** → **Breakage** to review pending breakage
- Breakage recognizes revenue from estimated unredeemable gift card balances
- The breakage policy is configured in **Accounting Settings**

### Important
- Gift card liability is a real financial obligation until redeemed or broken
- Review outstanding balances monthly as part of your close process

**Permission required:** \`accounting.view\``,
  },
  {
    slug: 'acct-howto-track-deferred-revenue',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'deferred revenue|track deferred revenue|prepaid services|unearned revenue|deferred income|revenue not yet earned|prepaid revenue tracking|deferred revenue balance',
    approvedAnswerMarkdown: `## Tracking Deferred Revenue for Prepaid Services

### What Is Deferred Revenue
When customers pay in advance for services not yet delivered (e.g., prepaid spa packages, memberships, event deposits), the payment is a **liability** until the service is provided.

### How It Works in OppsEra
- **Gift cards / stored value**: Automatically tracked via the Stored Value Posting Adapter → Gift Card Liability account
- **Memberships**: The Membership module handles recurring charges and the **Revenue Recognition** feature recognizes revenue over the membership period
- **Spa packages**: The Spa Package Posting Adapter posts purchase as deferred revenue and recognizes revenue on each redemption

### Manual Deferred Revenue
For services not handled by a module adapter:
1. When payment is received:
   - **Debit** Cash/Bank
   - **Credit** Deferred Revenue (liability)
2. When the service is delivered:
   - **Debit** Deferred Revenue
   - **Credit** Revenue (income)

### Using Recurring Templates
If you recognize deferred revenue on a regular schedule:
1. Create a **Recurring Template** with monthly recognition entries
2. Set the frequency and amount to match the service delivery schedule

### Monitoring
- Check the **Deferred Revenue** GL account balance on the **Balance Sheet** (under Current Liabilities)
- Use the **GL Detail Report** filtered to the deferred revenue account to see individual transactions

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-recognize-revenue-packages',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'recognize revenue packages|package revenue recognition|revenue recognition prepaid|recognize revenue sold in advance|when to recognize package revenue|package revenue schedule',
    approvedAnswerMarkdown: `## Recognizing Revenue on Packages Sold in Advance

### Spa Packages (Automatic)
The **Spa Package Posting Adapter** handles revenue recognition automatically:
- **On purchase**: Dr Cash / Cr Deferred Revenue (Spa Package Liability)
- **On each redemption**: Dr Deferred Revenue / Cr Spa Revenue
- Revenue is recognized proportionally as services are used

### Membership Revenue Recognition (Automatic)
The accounting module includes built-in membership revenue recognition:
1. Go to **Accounting** → run **Membership Revenue Recognition**
2. The system calculates earned revenue for the period
3. Posts: Dr Deferred Revenue / Cr Membership Revenue
4. This can be run monthly as part of the close process

### Manual Packages
For other prepaid packages not handled by a module adapter:
1. **On sale**: Post Dr Cash / Cr Deferred Revenue
2. **On service delivery**: Post a journal entry each time a session is used:
   - Dr Deferred Revenue (portion of package value)
   - Cr Revenue
3. The amount per session = total package price ÷ number of sessions

### Tracking
- Monitor the **Deferred Revenue** account balance on the Balance Sheet
- Use **GL Detail Report** filtered to the deferred revenue account to track individual recognitions
- Include revenue recognition in your **Close Checklist**

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-daily-flash-report',
    moduleKey: 'reporting',
    route: '/reports/dashboard',
    questionPattern:
      'daily flash report|daily revenue report|daily deposits|daily cash report|flash report|end of day report|daily summary report|daily sales and cash|daily financial summary',
    approvedAnswerMarkdown: `## Building a Daily Flash Report for Revenue, Deposits, and Cash

### Using the Dashboard
1. Go to **Reports** → **Dashboard**
2. The dashboard shows daily KPIs:
   - **Revenue** — total sales for the day
   - **Order count** and **average check**
   - **Tender breakdown** — cash, credit card, gift card, etc.

### Using Daily Sales Report
1. Go to **Reports** → **Daily Sales**
2. Select the date and location
3. View:
   - Revenue by department
   - Tender totals
   - Voids and returns
   - Tax collected

### Cash & Deposit Information
- **Cash Management Dashboard** — Accounting → Cash Management for open drawers, deposits, and cash position
- **Daily Reconciliation** — Accounting → Daily Reconciliation for expected vs. actual deposits
- **Deposit Slips** — Track prepared and deposited cash

### Building a Custom Flash Report
1. Go to **Reports** → **Custom Reports**
2. Use the **Semantic Layer** report builder:
   - Add dimensions: date, location, department
   - Add measures: revenue, order count, average check, tender totals
3. Save as a report template
4. Run daily

### Operations Summary
- **Accounting** → **Operations Summary** provides a high-level daily view combining financial and operational metrics

**Permission required:** \`reports.view\``,
  },
  {
    slug: 'acct-troubleshoot-cash-flow-vs-pnl',
    moduleKey: 'accounting',
    route: '/accounting/reports/cash-flow',
    questionPattern:
      'cash flow different from P&L|cash flow vs profit and loss|why is cash flow different|P&L doesn\'t match cash|profit but no cash|cash flow report explanation|cash flow vs income',
    approvedAnswerMarkdown: `## Why the Cash Flow Report Is Different from the P&L

### Key Difference
The **P&L (Income Statement)** uses **accrual accounting** — it records revenue when earned and expenses when incurred, regardless of when cash moves.

The **Cash Flow Statement** tracks actual **cash in and cash out** — when money enters and leaves your bank accounts.

### Common Reasons for Differences

| Situation | P&L Impact | Cash Flow Impact |
|-----------|-----------|-----------------|
| Credit card sale today, settled tomorrow | Revenue today | Cash tomorrow |
| Invoice posted, not yet paid | Revenue recorded | No cash yet |
| Bill posted, not yet paid | Expense recorded | No cash yet |
| Depreciation posted | Expense recorded | No cash impact |
| Customer prepayment received | No revenue (deferred) | Cash received |
| Loan principal payment | No expense (balance sheet) | Cash paid out |
| Equipment purchase | No expense (capitalized) | Cash paid out |

### Cash Flow Sections
OppsEra's Cash Flow Statement is organized into:
1. **Operating Activities** — cash from day-to-day operations
2. **Investing Activities** — cash from asset purchases/sales
3. **Financing Activities** — cash from loans, equity contributions

### Reports
- **Cash Flow Statement** — full GAAP-style cash flow statement
- **Cash Flow Simplified** — simplified operating cash flow view
- **Cash Flow Forecast** — predicted future cash flows

**Permission required:** \`financials.view\``,
  },
  {
    slug: 'acct-howto-review-tax-collected-vs-payable',
    moduleKey: 'accounting',
    route: '/accounting/reports/sales-tax',
    questionPattern:
      'tax collected vs tax payable|review sales tax|tax collected report|compare tax collected and payable|sales tax reconciliation|tax collected versus owed|tax liability review',
    approvedAnswerMarkdown: `## Reviewing Tax Collected Versus Tax Payable

### Sales Tax Liability Report
1. Go to **Accounting** → **Reports** → **Sales Tax**
2. Select the period and location
3. The report shows:
   - **Taxable sales** by tax group
   - **Tax collected** — the actual tax charged to customers
   - **Tax payable** — the liability balance in the GL

### Tax Remittance Report
1. Go to **Accounting** → **Reports** → **Tax Remittance**
2. This report is formatted for filing and shows tax due by jurisdiction/authority
3. Useful for preparing your state/county/city tax filings

### Tax Rate Breakdown
- Drill down into individual tax rates
- See collections broken out by state, county, and city rates
- Useful for jurisdictions requiring separate reporting

### How Tax Flows Through the System
1. Customer is charged tax at POS (based on item's tax group)
2. The POS posting adapter creates a GL entry: Dr AR/Cash / Cr Tax Payable
3. Tax Payable accumulates until you remit to the tax authority
4. When you pay: record Dr Tax Payable / Cr Bank (via journal entry)

### Reconciliation
Compare the **Tax Payable GL balance** (from the Trial Balance) against the **Sales Tax Liability Report** total. These should match. If they don't, check for:
- Manual journal entries affecting the tax payable account
- Voided orders that may not have reversed tax correctly

**Permission required:** \`tax.view\``,
  },
  {
    slug: 'acct-howto-close-location-books',
    moduleKey: 'accounting',
    route: '/accounting/period-close',
    questionPattern:
      'close location books|close one location|location period close|close books for a location|location-specific close|partial close by location|close single location',
    approvedAnswerMarkdown: `## Closing One Location's Books Without Closing the Whole Company

### Location-Level Close Status
OppsEra supports tracking period close status by location:

1. Go to **Accounting** → **Period Close**
2. View the **Location Close Status** — each location shows its close progress independently
3. Mark a location as **closed** when all its month-end procedures are complete

### What Location Close Tracks
- Whether all location-specific accruals are posted
- Whether cash/drawer reconciliation is complete
- Whether deposit slips are reconciled
- Whether all GL postings for the location are current

### Company-Level Close
The company-level period close happens after **all** locations are closed:
1. Use the **Close Orchestrator** to run through the full close checklist
2. Once all locations are marked closed and all company-level entries are complete
3. **Lock the period** to prevent further postings

### Important Notes
- Location close status is a **tracking** mechanism — it doesn't prevent postings to that location
- Only the company-level **period lock** prevents postings
- The **Close Checklist** tracks both location-specific and company-wide tasks

**Permission required:** \`period.close\``,
  },
  {
    slug: 'acct-howto-lock-prior-period',
    moduleKey: 'accounting',
    route: '/accounting/period-close',
    questionPattern:
      'lock prior period|lock period|prevent posting to closed period|lock accounting period|close and lock period|no posting to old period|freeze period|prevent backdated entries',
    approvedAnswerMarkdown: `## Locking a Prior Period

### Steps
1. Go to **Accounting** → **Period Close**
2. Find the period you want to lock
3. Click **Lock Period**
4. Confirm — the period status changes to **closed**

### What Locking Does
- **Prevents** any new journal entries from being posted with a business date in the locked period
- **Prevents** GL posting adapters from creating entries dated in the locked period
- Existing entries in the period remain unchanged

### Close Workflow
The recommended workflow is:
1. Complete all month-end procedures (accruals, depreciation, COGS, reconciliation)
2. Run the **Close Checklist** to verify all steps are done
3. Review the financials (P&L, Balance Sheet, Trial Balance)
4. **Lock the period**

### Unlocking
If you need to post a correction to a locked period:
- An accounting manager can **unlock** the period
- Post the correction
- Re-lock the period

### Strict Close Mode
In **Accounting Settings**, you can enable **strict close** — this enforces that periods must be closed sequentially and prevents skipping months.

**Permission required:** \`period.close\``,
  },
  {
    slug: 'acct-howto-restrict-void-financial-entries',
    moduleKey: 'settings',
    route: '/settings',
    questionPattern:
      'restrict void financial entries|only managers can void|accounting void permission|who can void entries|prevent unauthorized voids|restrict voiding|void permission control',
    approvedAnswerMarkdown: `## Allowing Only Accounting Managers to Void Financial Entries

### How Permissions Work
Voiding financial entries (journal entries, invoices, receipts, bills, payments) requires the \`accounting.manage\` permission (for GL entries) or module-specific manage permissions (\`ar.manage\`, \`ap.manage\`).

### Role-Based Access
1. Go to **Settings** → **Users**
2. Assign roles appropriately:
   - **Owner** — full access including voids
   - **Manager** — can void entries (has \`accounting.manage\`)
   - **Supervisor/Cashier/Server/Staff** — cannot void accounting entries

### Permission Breakdown
| Action | Required Permission |
|--------|-------------------|
| Void a journal entry | \`accounting.manage\` |
| Void an AR invoice | \`ar.manage\` |
| Void an AR receipt | \`ar.manage\` |
| Void an AP bill | \`ap.manage\` |
| Void an AP payment | \`ap.manage\` |
| Void a settlement | \`banking.reconcile\` |

### Important Notes
- All voids are logged in the **audit trail** — even authorized voids create a permanent record
- Voids create reversing GL entries (they don't delete the original)
- The original entry and the void both remain visible for audit purposes
- Custom roles are not supported — use the 6 predefined roles

**Permission required:** \`users.manage\` (to change user roles)`,
  },
  {
    slug: 'acct-howto-custom-financial-statement-layout',
    moduleKey: 'accounting',
    route: '/accounting/statement-layouts',
    questionPattern:
      'custom financial statement|custom P&L layout|custom balance sheet layout|financial statement layout|create statement template|custom report layout|customize financial reports|statement format',
    approvedAnswerMarkdown: `## Creating a Custom Financial Statement Layout

### Steps
1. Go to **Accounting** → **Statement Layouts**
2. Click **New Layout** (or edit an existing template)
3. Configure:
   - **Name** — e.g., "Management P&L" or "Board Balance Sheet"
   - **Type** — P&L, Balance Sheet, or Cash Flow
   - **Sections** — define the groupings and sub-totals you want:
     - Each section maps to one or more GL account classifications
     - Arrange sections in your preferred order
     - Add subtotal rows where needed
4. Save

### What You Can Customize
- Which accounts appear in which section
- Section ordering and hierarchy
- Subtotal and total line placement
- Section labels and groupings

### Default Templates
OppsEra includes **pre-built statement layout templates** by industry (retail, restaurant, golf, hybrid). These are created during COA bootstrap and can be customized afterward.

### Using Custom Layouts
When running financial reports (P&L, Balance Sheet, Cash Flow):
- Select your custom layout from the layout dropdown
- The report renders using your defined structure

### Tips
- Create separate layouts for different audiences (management, board, bank)
- Keep the standard layout as a baseline and create copies for customization
- Section mappings use GL classifications — ensure your COA classifications are set up correctly

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-trace-pnl-to-source',
    moduleKey: 'accounting',
    route: '/accounting/reports/profit-and-loss',
    questionPattern:
      'trace P&L to source|drill down P&L|P&L detail|where did this number come from|trace number on P&L|P&L source transactions|income statement detail|drill into P&L line',
    approvedAnswerMarkdown: `## Tracing a Number on the P&L Back to Source Transactions

### Step-by-Step Drill-Down

1. **Start with the P&L** — Go to **Accounting** → **Reports** → **Profit & Loss**
2. **Identify the line** — find the account or category with the number you want to trace
3. **Go to GL Detail** — Click through to the **GL Detail Report** for that specific account and period
4. **View individual entries** — Each journal entry line shows:
   - Journal entry number
   - Business date
   - Debit or credit amount
   - Description/memo
   - **Source reference** — the originating transaction (order ID, invoice number, bill number, etc.)
5. **Trace to source** — Use the source reference to find the original transaction in the relevant module (POS, AR, AP, etc.)

### Using the Tender Audit Trail
For payment-related P&L items:
- Go to **Accounting** → **Tender Audit Trail**
- Search by date range and account
- Shows the complete chain from payment → GL posting

### For Auto-Posted Entries
Entries created by GL posting adapters include the source event type and entity ID. This lets you trace:
- POS Revenue → specific order
- AR Revenue → specific invoice
- COGS → specific inventory calculation
- Tips → specific order/payment

### Export
Export the GL Detail Report to CSV for offline analysis or to share with your accountant.

**Permission required:** \`accounting.view\`, \`reports.export\``,
  },
  {
    slug: 'acct-troubleshoot-house-account-not-in-ar',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'house account not in receivables|house charges not showing|house account AR|house account not appearing|house account charges missing|house account balance wrong|house charges not in AR',
    approvedAnswerMarkdown: `## House Account Charges Not Appearing in Receivables

### How House Accounts Work
When a customer pays with a house account tender at POS:
- The POS posting adapter creates a GL entry: Dr Accounts Receivable / Cr Revenue
- This should appear as an AR balance for the customer

### Common Causes

1. **Payment type not mapped** — The house account tender may not have a GL mapping
   - Check **Accounting** → **Mappings** → **Payment Types**
   - Ensure the house account tender is mapped with AR as the cash/clearing account
   - Check **Unmapped Events** for house account tenders

2. **Customer not linked** — The POS transaction may not be associated with a customer profile
   - House account charges need a customer assignment to appear on their AR ledger
   - Verify the customer was selected at time of sale

3. **GL posting but no AR invoice** — The GL entry exists but no AR invoice was created
   - POS house account charges post to GL but may not automatically create AR invoices
   - The charge appears in the GL under Accounts Receivable but not in the AR subledger
   - Create a corresponding AR invoice to track the balance properly

### Resolution
- Fix the mapping, then use **Backfill GL from Tenders** to retroactively post
- For charges that posted to GL but not AR, create AR invoices manually to match

**Permission required:** \`ar.manage\`, \`mappings.manage\``,
  },
  {
    slug: 'acct-howto-move-charge-between-folios',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'move charge between folios|transfer charge|move charge to another account|transfer folio charge|reassign charge|move a charge|reclassify a charge|move charge between accounts',
    approvedAnswerMarkdown: `## Moving a Charge from One Folio or Account to Another

### For PMS Folio Charges
If you need to move a charge between guest folios:
1. Process the transfer in the **PMS** module (front desk operation)
2. The **Folio Posting Adapter** automatically creates the reclassification GL entries:
   - Debit the receiving folio's AR
   - Credit the original folio's AR

### For AR/Customer Account Charges
To move a charge between customer accounts:
1. **Void** the original invoice on Customer A
2. **Create** a new invoice on Customer B with the same details
3. Post the new invoice
4. This creates a clean audit trail

### For GL Reclassification
If the charge just needs to move between GL accounts (not between customers):
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Create a reclassification entry:
   - **Debit** the new/correct account
   - **Credit** the old/incorrect account
3. Add a description explaining the transfer
4. Post

### Important
- Always use proper void + re-entry for AR/AP subledger items (not just JE adjustments)
- Journal entry reclassifications are appropriate for GL-only corrections
- All transfers and reclassifications are logged in the audit trail

**Permission required:** \`accounting.manage\` or \`ar.manage\``,
  },
  {
    slug: 'acct-howto-owner-contributions-distributions',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'owner contributions|owner distributions|owner investment|record owner contribution|record owner draw|owner equity|owner withdrawal|capital contribution|owner distribution entry',
    approvedAnswerMarkdown: `## Recording Owner Contributions or Distributions

### Owner Contribution (Investment)
When an owner puts money into the business:
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Add lines:
   - **Debit** Bank/Cash account (money received)
   - **Credit** Owner's Equity / Capital Contribution account
3. Description: "Owner contribution — [name] — [purpose]"
4. Post

### Owner Distribution (Draw/Withdrawal)
When an owner takes money out of the business:
1. Go to **Accounting** → **Journals** → **New Journal Entry**
2. Add lines:
   - **Debit** Owner's Draw / Distributions account
   - **Credit** Bank/Cash account (money paid out)
3. Description: "Owner distribution — [name]"
4. Post

### GL Account Setup
Ensure your Chart of Accounts includes:
- **Owner's Equity / Capital** (Equity account) — for contributions
- **Owner's Draw / Distributions** (Equity account) — for withdrawals
- These are typically created during COA bootstrap (accounts 3100, 3300 in the default template)

### Important Notes
- Owner distributions reduce total equity on the Balance Sheet
- Owner contributions increase total equity
- These are **not** revenue or expense items — they don't appear on the P&L
- For S-Corps, LLCs, and partnerships, consult your accountant for proper account structure
- Track contributions and distributions separately for each owner if there are multiple

**Permission required:** \`accounting.manage\``,
  },
  {
    slug: 'acct-howto-period-close-checklist-exceptions',
    moduleKey: 'accounting',
    route: '/accounting/period-close',
    questionPattern:
      'period close checklist|close checklist exceptions|what\'s left to close|period close status|close exceptions|period end checklist|what needs to be done to close|close checklist items',
    approvedAnswerMarkdown: `## Seeing All Exceptions on the Period-Close Checklist

### Accessing the Close Checklist
1. Go to **Accounting** → **Period Close**
2. Select the period (month)
3. View the **Close Checklist** — a structured list of all tasks required to close the period

### Checklist Items
The close checklist typically includes:
- **Accruals posted** — month-end accruals for unpaid expenses
- **Depreciation run** — fixed asset depreciation for the period
- **COGS calculated** — periodic inventory COGS posted
- **Revenue recognition** — membership and deferred revenue recognized
- **Bank reconciliation** — all bank accounts reconciled
- **Cash reconciliation** — drawer sessions closed and deposit slips reconciled
- **Settlement matching** — card settlements matched to tenders
- **AR review** — outstanding receivables reviewed
- **AP review** — outstanding payables reviewed
- **Tax review** — sales tax liability verified
- **Intercompany** — inter-location entries balanced
- **Location close** — all locations marked as closed

### Exceptions and Status
- Each checklist item shows **complete** or **incomplete**
- Incomplete items are your exceptions — what still needs attention
- Click on any item for details on what's pending

### Close Orchestrator
Use the **Close Orchestrator** to run through the checklist systematically:
- It identifies and highlights all incomplete items
- Guides you through the close process step by step

### Updating Items
Mark checklist items as complete as you finish each task. The period can be locked once all items are done.

**Permission required:** \`period.close\``,
  },
  {
    slug: 'acct-howto-attach-backup-to-journal-entry',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'attach document to journal entry|attach backup to journal|attach receipt to entry|journal entry attachment|upload document to journal|supporting documentation journal entry|attach file to GL entry',
    approvedAnswerMarkdown: `## Attaching Backup Documentation to a Journal Entry

### Steps
1. Go to **Accounting** → **Journals**
2. Open the journal entry
3. Click **Attach Document** (or the attachment/paperclip icon)
4. Upload the file (receipt, invoice, contract, or other supporting document)
5. The document is linked to the journal entry

### Supported Attachments
The GL document attachment system supports file uploads linked to specific journal entries. Common backup documents include:
- Vendor invoices or receipts
- Bank statements
- Contracts or agreements
- Approval emails or memos
- Calculation worksheets

### Viewing Attachments
- Open any journal entry to see its attached documents
- Attachments are stored securely and linked to the tenant

### Removing Attachments
- Open the journal entry → click **Remove** on the attachment
- Removal is logged in the audit trail

### Best Practices
- Attach supporting documents at the time of posting — it's easier than going back later
- For recurring entries, attach the underlying contract or agreement to the first entry
- For audit readiness, ensure all material journal entries have backup documentation
- Use clear file names that reference the journal entry or transaction

**Permission required:** \`accounting.manage\``,
  },
];

// ─── Seed Function ───────────────────────────────────────────────────────────

export async function seedTrainingDataBatch4(tenantId: string | null = null) {
  await db
    .insert(aiSupportAnswerCards)
    .values(
      TRAINING_CARDS_BATCH4.map((c) => ({
        ...c,
        tenantId,
        status: 'draft' as const,
        version: 1,
      })),
    )
    .onConflictDoNothing();

  return {
    answerCardsInserted: TRAINING_CARDS_BATCH4.length,
    message: `Inserted ${TRAINING_CARDS_BATCH4.length} answer cards as draft. Review and activate from the admin portal at /ai-assistant/answers.`,
  };
}
