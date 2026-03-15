import { db, aiSupportAnswerCards } from '@oppsera/db';

// ─── 60 Training Answer Cards ────────────────────────────────────────────────
// Grounded in actual OppsEra codebase features. Inserted as 'draft' for admin review.

const TRAINING_CARDS = [
  // ── ERP (1–20) ──────────────────────────────────────────────────────────────

  {
    slug: 'erp-howto-create-customer-vendor',
    moduleKey: 'customers',
    route: '/customers',
    questionPattern:
      'how do I create a new customer|how to add a customer|how do I create a vendor|how to add a vendor|create new customer|add new vendor|new customer record|set up a vendor',
    approvedAnswerMarkdown: `## How to Create a New Customer or Vendor

**Customers** and **vendors** are managed in separate areas:

### Creating a Customer
1. Go to **Customers** from the main navigation
2. Click **New Customer**
3. Fill in the required fields: name, email, phone
4. Optionally add: addresses, contacts, notes, custom identifiers
5. Click **Save**

### Creating a Vendor
1. Go to **Inventory** → **Vendors**
2. Click **New Vendor**
3. Fill in vendor details and contact information
4. Optionally set up vendor catalog items (SKU, cost, lead time)
5. Click **Save**

**Permission required:** \`customers.manage\` for customers, \`inventory.manage\` for vendors.`,
  },
  {
    slug: 'erp-corrections-edit-posted-invoice',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'how do I edit a posted invoice|edit invoice after posting|change a posted invoice|modify posted invoice|fix an invoice that was already posted|invoice was wrong how to fix',
    approvedAnswerMarkdown: `## Editing a Posted Invoice

Posted invoices **cannot be directly edited** — this is by design to maintain an accurate audit trail.

### How to Correct a Posted Invoice
1. Go to **Customers** → **Billing**
2. Find the invoice that needs correction
3. Issue a **Credit Memo** against the original invoice to reverse it
4. Create a new invoice with the correct details

### Why This Approach?
Accounting standards require that posted financial documents remain unchanged. A credit memo creates a proper paper trail showing what was corrected and why.

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'erp-troubleshoot-invoice-unpaid',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'invoice showing unpaid|payment entered but invoice still unpaid|why does invoice show unpaid|invoice not marked as paid|payment was made but invoice is open|customer paid but invoice says outstanding',
    approvedAnswerMarkdown: `## Invoice Showing as Unpaid Despite Payment

This usually has one of these causes:

1. **Payment applied to wrong invoice** — Check the AR ledger for the customer to see which invoice the payment was applied to
2. **Payment still in draft/pending state** — The payment may have been entered but not posted/finalized
3. **Partial payment** — The payment amount may not cover the full invoice balance
4. **GL posting delay** — The GL adapter processes payments asynchronously; check posting status

### How to Diagnose
1. Go to **Customers** → find the customer → **Billing** tab
2. Check the **AR Ledger** to see all payments and their allocation
3. Verify the payment amount matches the invoice total
4. Check if the payment status shows as completed

If the payment is correctly recorded and allocated but the invoice still shows unpaid, please contact support.`,
  },
  {
    slug: 'erp-corrections-credit-memo',
    moduleKey: 'ar',
    route: '/customers/billing',
    questionPattern:
      'how to issue a credit memo|how do I issue a refund in AR|create credit memo|refund an invoice|issue accounting refund|credit note|how to credit a customer account',
    approvedAnswerMarkdown: `## Issuing a Credit Memo

1. Go to **Customers** → **Billing**
2. Find the original invoice
3. Click **Issue Credit Memo**
4. Enter the credit amount and reason
5. Review and post the credit memo

The credit memo will reduce the customer's outstanding balance and create a corresponding GL entry.

**Note:** This is different from a POS refund/return. If the customer is returning items purchased at the point of sale, use the **Return** workflow from the Orders page instead.

**Permission required:** \`ar.manage\``,
  },
  {
    slug: 'erp-howto-bank-reconciliation',
    moduleKey: 'accounting',
    route: '/accounting/bank-reconciliation',
    questionPattern:
      'how do I reconcile my bank account|bank reconciliation|how to reconcile bank|reconcile bank statement|match bank transactions|bank rec|bank recon process',
    approvedAnswerMarkdown: `## Bank Account Reconciliation

1. Go to **Accounting** → **Bank Reconciliation**
2. Click **New Reconciliation Session** for the account you want to reconcile
3. Enter the bank statement ending balance and date
4. Match system transactions against your bank statement:
   - Auto-match will pair obvious matches
   - Manually match remaining items
   - Review unmatched items on both sides
5. When the difference is $0.00, click **Complete Reconciliation**

### Additional Tools
- **Settlement Matching** — match card processor settlements against recorded tenders
- **CSV Import** — import settlement files for bulk matching
- **Daily Reconciliation** — view day-by-day reconciliation status
- **Reconciliation Waterfall** — see the progression of unreconciled items

**Permission required:** \`banking.reconcile\``,
  },
  {
    slug: 'erp-corrections-wrong-journal-entry',
    moduleKey: 'accounting',
    route: '/accounting/journals',
    questionPattern:
      'fix journal entry posted to wrong account|correct a journal entry|wrong GL account on journal entry|journal entry mistake|posted to wrong account|how to reverse a journal entry|void journal entry',
    approvedAnswerMarkdown: `## Correcting a Journal Entry Posted to the Wrong Account

Posted journal entries **cannot be edited directly**. To correct one:

1. Go to **Accounting** → **Journals**
2. Find the incorrect journal entry
3. Click **Void** to reverse the original entry (this creates an equal and opposite entry)
4. Click **New Journal Entry** to create a correcting entry with the correct accounts
5. Review the debit/credit amounts and post

### Tips
- Always add a note on the correcting entry referencing the original entry number
- Voiding creates a full reversal — both the original and void will appear in the GL detail report
- If the original was posted in a closed period, you'll need to post the correction in the current open period

**Permission required:** \`accounting.manage\`

**Caution:** This affects financial statements. If you're unsure, consult your accounting manager before making corrections.`,
  },
  {
    slug: 'erp-reporting-pl-by-location',
    moduleKey: 'accounting',
    route: '/accounting/statements/profit-loss',
    questionPattern:
      'run profit and loss report|P&L by location|P&L by department|profit and loss by location|income statement by department|how to see P&L|run P&L report|financial statements by location',
    approvedAnswerMarkdown: `## Running a P&L Report by Location or Department

1. Go to **Accounting** → **Statements** → **Profit & Loss**
2. Set your **date range** (month, quarter, year, or custom)
3. Use the **Location** filter to select a specific location
4. Use the **Department** filter to drill down by department
5. Click **Generate** to view the report

### Other Financial Reports
- **Consolidated P&L** — Compare all locations side-by-side: Accounting → Reports → Consolidated P&L
- **Budget vs. Actual** — See variance against budgets: Accounting → Reports → Budget vs Actual
- **Balance Sheet** — Accounting → Statements → Balance Sheet
- **Cash Flow** — Accounting → Statements → Cash Flow

All reports can be **exported to CSV** using the download button.

**Permission required:** \`financials.view\` (view), \`reports.export\` (CSV download)`,
  },
  {
    slug: 'erp-howto-close-period',
    moduleKey: 'accounting',
    route: '/accounting/period-close',
    questionPattern:
      'close the month|close accounting period|month end close|how to close period|period close process|end of month accounting|close the books',
    approvedAnswerMarkdown: `## Closing an Accounting Period

### Before You Start
Period close is **irreversible** — once closed, no entries can be posted to that period.

### Steps
1. Go to **Accounting** → **Period Close**
2. Review the **Close Checklist** — the system checks for:
   - Unposted journal entries
   - Unreconciled bank accounts
   - Pending settlements
   - Open AP/AR items
   - Location close status
3. Resolve any open items flagged by the checklist
4. Click **Run Close Orchestrator** to begin the close process
5. The system will:
   - Lock the period from further posting
   - Generate retained earnings entries
   - Update the period status across all locations
6. Confirm the close

### Tips
- All locations must be ready before closing the period
- Run a trial balance first to verify all accounts balance
- Review the P&L and balance sheet before closing
- Once closed, corrections must be posted to the next open period

**Permission required:** \`period.close\``,
  },
  {
    slug: 'erp-troubleshoot-inventory-mismatch',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'inventory not matching|inventory count wrong|physical count doesn\'t match system|on hand quantity incorrect|why is inventory off|stock count mismatch|inventory discrepancy',
    approvedAnswerMarkdown: `## Inventory Quantities Not Matching Physical Counts

### Common Causes
1. **Unreceived deliveries** — Stock arrived but wasn't received in the system
2. **Unrecorded shrink** — Breakage, theft, or spoilage not entered
3. **Transfers not posted** — Inventory transferred between locations but not recorded
4. **POS tracking not enabled** — Item's "Track Inventory" flag may be off, so sales don't decrement
5. **86'd items** — Items marked as unavailable may still show system quantity

### How to Investigate
1. Go to the **Inventory** section (Retail or F&B)
2. Find the item and check its **Movements History** — this shows every transaction that affected the quantity
3. Compare the movements against your expected receipts, sales, and adjustments
4. Use **Inventory Reconciliation** to systematically compare system vs physical counts
5. Record any discrepancies as **Adjustments** or **Shrink** to correct the system

### Prevention
- Always receive deliveries promptly in the system
- Record shrink/spoilage as it occurs
- Run periodic physical counts and reconcile
- Ensure all sold items have inventory tracking enabled`,
  },
  {
    slug: 'erp-howto-transfer-inventory',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'transfer inventory between locations|move stock to another location|how to transfer inventory|inter-location transfer|send inventory to another store|inventory transfer',
    approvedAnswerMarkdown: `## Transferring Inventory Between Locations

1. Go to **Inventory** → **Receiving**
2. Click **New Transfer**
3. Select the **source location** (where the inventory is now)
4. Select the **destination location** (where it's going)
5. Add items and quantities to transfer
6. Review and **post** the transfer

The transfer will:
- Decrease quantity at the source location
- Increase quantity at the destination location
- Create movement records at both locations for audit

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'erp-howto-receive-inventory',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'receive a purchase order|how to receive inventory|receive shipment|receive delivery|log incoming inventory|receiving stock|receive PO|receive goods',
    approvedAnswerMarkdown: `## Receiving Inventory

OppsEra uses **inventory receipts** to log incoming stock.

### Full Receipt
1. Go to **Inventory** → **Receiving**
2. Click **New Receipt**
3. Select the **vendor**
4. Add line items — choose from the vendor's catalog or search all items
5. Enter quantities received and verify costs
6. Optionally add receiving charges (freight, handling)
7. Click **Post Receipt** to finalize

### Partial Receipt
Follow the same steps but enter only the quantities actually received. The remaining quantities can be received on a subsequent receipt.

### Tips
- Costs on the receipt update inventory valuation
- Landed cost allocation is available for distributing freight across line items
- Posted receipts create GL entries for inventory and AP
- You can **void** a posted receipt if it was entered in error (reverses all movements)

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'erp-corrections-void-receipt',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'cancel purchase order|void purchase order|cancel a receipt|void a receipt|undo a receipt|reverse receiving|how to cancel PO|void PO',
    approvedAnswerMarkdown: `## Cancelling or Voiding an Inventory Receipt

### If the Receipt Is Still a Draft
- Open the draft receipt and click **Delete** — no inventory or GL impact.

### If the Receipt Has Been Posted
1. Go to **Inventory** → **Receiving**
2. Find and open the posted receipt
3. Click **Void Receipt**
4. Confirm the void

Voiding a posted receipt will:
- Reverse all inventory quantity movements
- Create reversing GL entries
- If landed cost was allocated, those entries are also reversed

**Note:** OppsEra uses receipt-based receiving rather than formal purchase orders. If you're looking for a PO approval workflow, that is not currently part of the system.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'cross-permissions-manage-users',
    moduleKey: 'settings',
    route: '/settings',
    questionPattern:
      'set user permissions|restrict employee access|change user role|manage permissions|who can do what|limit what employees can do|set up roles|permission settings|RBAC|role based access',
    approvedAnswerMarkdown: `## Managing User Permissions

OppsEra uses **role-based access control** with 6 predefined roles:

| Role | Access Level |
|------|-------------|
| **Owner** | Full access to everything |
| **Manager** | All operational features |
| **Supervisor** | Most features except financial/admin |
| **Cashier** | POS and basic operations |
| **Server** | F&B POS and table service |
| **Staff** | View-only and basic tasks |

### How to Set a User's Role
1. Go to **Settings** → **Users**
2. Find the user
3. Change their **Role** assignment
4. Save

### Manager PIN Override
11 high-risk operations (void, comp, price override, large discounts, etc.) require a **Manager PIN** at the POS, regardless of the user's role. This adds a second layer of authorization.

### What If I Need Custom Roles?
Custom roles are not currently supported. The 6 predefined roles cover 62 individual permissions across all modules. If you need a specific permission combination, contact support.

**Permission required:** \`users.manage\``,
  },
  {
    slug: 'erp-config-add-location',
    moduleKey: 'settings',
    route: '/settings/general',
    questionPattern:
      'add new location|add department|add cost center|create new location|set up a new store|new branch|add a new site|create department',
    approvedAnswerMarkdown: `## Adding a New Location, Department, or Cost Center

1. Go to **Settings** → **General**
2. Navigate to the **Locations** or **Departments** section
3. Click **Add New**
4. Fill in the required details (name, address, etc.)
5. Save

### Important Follow-Up Steps
After adding a new location, you'll need to configure:
- **Tax rates** for the new location (Accounting → Tax)
- **GL mappings** so transactions at this location post to the correct accounts
- **Inventory** — set up initial stock levels
- **POS terminals** — configure registers and payment devices
- **User access** — ensure staff are assigned to the new location

**Permission required:** \`settings.update\``,
  },
  {
    slug: 'erp-integrations-payroll-sync',
    moduleKey: null,
    route: null,
    questionPattern:
      'payroll not syncing|payroll data sync issue|payroll integration|connect payroll|payroll export|time clock sync|payroll system|where is payroll',
    approvedAnswerMarkdown: `## Payroll in OppsEra

**OppsEra does not include a payroll module.** There is no payroll processing, paycheck generation, or payroll tax filing.

### What IS Available
- **Tip Management** — Tip pools, tip finalization, and tip payouts (with GL posting)
- **Commissions** — Spa provider commission rules, calculation, and ledger
- **Expense Reimbursements** — Track and reimburse employee expenses
- **CSV Export** — Export sales, tip, and labor data to CSV for import into your payroll provider

### If You Need Payroll
Use an external payroll provider (ADP, Gusto, Paychex, etc.) and export the relevant data from OppsEra via CSV reports.

If you were expecting payroll to sync with an external system and it's not working, please clarify what data you're trying to export and we can help you find the right report.`,
  },
  {
    slug: 'cross-reporting-export-csv',
    moduleKey: 'reporting',
    route: null,
    questionPattern:
      'export to excel|export to CSV|download report|export data|save as spreadsheet|export to file|download data|get data out of system|export spreadsheet',
    approvedAnswerMarkdown: `## Exporting Data to Excel or CSV

Most report pages have a **Download/Export** button that exports the current view to CSV format (compatible with Excel).

### Where to Find Exports
- **Accounting Reports** — Each report (P&L, Balance Sheet, Trial Balance, Tax, etc.) has its own export button
- **Sales Reports** — Daily sales, sales history, item sales
- **Inventory Reports** — Inventory summary, movements
- **Customer Reports** — Customer lists, spending analysis
- **PMS Reports** — Manager's report, occupancy, revenue
- **Spa Reports** — Provider performance, service analytics

### How to Export
1. Navigate to the report you want
2. Set your filters (date range, location, etc.)
3. Click the **Export** or **Download CSV** button
4. The file will download to your computer
5. Open in Excel, Google Sheets, or any spreadsheet application

**Permission required:** \`reports.export\`

**Tip:** If you don't see the export button, you may not have the \`reports.export\` permission. Ask your administrator to grant it.`,
  },
  {
    slug: 'erp-troubleshoot-tax-calculation',
    moduleKey: 'accounting',
    route: '/accounting/tax',
    questionPattern:
      'sales tax wrong|tax calculation incorrect|wrong tax amount|tax not right|why is tax wrong|tax rate issue|incorrect tax on invoice|tax miscalculation',
    approvedAnswerMarkdown: `## Sales Tax Calculating Incorrectly

### Common Causes
1. **Wrong tax rate on item** — The item may be assigned to the wrong tax group, or the tax rate in that group is incorrect
2. **Inclusive vs. exclusive mismatch** — Check if the item uses tax-inclusive pricing (tax embedded in price) vs. exclusive (tax added on top)
3. **Tax group not assigned** — The item may not have a tax group at all, causing zero tax
4. **Location-specific rate** — Different locations may have different tax rates; check the rate for this specific location
5. **Tax-exempt flag** — The order or customer may be marked as tax-exempt

### How to Check
1. Go to **Accounting** → **Tax**
2. Review the tax rates configured for your location
3. Check the item in **Catalog** — verify its tax group assignment
4. Look at the **Sales Tax Liability Report** to see how tax is being calculated across transactions

### Important Notes
- Tax rates are **manually configured** — there is no automatic tax rate lookup service
- All tax math uses **integer cents** to avoid rounding errors
- Changes to tax rates apply to **new transactions only** — existing orders are not retroactively recalculated

**If you believe the tax engine itself is miscalculating, please escalate to support with a specific order number so we can investigate.**`,
  },
  {
    slug: 'erp-integrations-external-systems',
    moduleKey: null,
    route: null,
    questionPattern:
      'connect to QuickBooks|integrate with Stripe|connect accounting software|QuickBooks integration|Xero integration|Stripe integration|sync with external system|connect ERP to other software|third party integration',
    approvedAnswerMarkdown: `## External Integrations

### What's Currently Available
- **CardPointe** — Payment processing for POS card-present transactions (terminals, card readers)
- **Stripe** — Deposit authorization and payment for hotel/PMS reservations
- **Twilio** — SMS notifications for reservations and host stand waitlist

### What's NOT Available
- **QuickBooks** — No integration. OppsEra has its own full accounting module (GL, AP, AR, financial statements, period close)
- **Stripe for POS** — POS uses CardPointe, not Stripe
- **Xero, Sage, FreshBooks** — No integration
- **External payroll** — No direct sync; use CSV export

### Why No QuickBooks?
OppsEra includes a complete, built-in accounting system with chart of accounts, journal entries, bank reconciliation, financial statements, and period close. It replaces the need for external accounting software rather than integrating with it.

If you need to move data to an external system, use the **CSV export** feature available on all reports.`,
  },
  {
    slug: 'cross-howto-audit-history',
    moduleKey: 'accounting',
    route: '/accounting/audit',
    questionPattern:
      'find audit history|see who changed a record|audit log|audit trail|who edited this|change history|track changes|who made this change|activity log',
    approvedAnswerMarkdown: `## Finding Audit History

OppsEra tracks changes at multiple levels:

### Platform Audit Log
- Go to **Accounting** → **Audit**
- Shows all write operations across the system (who, what, when)
- Filter by user, module, date range, or action type

### Customer-Specific History
- Open a customer profile → **Activity** tab
- Shows field-level changes, communications, visits, and tag changes

### Financial Audit Trail
- **GL Tender Audit Trail** — tracks every payment and its GL posting
- **Tag Audit Log** — tracks customer tag assignments and removals
- **Item Change Log** — tracks catalog item modifications

### Tips
- Every write operation that requires audit is automatically logged
- The audit log includes the old value and new value for changed fields
- Entries cannot be deleted or modified

**Permission required:** \`audit.view\``,
  },

  // ── POS (21–40) ─────────────────────────────────────────────────────────────

  {
    slug: 'pos-howto-ring-up-sale',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'how to ring up a sale|ring up sale|make a sale|start a transaction|sell an item|process a sale|how to use the POS|how do I sell something|ring something up|new sale',
    approvedAnswerMarkdown: `## Ringing Up a Sale

OppsEra has two POS modes — the workflow depends on which one you're using:

### Retail POS
1. Go to **POS** → **Retail**
2. Tap items from the **quick menu grid** or use the **search bar** to find items
3. Items appear in the **cart** on the right
4. Adjust quantities, add modifiers, or apply discounts as needed
5. When ready, click **Pay** or **Tender**
6. Select payment method (cash, card, gift card, etc.)
7. Complete the transaction

### F&B (Table Service) POS
1. Go to **POS** → **F&B**
2. **Open a tab** on a table from the floor plan
3. Add items from the menu, assigning courses (appetizer, entree, etc.)
4. **Send to Kitchen** when ready
5. When guests are done, **Present Check**
6. Process payment

### Quick Tips
- Use \`@\` in the search bar to search for customers
- Use \`#\` in the search bar to recall held orders
- Barcode scanning is supported via USB scanner

**Permission required:** \`orders.create\``,
  },
  {
    slug: 'pos-howto-apply-discount',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'apply a discount|add discount|promo code|apply promo|percentage off|dollar off|how to discount|give a discount|discount an item|coupon',
    approvedAnswerMarkdown: `## Applying Discounts at the POS

### Line-Item Discount (single item)
1. Select the item in the cart
2. Tap **Discount**
3. Choose a quick percentage (5%, 10%, 15%, 20%) or enter a custom amount
4. Select percentage or dollar amount
5. Confirm

### Order-Level Discount (entire order)
1. Tap the **Discount** button on the order toolbar
2. Enter a percentage or fixed dollar amount
3. Add a reason (required)
4. Confirm

### Notes
- **No promo code system** — discounts are applied manually
- Large discounts may require **manager PIN override**
- All discounts are tracked in reporting and can be reviewed by managers
- Customer-specific discount rules can be configured on the customer profile

**Permission required:** \`discounts.apply\``,
  },
  {
    slug: 'pos-corrections-void',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'void an item|void a transaction|void order|cancel transaction|remove item from order|void the whole order|undo a sale|cancel a sale|delete an item from order|void line item',
    approvedAnswerMarkdown: `## Voiding Items or Transactions

### Void a Single Item
1. Select the item in the cart/tab
2. Tap **Void**
3. Enter a **reason** (required)
4. Confirm with **manager PIN** (required)

The item will appear struck through and won't be charged.

### Void an Entire Order
1. Open the order
2. Tap **Order Actions** → **Void Order**
3. Enter a reason
4. Confirm with manager PIN

### Important
- Voids require \`orders.void\` permission AND manager PIN override
- Voided items still appear in the order history (for audit) but are excluded from totals
- In F&B, voiding an item also updates the KDS (kitchen display)
- If the order has already been paid, you may need to process a **refund/return** instead (see: how to process a refund)

**Permission required:** \`orders.void\` + Manager PIN`,
  },
  {
    slug: 'pos-corrections-refund-return',
    moduleKey: 'orders',
    route: '/orders',
    questionPattern:
      'issue a refund at POS|process a return|return an item|give money back|customer wants refund|how to refund|return merchandise|refund a transaction|process POS refund|take back an item',
    approvedAnswerMarkdown: `## Processing a Refund or Return

1. Go to **Orders**
2. Find the original order (search by order number or customer name)
3. Open the order detail
4. Click **Return** in the top-right corner
5. Select the items being returned and enter quantities
6. Select a **return reason**
7. Confirm the return

The system will:
- Create a return order linked to the original
- Reverse the payment (refund to original payment method)
- Update inventory if the items are tracked

### Notes
- Requires \`returns.create\` permission
- Card refunds go back to the original card via CardPointe
- Cash refunds require cash in the drawer
- This is for POS returns. For accounting-level credit memos, use **Customers → Billing**

**Permission required:** \`returns.create\``,
  },
  {
    slug: 'pos-hardware-receipt-printer',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'receipt printer not printing|printer not working|can\'t print receipt|receipt won\'t print|printer offline|no receipt printing|printer issue|receipt not coming out|print not working',
    approvedAnswerMarkdown: `## Receipt Printer Not Printing

OppsEra prints receipts via the browser's print system (80mm thermal printer format).

### Troubleshooting Steps
1. **Check printer hardware** — Is it powered on? Is the paper loaded? Any paper jam?
2. **Check connection** — USB or network cable securely connected?
3. **Check OS default printer** — The receipt printer must be set as the **default printer** in your operating system
4. **Try a test print** — Print a test page from your OS printer settings
5. **Check browser settings** — Make sure the browser isn't blocking print popups
6. **Try a different browser** — Chrome works best for thermal printing

### If It Still Doesn't Work
- Restart the printer
- Restart the browser
- Check if other applications can print to this printer
- If the printer prints from other apps but not OppsEra, it may be a browser configuration issue

**If basic troubleshooting doesn't resolve it, please contact support with your printer model and connection type (USB/network).**`,
  },
  {
    slug: 'pos-hardware-cash-drawer',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'cash drawer not opening|drawer won\'t open|cash register won\'t open|drawer stuck|cash drawer problem|till not opening|drawer doesn\'t pop|register drawer issue',
    approvedAnswerMarkdown: `## Cash Drawer Not Opening

Cash drawers typically open via a command sent through the **receipt printer** (RJ-11 cable from printer to drawer).

### Troubleshooting Steps
1. **Check the receipt printer** — If the printer isn't working, the drawer won't get the open command either. Fix the printer first.
2. **Check the physical connection** — Is the RJ-11 cable from the printer to the drawer securely connected?
3. **Is the drawer key-locked?** — Many cash drawers have a key lock that prevents electronic opening
4. **Try a manual open** — Use the drawer key to manually open and verify the mechanism isn't jammed
5. **Try a No Sale** — Use the **No Sale** drawer event button on the POS (requires \`cash.drawer\` permission) to send an explicit open command

### If the Drawer Opens Manually but Not Electronically
- The printer may not be sending the kick pulse
- Try a different RJ-11 cable
- Check if the printer model is compatible with your drawer

**If troubleshooting doesn't resolve it, please contact support.**

**Permission for No Sale:** \`cash.drawer\``,
  },
  {
    slug: 'pos-howto-split-check',
    moduleKey: 'orders',
    route: '/pos/fnb',
    questionPattern:
      'split a check|split payment|split bill|divide check|separate checks|split between people|split the tab|pay separately|how to split|multiple payments on one order',
    approvedAnswerMarkdown: `## Splitting Checks or Payments

There are several ways to split:

### Split Tender (One Check, Multiple Payments)
Use this when guests want to pay their share of one bill:
1. On the payment screen, click **Split Tender**
2. Add the first payment (e.g., $25 on Card A)
3. Add the second payment (e.g., $25 on Card B)
4. Continue until the full balance is covered

### Split Check (F&B — Separate Checks)
Use this when guests want separate checks:
1. Open the tab
2. Click **Split**
3. Choose a mode: **By Seat**, **Even Split**, or **Custom**
4. Drag items between checks (or let the system auto-split)
5. Each check can be paid independently

### Even Split
Divide the total evenly among N guests:
1. Click **Split** → **Even Split**
2. Enter the number of guests
3. Each guest's share is calculated automatically

### Rejoin Checks
If you split in error, use **Rejoin Checks** to undo the split.`,
  },
  {
    slug: 'pos-corrections-reopen-ticket',
    moduleKey: 'orders',
    route: '/orders',
    questionPattern:
      'reopen a closed ticket|reopen a closed order|reopen tab|undo close|bring back closed order|ticket was closed too early|reopen transaction|reopen a check',
    approvedAnswerMarkdown: `## Reopening a Closed Ticket

1. Go to **Orders** (or find the tab in F&B)
2. Find the closed order/ticket
3. Click **Reopen**
4. The order returns to an editable state

### When to Use
- Forgot to add items before closing
- Need to apply a correction
- Guest wants to add to their order after paying

### Important Notes
- Requires \`orders.manage\` permission
- If the register shift or close batch has already been completed, reopening may affect the shift summary and Z-report
- Reopening reverses the closed/paid status — you'll need to close and re-tender the order when done

**Permission required:** \`orders.manage\``,
  },
  {
    slug: 'pos-howto-transfer-tab',
    moduleKey: 'fnb',
    route: '/pos/fnb',
    questionPattern:
      'transfer a tab|move tab to another server|transfer ticket|change server on tab|hand off tab|move order to different register|transfer to another server|reassign tab',
    approvedAnswerMarkdown: `## Transferring a Tab or Ticket

### Transfer to Another Server
1. Open the tab
2. Tap **Transfer**
3. Select the destination **server**
4. Confirm

### Transfer to Another Table
1. Open the tab
2. Tap **Transfer**
3. Select the destination **table**
4. Confirm

### Bulk Transfer (Shift Change)
When a server is leaving and needs to hand off all their tabs:
1. Go to **Manage Tabs** panel
2. Select multiple tabs
3. Use **Bulk Transfer**
4. Select the receiving server

**Permission required:** \`pos_fnb.tabs.transfer\``,
  },
  {
    slug: 'pos-billing-card-declined',
    moduleKey: 'payments',
    route: '/pos/retail',
    questionPattern:
      'card declined|payment declined|card not working|why did the card get declined|card rejected|payment failed|card won\'t go through|card denied|transaction declined',
    approvedAnswerMarkdown: `## Card Payment Declined

When a card is declined, the POS displays the reason from the payment processor (CardPointe).

### Common Decline Reasons
- **Insufficient funds** — Customer doesn't have enough balance
- **Expired card** — Card is past its expiration date
- **Incorrect PIN** — Wrong PIN entered (debit cards)
- **Card restricted** — The card issuer has placed a restriction
- **Suspected fraud** — The issuer flagged the transaction
- **Do Not Honor** — Generic decline from the card issuer

### What to Do
1. Ask the customer to try a **different card**
2. Suggest an **alternative payment method** (cash, gift card)
3. If the terminal shows a specific error code, note it for support

### If the Terminal Didn't Respond at All
That's a different issue — the terminal may be **offline**. See: "Why is the credit card terminal offline?"

**Note:** OppsEra cannot override a decline — it comes from the customer's card issuer.`,
  },
  {
    slug: 'pos-hardware-terminal-offline',
    moduleKey: 'payments',
    route: '/pos/retail',
    questionPattern:
      'card terminal offline|terminal not connecting|credit card reader offline|terminal not responding|can\'t connect to terminal|payment device offline|card machine not working|terminal disconnected',
    approvedAnswerMarkdown: `## Credit Card Terminal Offline

OppsEra uses **CardPointe Bolt** terminals for card-present payments.

### Troubleshooting Steps
1. **Check terminal power** — Is it plugged in and turned on?
2. **Check network connection** — The terminal connects via Ethernet or WiFi
3. **Restart the terminal** — Power off, wait 10 seconds, power on
4. **Check the CardPresentIndicator** — On the POS screen, look for the terminal status icon:
   - Green = connected
   - Yellow = connecting
   - Red = offline
5. **Verify HSN** — The terminal's Hardware Serial Number must be configured in your settings
6. **Check network/firewall** — The terminal must be able to reach CardPointe's servers

### If It Still Won't Connect
- Verify the terminal's HSN matches what's configured in the system
- Try a different network cable or WiFi network
- Check if other devices on the same network have internet access

**If basic troubleshooting doesn't resolve it, contact support with your terminal model and HSN.**`,
  },
  {
    slug: 'pos-howto-custom-item',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'add custom item|open price item|misc item|one-time item|item not in system|ring up something not in catalog|create ad hoc item|ring up miscellaneous|open ring',
    approvedAnswerMarkdown: `## Adding a Custom or Open-Priced Item

1. On the POS, click the **Custom Item** or **MISC** button
2. Enter a **name** for the item
3. Enter the **price**
4. Set the **quantity**
5. The item is added to the cart as a one-time entry

This creates a line item with a placeholder SKU — it won't affect inventory or catalog.

### When to Use
- Selling an item not yet in the catalog
- One-time charges or services
- Special requests

**Permission required:** May require \`price.override\` depending on configuration`,
  },
  {
    slug: 'pos-config-edit-menu',
    moduleKey: 'catalog',
    route: '/catalog',
    questionPattern:
      'change menu items|edit menu|change pricing|update item price|modify menu|add modifier|change modifiers|edit item in catalog|update menu item|change item details',
    approvedAnswerMarkdown: `## Changing Menu Items, Modifiers, or Pricing

### Edit an Item
1. Go to **Catalog** → **Items**
2. Find the item you want to change
3. Click to open the item detail
4. Click **Edit**
5. Make your changes (name, price, description, category, modifiers, tax group, inventory tracking)
6. **Save**

### Edit Modifiers
1. On the item edit page, scroll to the **Modifier Groups** section
2. Add, remove, or edit modifier groups and their options
3. Set min/max selections, default options, and pricing for each modifier option

### Edit Pricing
- Prices in the catalog are stored in **dollars** (e.g., "12.99")
- When sold at POS, prices are automatically converted to **cents** for calculation
- Price changes take effect **immediately** on the POS

**Permission required:** \`catalog.manage\`

**Tip:** Changes to items, modifiers, and pricing are reflected on the POS right away — no restart or refresh needed.`,
  },
  {
    slug: 'pos-howto-clock-in-out',
    moduleKey: 'fnb',
    route: '/pos/fnb',
    questionPattern:
      'clock in|clock out|time clock|punch in|punch out|start shift|end shift|time tracking|log hours|track work hours',
    approvedAnswerMarkdown: `## Clock In / Clock Out

**OppsEra does not have a dedicated time-clock or employee hour tracking module.**

### What IS Available
- **Server PIN Login** (F&B) — Servers enter a 4-digit PIN to identify themselves on a shared terminal. This is for POS session management, not time tracking.
- **Register Shift** (Retail) — Opening and closing a shift tracks the register session, not employee hours.

### If You Need Time Tracking
Use a dedicated time-and-attendance system alongside OppsEra. Popular options integrate via their own hardware (fingerprint scanners, badge readers) or mobile apps.

### Were You Looking For Something Else?
- **"How do I open a register shift?"** — See: How to close out the register
- **"How do I log in as a server?"** — Enter your 4-digit server PIN on the F&B POS`,
  },
  {
    slug: 'pos-troubleshoot-tax-error',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'tax wrong on sale|POS tax incorrect|tax not calculating right at register|wrong tax at POS|sale shows wrong tax|tax amount is off|register tax issue',
    approvedAnswerMarkdown: `## Tax Not Calculating Correctly on a Sale

### Quick Checks
1. **Is the order marked tax-exempt?** — Check if the tax-exempt toggle is on for this order
2. **Is the item assigned to a tax group?** — Go to Catalog → find the item → check Tax Group assignment
3. **Is the tax rate correct for this location?** — Go to Accounting → Tax and verify rates
4. **Inclusive vs. exclusive** — Is the item using tax-inclusive pricing? This changes whether tax is added on top or embedded

### How Tax Works
- Tax rates are configured per item via tax groups
- All math uses **integer cents** to avoid rounding errors
- Tax is calculated per line item, then summed
- Rounding uses proportional allocation with last-rate remainder (guarantees exact totals)

### If the Rate Itself Is Wrong
Tax rates are manually configured. If your local tax rate changed, you need to update it in **Accounting → Tax**. Changes only apply to new orders.

**If you believe the tax engine itself is miscalculating (not a config issue), please escalate with a specific order number.**`,
  },
  {
    slug: 'pos-howto-close-register',
    moduleKey: 'orders',
    route: '/pos/close',
    questionPattern:
      'close the register|close out register|end of day|close shift|cash out|Z report|end of day close|close the till|register closeout|close batch',
    approvedAnswerMarkdown: `## Closing the Register / End of Day

### Retail POS
1. Click **Close Shift**
2. Count your cash by denomination (bills and coins)
3. Enter the **counted total**
4. Optionally add notes
5. Review the **shift summary**:
   - Sales count and total
   - Cash, card, and other tenders received
   - Tips collected
   - Paid-in, paid-out, cash drops
   - Opening balance, expected cash, counted cash
   - **Variance** (green = balanced, blue = over, red = short)
6. Confirm and close

### F&B Close Batch
1. Go to **POS** → **Close**
2. Complete **server checkouts** — each server's tabs, sales, tips, and cash owed
3. Complete the **cash count**
4. Review the **Z-Report** (gross sales, discounts, comps, voids, net sales, tax, tender breakdown, tips, covers)
5. **Post batch to GL** to finalize

**Permission required:** \`shift.manage\` (retail), \`pos_fnb.close_batch\` (F&B)`,
  },
  {
    slug: 'pos-troubleshoot-inventory-not-updating',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'inventory not updating after sale|stock not decreasing|sold item but inventory same|POS not deducting inventory|count not changing after sale|inventory stuck|sales not reducing stock',
    approvedAnswerMarkdown: `## Inventory Not Updating After Sales

### Most Likely Cause
The item's **Track Inventory** flag is not enabled.

### How to Fix
1. Go to **Catalog** → **Items**
2. Find the item
3. Click **Edit**
4. Look for the **Track Inventory** toggle
5. Enable it
6. Save

Only items with inventory tracking enabled will decrement when sold at POS.

### Other Possible Causes
- **Different location** — The sale may have occurred at a different location than where inventory is stocked
- **Item uses a different SKU** — The POS item and inventory item may not be linked correctly

### How to Verify
- Check the item's **Inventory Movements** history to see if sale events are being recorded
- The POS item grid shows an **inventory indicator** (green = in stock, amber = low, red = out) for tracked items

**Permission to edit items:** \`catalog.manage\``,
  },
  {
    slug: 'pos-howto-reprint-receipt',
    moduleKey: 'orders',
    route: '/orders',
    questionPattern:
      'reprint receipt|print receipt again|get another copy of receipt|reprint a receipt|duplicate receipt|copy of receipt|print old receipt|receipt copy|reprint ticket',
    approvedAnswerMarkdown: `## Reprinting a Receipt

1. Go to **Orders**
2. Find the order (search by order number, customer, or date)
3. Open the order detail
4. Click **Print Receipt**

The receipt will print to your default printer.

### Alternatives
- **Email receipt** — From the same order detail, click **Email Receipt** to send a digital copy to the customer's email
- **Kitchen chits** — To reprint a kitchen chit, use the **Reprint** option from KDS management

**No special permission required** to reprint receipts.`,
  },
  {
    slug: 'pos-config-assign-register',
    moduleKey: 'orders',
    route: '/pos/retail',
    questionPattern:
      'assign register to employee|change register|set up register|register assignment|which register am I on|employee register setup|assign terminal|switch register',
    approvedAnswerMarkdown: `## Assigning a Register to an Employee

OppsEra uses **session-based** register assignment, not permanent mappings.

### F&B POS
- Servers identify themselves by entering their **4-digit PIN** on a shared terminal
- Multiple servers can use the same physical terminal
- Each server's tabs and sales are tracked by their PIN

### Retail POS
- An employee **opens a shift** on a specific register
- That register is "theirs" for the duration of the shift
- To change registers: close the shift on the current register, open a new shift on the desired register

### Setting Up Server PINs
Server PINs are configured in user management (Settings → Users). Each server gets a unique 4-digit PIN.

**Permission required:** \`shift.manage\` (to open/close shifts), \`users.manage\` (to set up PINs)`,
  },
  {
    slug: 'pos-troubleshoot-kds-not-receiving',
    moduleKey: 'kds',
    route: '/pos/fnb',
    questionPattern:
      'order not going to KDS|kitchen not receiving orders|KDS not showing tickets|order didn\'t send to kitchen|kitchen display not working|printer not getting order|nothing on kitchen screen|KDS issue|food not getting sent',
    approvedAnswerMarkdown: `## Order Not Appearing on KDS or Kitchen Printer

This is a multi-step diagnostic:

### Step 1: Was the Order Actually Sent?
Items stay in **draft** until you press **Send to Kitchen** (or **Fire Course**). Check if the items have a "sent" status on the tab.

### Step 2: Is a KDS Station Configured?
- Check if a KDS station exists for your location
- Each station routes specific item categories (e.g., "grill" station vs "bar" station)

### Step 3: Is the KDS Terminal Online?
- KDS terminals send a heartbeat — check if the terminal shows as active
- Look for the terminal status indicator on the KDS display

### Step 4: Item Routing
The routing logic checks in order:
1. **Item-level** station assignment
2. **Category-level** station assignment
3. **Location default** station

If none are configured, the item has nowhere to route.

### Step 5: Check Send Tracking
The system logs every dispatch attempt in \`fnb_kds_send_tracking\`. The **KDS diagnostics** tool can help identify routing failures.

### For Kitchen Printers
Check printer routing rules: station-specific → location-level → terminal receipt printer fallback.

**If the issue persists, please provide the order number so we can check the routing logs.**`,
  },

  // ── Reservations (41–60) ────────────────────────────────────────────────────

  {
    slug: 'res-howto-create-reservation',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'create a reservation|make a reservation|book a room|new reservation|new booking|how to reserve|book a table|schedule an appointment|make a booking',
    approvedAnswerMarkdown: `## Creating a New Reservation

OppsEra handles three types of reservations:

### Hotel Room Reservation (PMS)
1. Go to **PMS** → **Reservations** → **New Reservation**
2. Search for or create a **guest profile**
3. Select **room type**, **check-in** and **check-out** dates
4. Choose a **rate plan**
5. Add special requests or notes
6. Click **Create Reservation**

The system will check availability, calculate nightly rates + tax, and create a folio.

### Spa Appointment
1. Go to **Spa** → **Appointments** → **New Appointment**
2. Select the **service(s)**
3. Choose a **provider** (or leave as any-available)
4. Select a **date and time** from available slots
5. Add customer information
6. Confirm booking

### Dining Reservation
1. Go to the **Host Stand**
2. Use the **Reservation Timeline** to add a new reservation
3. Enter party name, size, date, and time

**Permissions:** \`pms.reservations.create\`, \`spa.appointments.create\`, or \`pos_fnb.host.*\``,
  },
  {
    slug: 'res-corrections-modify-cancel',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'modify reservation|cancel reservation|change a booking|edit a reservation|cancel a booking|update reservation|change dates|cancel appointment|reschedule',
    approvedAnswerMarkdown: `## Modifying or Cancelling a Reservation

### Hotel Reservation (PMS)
**Modify:** Open the reservation → click **Edit** → change dates, room type, notes, or special requests → **Save**

**Cancel:** Open the reservation → click **Cancel** → confirm. This deactivates the room block and closes the folio. If a deposit was collected, you may need to process a refund separately.

### Spa Appointment
**Reschedule:** Open the appointment → click **Reschedule** → select new time/provider → confirm.

**Cancel:** Open the appointment → click **Cancel**. The cancellation engine calculates fees:
- Less than 4 hours notice: 100% fee
- 4–12 hours: 75% fee
- 12–24 hours: 50% fee
- More than 24 hours: no fee
- First-cancellation grace and VIP exemptions may apply

Deposit refund = deposit amount minus cancellation fee.

### Dining Reservation
Edit or remove from the host stand reservation timeline.

**Note:** Cancellation fees and windows are configurable in settings.`,
  },
  {
    slug: 'res-availability-time-slot',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'time slot not available|why can\'t I book|date unavailable|no availability|slot unavailable|why is it blocked|can\'t make reservation for this date|no rooms available|fully booked',
    approvedAnswerMarkdown: `## Why a Time Slot or Date Is Unavailable

### Hotel Rooms (PMS)
- **All rooms booked** — All rooms of that type are reserved for those dates
- **Room out of order** — The room is marked as out-of-order for maintenance
- **Rate restriction** — The rate plan may have a closed-to-arrival, min-stay, max-stay, or stop-sell restriction for that date
- **Group block** — A group booking may have consumed the available inventory

**Check:** PMS → Calendar to see what's occupying the rooms.

### Spa Appointments
- **Provider unavailable** — The provider has time-off or is outside their availability window
- **Provider busy** — Another appointment at that time
- **Resource busy** — The required room/equipment is booked
- **Customer overlap** — The same customer already has an appointment at that time
- **Provider not eligible** — The selected provider can't perform that service

**Check:** Spa → Calendar to see provider schedules.

### Dining
- **Table capacity** — All tables are reserved or occupied
- **Closed time window** — Outside configured booking hours

**Check:** Host Stand floor map for real-time table status.`,
  },
  {
    slug: 'res-howto-add-guest',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'add guest to reservation|add person to booking|add another guest|additional guest|add companion|more people on reservation|increase party size',
    approvedAnswerMarkdown: `## Adding a Guest to an Existing Reservation

### Hotel (PMS)
1. Open the reservation
2. Add additional **linked guest profiles** to the reservation
3. Save

### Spa
1. Open the appointment
2. Click **Add Service** to add additional services for the new guest
3. Multi-service appointments support multiple guests

### Dining
1. On the Host Stand, find the reservation on the timeline
2. Edit the reservation and increase the **party size**
3. Verify the table can accommodate the larger party

**Note:** For PMS, adding a guest doesn't change the room type or rate unless you switch to a larger room. For spa, each additional person needs their own service line.`,
  },
  {
    slug: 'res-howto-move-reservation',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'move reservation|change table|change room|different time|reschedule booking|switch rooms|change assigned room|drag reservation|move to another table',
    approvedAnswerMarkdown: `## Moving a Reservation

### Hotel (PMS)
- **Change room:** Open the reservation → click **Move** → select a new room (system checks availability) → confirm
- **Change dates:** Open the reservation → click **Resize** → select new check-in/check-out dates → confirm (recalculates rates)
- **Calendar:** You can also drag reservations on the PMS Calendar to move them

### Spa
- Open the appointment → click **Reschedule** → select a new date, time, or provider → confirm

### Dining
- On the Host Stand timeline, drag the reservation to a new time
- Or edit the reservation and change the table assignment

**Note:** Moving a hotel reservation recalculates rates based on the new dates and rate plan. Moving a spa appointment checks the new provider's availability.`,
  },
  {
    slug: 'res-howto-check-in',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'check in guest|mark as arrived|guest arrived|check in a reservation|front desk check in|mark arrived|guest is here|arrival check-in',
    approvedAnswerMarkdown: `## Checking In a Guest

### Hotel (PMS)
1. Go to **PMS** → **Reservations** or **Front Desk**
2. Find the reservation
3. Click **Check In**
4. The system will:
   - Auto-assign a room if not pre-assigned
   - Post the first night's room charges to the folio
   - Update the room status to OCCUPIED
   - Start the nightly charge posting schedule
5. Early check-in is supported — the system adjusts dates automatically

### Spa
1. Open the appointment
2. Click **Check In**
3. The appointment moves to "Checked In" status, ready for service

### Dining
1. On the Host Stand, find the guest on the waitlist or reservation timeline
2. Click **Mark Arrived** or **Seat** to assign them to a table
3. Guests can also self-check-in via QR code

**Permission:** \`pms.front_desk.check_in\`, \`spa.appointments.manage\``,
  },
  {
    slug: 'res-howto-no-show',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'handle no show|late arrival|guest didn\'t show up|no show|mark as no show|what to do about no show|guest never arrived|no show fee',
    approvedAnswerMarkdown: `## Handling No-Shows and Late Arrivals

### Hotel (PMS)
1. Open the reservation
2. Click **No-Show** (only available after the check-in date has passed)
3. The system deactivates the room block and updates the reservation status
4. No-shows can also run automatically via a **nightly auto-no-show job** with a configurable grace period

### Spa
1. Open the appointment
2. Click **No-Show**
3. The **no-show fee engine** calculates the fee (configurable, defaults to 100% of service price)
4. The fee is offset against any deposit already collected:
   - If fee > deposit → remaining amount is charged
   - If fee ≤ deposit → excess deposit is refunded
5. Waiver rules may apply: first no-show grace, VIP/Platinum member exemption

### Dining
On the Host Stand, you can remove the guest from the reservation timeline or mark them as a no-show for tracking.

### Reporting
No-show data feeds into reports: PMS Managers Report, Spa Reporting Dashboard.`,
  },
  {
    slug: 'res-config-block-resources',
    moduleKey: 'pms',
    route: null,
    questionPattern:
      'block off rooms|block off tables|block time off|close a room|mark room unavailable|out of order|block off resource|maintenance block|block off calendar',
    approvedAnswerMarkdown: `## Blocking Off Resources

### Hotel Rooms
- **Out of Order:** Go to PMS → Rooms → select room → **Set Out of Order**. This removes the room from availability.
- **Maintenance Block:** Create a room block of type MAINTENANCE with a date range. The room is blocked for those dates.
- **House Use:** Block type HOUSE_USE for internal/complimentary use.

### Spa Resources
- **Provider Time-Off:** Go to Spa → Providers → select provider → **Add Time Off** (date range + reason). The provider won't appear in availability.
- **Resource/Room:** Manage resource availability from Spa → Resources.

### Dining Tables
- Tables are managed from the **Floor Plan Editor**
- You can change table status (available, reserved, occupied, closed) from the host stand

### Note on Golf
Golf tee time management is not currently available in the web application.`,
  },
  {
    slug: 'res-config-booking-rules',
    moduleKey: 'pms',
    route: '/pms/rate-plans',
    questionPattern:
      'booking rules|minimum notice|cancellation window|cancellation policy|minimum stay|advance booking|booking restrictions|how far in advance|cancellation fee setup',
    approvedAnswerMarkdown: `## Configuring Booking Rules and Cancellation Policies

### Hotel (PMS)
**Rate Restrictions** — configured per rate plan:
1. Go to **PMS** → **Rate Plans** → select or create a rate plan
2. Set restrictions:
   - **Minimum stay** — minimum number of nights required
   - **Maximum stay** — maximum number of nights allowed
   - **Closed to arrival** — no check-ins on specific dates
   - **Closed to departure** — no check-outs on specific dates
   - **Stop sell** — completely block a rate plan for specific dates

**Deposit Policy:**
- Configure per property: first night, percentage, or fixed amount
- Charge timing: at booking or N days before arrival

### Spa
Go to **Spa** → **Settings**:
- **Cancellation window** — hours before appointment (e.g., 24 hours)
- **Cancellation fee tiers** — different percentages by notice period
- **No-show fee** — separate fee configuration
- **Deposit requirement** — percentage or flat amount
- **Waivers** — first-cancellation grace, VIP exemption

### Dining (Host Stand)
Go to **Host** → **Waitlist Config**:
- Max party size
- Time windows
- Auto-quote wait times
- SMS notification settings`,
  },
  {
    slug: 'res-notifications-not-received',
    moduleKey: 'pms',
    route: null,
    questionPattern:
      'customer didn\'t get confirmation|email not received|text not received|confirmation not sent|no confirmation email|guest didn\'t get email|SMS not delivered|booking confirmation missing',
    approvedAnswerMarkdown: `## Customer Not Receiving Confirmation

### Troubleshooting Steps
1. **Verify contact info** — Is the customer's email address/phone number correct on their profile?
2. **Check spam/junk** — Ask the customer to check spam folders
3. **Check message log** — PMS maintains a communication log showing delivery status
4. **Verify template exists** — PMS uses message templates. Ensure a confirmation template is configured for this event type.

### Email
- Spa booking confirmations are sent automatically and are **non-fatal** (if sending fails, the booking still succeeds but the error is logged)
- PMS emails use the \`send-reservation-message\` command with configurable templates
- Check that your email service is properly configured

### SMS
- SMS is sent via Twilio. Verify:
  - Twilio is configured with valid credentials
  - The customer's phone number includes the country code
  - Your Twilio account has sufficient balance

### Resend
You can manually resend from the reservation or appointment detail page.

**If messages are consistently not delivering, please escalate — there may be an email/SMS service configuration issue.**`,
  },
  {
    slug: 'res-notifications-resend-confirmation',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'resend confirmation|send confirmation again|re-send booking email|resend reservation email|send another confirmation|resend text confirmation|email confirmation again',
    approvedAnswerMarkdown: `## Resending a Confirmation

### Hotel (PMS)
1. Open the reservation
2. Click **Send Message** or **Resend Confirmation**
3. Select the template (email or SMS)
4. Confirm

The communication is logged in the message history.

### Spa
1. Open the appointment
2. Click **Resend Confirmation**
3. The booking confirmation email is re-sent to the customer's email on file

Spa confirmation emails include:
- Service, provider, date/time, duration, price
- Deposit paid and cancellation policy
- "Manage Appointment" link
- Google Calendar and Outlook Calendar add links

### Notes
- Make sure the customer's email/phone is correct before resending
- Each send is logged for audit`,
  },
  {
    slug: 'res-billing-collect-deposit',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'collect a deposit|take a deposit|prepayment|take payment upfront|collect deposit for reservation|require deposit|charge deposit|advance payment|booking deposit',
    approvedAnswerMarkdown: `## Collecting a Deposit or Prepayment

### Hotel (PMS)
Deposits use Stripe for card authorization:
1. Open the reservation
2. Click **Collect Deposit**
3. Enter or select the guest's payment method
4. The system creates an **authorization hold** (not a charge) for the deposit amount
5. The hold can be **captured** later (at check-in or per your policy)

**Deposit policy options** (configured per property):
- **First night** — deposit = one night's rate
- **Percentage** — deposit = X% of total stay
- **Fixed amount** — deposit = flat dollar amount
- **Charge timing** — at booking or N days before arrival

### Spa
Deposits are collected as part of the booking flow:
- Amount calculated from spa settings (percentage or flat)
- **Auto-waived** for walk-in bookings, front desk bookings, and Platinum/VIP members
- Manual override amount supported

**Note:** PMS uses Stripe for deposits. POS uses CardPointe for payment processing. These are separate payment systems.`,
  },
  {
    slug: 'res-billing-refund-deposit',
    moduleKey: 'pms',
    route: '/pms/reservations',
    questionPattern:
      'refund deposit|return deposit|give deposit back|cancel and refund|deposit refund|get deposit back|refund prepayment|refund a booking deposit',
    approvedAnswerMarkdown: `## Refunding a Deposit

### Hotel (PMS)
1. Open the reservation
2. Go to the payment/folio section
3. Find the deposit transaction
4. Click **Refund**
5. The system processes a Stripe refund to the original card

**Note:** Whether a full or partial refund is appropriate depends on your deposit/cancellation policy.

### Spa
Deposit refunds are automatically calculated by the **cancellation engine**:
- Refundable amount = deposit minus cancellation fee
- If the cancellation fee exceeds the deposit, the remaining amount is charged
- If the deposit exceeds the fee, the excess is refunded

**Cancellation fee tiers** (configurable):
- Less than 4 hours: 100% fee
- 4–12 hours: 75% fee
- 12–24 hours: 50% fee
- 24+ hours: no fee

**Waiver rules:** First-cancellation grace, VIP/Platinum member exemption, walk-in bookings.

**High-value refunds should be reviewed by a manager.** If there's a dispute about the refund amount, escalate to finance.`,
  },
  {
    slug: 'res-config-capacity-limits',
    moduleKey: 'pms',
    route: null,
    questionPattern:
      'capacity limits|max party size|maximum occupancy|set capacity|limit bookings|max guests|max seats|how many can I book|room capacity',
    approvedAnswerMarkdown: `## Setting Capacity Limits

### Hotel (PMS)
- **Room types** have a max occupancy setting
- The \`count-available-rooms-by-type\` query enforces this when checking availability
- Configure room types in PMS settings

### Spa
- **Provider schedules** limit concurrent appointments per provider
- **Resources** (rooms, equipment) have capacity constraints
- The availability engine respects both when returning available slots

### Dining (Host Stand)
- **Max party size** — configure in Host → Waitlist Config
- **Table capacity** — set per table in the Floor Plan editor
- **Cover balance** — the host stand shows a real-time cover balance (total capacity vs. current/upcoming guests)

### Tips
- PMS: Edit room types to set max occupancy
- Spa: Edit provider availability windows and resource capacity
- Dining: Edit tables in the floor plan editor and waitlist config for party size limits`,
  },
  {
    slug: 'res-howto-recurring-reservation',
    moduleKey: 'spa',
    route: '/spa/appointments/new',
    questionPattern:
      'recurring reservation|recurring booking|repeat booking|recurring appointment|weekly appointment|standing reservation|repeating booking|regular booking|series booking',
    approvedAnswerMarkdown: `## Creating Recurring Reservations or Appointments

### Spa — Recurring Appointments
Spa has a dedicated **create recurring appointment** feature:
1. Go to **Spa** → **Appointments** → **New Appointment**
2. Set up the appointment details (service, provider, time)
3. Select **Recurring**
4. Choose the frequency (weekly, biweekly, etc.) and end date
5. The system creates individual appointments for each occurrence

### Hotel (PMS) — No Native Recurring
PMS does not have a recurring reservation feature. Alternatives:
- **Group bookings** — for block reservations over a date range
- **Create individual reservations** — manually create each one

### Dining — No Recurring
The host stand does not support recurring dining reservations. Each reservation must be created individually.`,
  },
  {
    slug: 'res-howto-manage-waitlist',
    moduleKey: 'pms',
    route: null,
    questionPattern:
      'manage waitlist|waitlist management|how does the waitlist work|add to waitlist|view waitlist|waitlist queue|waiting list|join waitlist|waitlist settings',
    approvedAnswerMarkdown: `## Managing the Waitlist

OppsEra has **three separate waitlist systems** depending on the product area:

### Dining Waitlist (Host Stand)
The most interactive waitlist — designed for walk-in guests:
1. Go to the **Host Stand**
2. **Add** a guest to the waitlist (name, party size, notes)
3. The system estimates wait time
4. When a table opens, **Offer Table** to the guest
5. If accepted, **Seat** them directly from the waitlist
6. **SMS notifications** can be sent to notify guests when their table is ready

Features: analytics, merge/split entries, bump priority, waitlist quotes, QR code for guest self-join.

### Hotel Waitlist (PMS)
For when rooms are sold out:
- Guests are added with **date flexibility** preferences (exact, ±1 day, ±3 days, ±1 week, any)
- When a cancellation occurs, the **scoring engine** ranks waitlist entries by room type match, date overlap, flexibility, and VIP/deposit status
- Offers are sent automatically; guests can accept or decline

### Spa Waitlist
For when preferred providers or times are unavailable:
- Managed from Spa → Waitlist
- **Rebooking engine** suggests alternatives when slots open up
- Waitlist stats available for analytics

**Permissions:** Vary by product area.`,
  },
  {
    slug: 'res-howto-assign-resources',
    moduleKey: 'pms',
    route: null,
    questionPattern:
      'assign to staff|assign to table|assign to room|assign provider|assign resource|which room|which table|assign server|resource assignment|assign specific room',
    approvedAnswerMarkdown: `## Assigning Reservations to Staff, Tables, or Resources

### Hotel — Room Assignment
- **Pre-assign:** On the reservation, select a specific room from the available rooms of that type
- **Auto-assign at check-in:** Leave the room unassigned — the system's **room assignment engine** will pick the best available room at check-in
- **Move:** Use the Move command to change the assigned room after check-in

### Spa — Provider Assignment
- **Pre-assign:** When creating the appointment, select a specific provider
- **Any-available:** Leave the provider as "any" and the availability engine shows all eligible providers' slots
- **Reassign:** Reschedule the appointment to change providers

### Dining — Table Assignment
- **From the host stand:** Select a waitlist entry or reservation, then click a table on the floor plan to seat them
- **Assign mode:** The host stand has an explicit "assign mode" for seating workflow
- **Server assignment:** Tables belong to server sections; seating at a table auto-assigns the server

All systems support both pre-assignment (at booking time) and at-service-time assignment.`,
  },
  {
    slug: 'res-troubleshoot-double-booking',
    moduleKey: 'pms',
    route: null,
    questionPattern:
      'double booking|overlapping reservations|two bookings same time|overbooking|double booked|overlap conflict|same room booked twice|booking conflict|concurrent bookings',
    approvedAnswerMarkdown: `## Double Bookings or Overlapping Reservations

This should not normally happen — OppsEra has availability checks built into every booking path.

### What to Check First
1. **Was a restriction override used?** — Staff can override rate restrictions when creating reservations. If someone overrode availability, that could cause a conflict.
2. **Group blocks** — Group bookings reserve blocks of rooms. If individual reservations were also made for the same rooms, there may be overlap.
3. **Channel manager** — If external booking channels are configured, simultaneous bookings from different sources could create a race condition.

### For Spa
- Check if the provider was manually double-booked by different staff members
- The conflict detector checks for: provider_busy, resource_busy, and customer_overlap

### What to Do
1. Identify which booking should take priority
2. Move or cancel the other booking
3. If this is happening repeatedly, **please escalate to support** — it may indicate a concurrency issue that needs investigation

**This is likely a bug if it's happening without override. Please provide specific booking IDs when reporting.**`,
  },
  {
    slug: 'res-integrations-calendar-sync',
    moduleKey: 'pms',
    route: null,
    questionPattern:
      'sync with Google Calendar|calendar sync|sync reservations|Outlook sync|external calendar|Google Calendar integration|sync with calendar app|calendar integration|iCal sync',
    approvedAnswerMarkdown: `## Calendar Sync and External Channel Integration

### What's Currently Available

**Spa — Calendar Links (One-Way)**
Spa booking confirmation emails include:
- **Google Calendar** deep-link (adds the appointment to Google Calendar)
- **Outlook Calendar** deep-link (adds to Outlook)

These are one-way "add to calendar" links — there is no two-way sync.

**PMS — Channel Manager (Infrastructure Only)**
The system has the infrastructure for OTA/channel manager integration:
- Create and configure channels
- Sync tracking and logging
- Credential and mapping storage

However, actual OTA API adapters (Booking.com, Expedia, etc.) are **not yet connected**. The plumbing is in place for future implementation.

### What's NOT Available
- Two-way Google Calendar sync
- iCal feed export
- Real-time external calendar sync
- Live OTA channel integration

### Workaround
For now, use the calendar deep-links in confirmation emails to add individual bookings to personal calendars. For bulk calendar management, the PMS Calendar and Spa Calendar views within OppsEra are the primary scheduling tools.`,
  },
  {
    slug: 'res-reporting-booking-reports',
    moduleKey: 'pms',
    route: '/pms/reports',
    questionPattern:
      'booking reports|reservation reports|cancellation report|no show report|occupancy report|utilization report|booking analytics|reservation analytics|how many bookings',
    approvedAnswerMarkdown: `## Reservation and Booking Reports

### Hotel (PMS) Reports
Go to **PMS** → **Reports**:
- **Managers Report** — The comprehensive daily report:
  - Revenue by category (room, other, adjustments, taxes, fees)
  - Guest activity: arrivals, walk-ins, group arrivals, departures, stayovers, no-shows, cancellations
  - Statistics: rooms sold, occupancy %, ADR (avg daily rate), RevPAR (revenue per available room), avg length of stay
  - 7-day forward forecast with occupancy and revenue projections
  - Today / Period-to-Date / Year-to-Date columns
- **Occupancy Forecast** — Forward-looking daily occupancy with arrivals/departures
- **Utilization Grid** — Room-by-room and aggregate utilization
- **Pickup Report** — Reservations booked within a date range
- **No-Show Report** — No-show tracking
- **Revenue by Room Type** — Revenue breakdown

### Spa Reports
Go to **Spa** → **Reports**:
- Total, completed, canceled, no-show appointment counts
- Revenue: service, addon, retail, tips
- Utilization rate, rebooking rate, online booking %
- Walk-in %, no-show rate
- Provider performance
- Service analytics
- Daily trends and KPI dashboard

All reports support date range filtering and CSV export.

**Permissions:** \`pms.reports.view\`, \`spa.reports.view\`, \`reports.export\` (for CSV)`,
  },

  // ── INVENTORY (Section 7: 61–100) ─────────────────────────────────────────

  {
    slug: 'inv-howto-add-new-item',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I add a new inventory item|add new item to inventory|create inventory item|new stock item|add product to inventory|how to set up a new inventory item|add item to stock',
    approvedAnswerMarkdown: `## How to Add a New Inventory Item

Inventory items are created automatically when you add a catalog item. The system links catalog items to inventory tracking per location.

### Steps
1. Go to **Catalog** from the main navigation
2. Click **New Item**
3. Fill in required fields: name, SKU, department, price
4. Under the **Inventory** section, ensure **Track Inventory** is enabled
5. Set the **Item Type** (retail, food, beverage, etc.)
6. Set the **Costing Method**: Weighted Average, FIFO, or Standard Cost
7. Optionally set **Reorder Point**, **Reorder Quantity**, and **Par Level**
8. Click **Save**

Once saved, the system automatically creates an inventory record for **every active location** in your tenant. Initial on-hand quantity is zero — use **Receiving** or an **Adjustment** to set starting quantities.

### Setting Up Vendor Information
1. Go to **Inventory** → **Vendors** → find or create the vendor
2. Link the item to the vendor with vendor SKU, cost, lead time, and pack size
3. Mark one vendor as **Preferred** for reorder suggestions

**Permission required:** \`catalog.manage\` to create the catalog item, \`inventory.manage\` to adjust quantities or manage vendors.`,
  },
  {
    slug: 'inv-howto-edit-existing-item',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I edit an existing item|edit inventory item|change item details|update item information|modify inventory item|how to update stock item|change item name or SKU',
    approvedAnswerMarkdown: `## How to Edit an Existing Inventory Item

### Editing Catalog Details (Name, SKU, Price)
1. Go to **Catalog** and find the item
2. Click the item to open its detail page
3. Click **Edit** and update the fields you need to change
4. Click **Save**

Changes to the catalog item (name, SKU) are reflected in the inventory views.

### Editing Inventory-Specific Settings
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item and click the action menu (three dots)
3. Click **Edit Item**
4. Update inventory settings:
   - **Costing Method** (Weighted Average, FIFO, Standard)
   - **Standard Cost** (for standard costing items)
   - **Reorder Point** and **Reorder Quantity**
   - **Par Level**
   - **Base Unit** and **Purchase Unit** with conversion ratio
   - **Allow Negative Stock** toggle
5. Click **Save**

**Permission required:** \`catalog.manage\` for catalog details, \`inventory.manage\` for inventory settings.`,
  },
  {
    slug: 'inv-howto-deactivate-archive-item',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I deactivate an item|archive inventory item|remove item from inventory|discontinue an item|how to archive an item|deactivate stock item|stop tracking an item|hide an item from inventory',
    approvedAnswerMarkdown: `## How to Deactivate or Archive an Inventory Item

Items are not deleted — they are archived (soft-deleted) to preserve movement history and audit trails.

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item and click the action menu (three dots)
3. Click **Deactivate** (or **Archive**)
4. Confirm the action

The item's status changes to **Archived** and it no longer appears in default inventory views, POS item lists, or reorder suggestions.

### Reactivating an Archived Item
1. In the inventory list, enable the **Show Archived** filter
2. Find the archived item
3. Click the action menu → **Reactivate**

### Important Notes
- Archiving an item does **not** delete its movement history — all past receipts, sales, adjustments, and transfers are preserved
- If the item has on-hand stock, consider adjusting it to zero or transferring it before archiving
- The underlying catalog item is also archived, removing it from POS and ordering

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-adjust-quantities',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I adjust inventory quantities manually|manual stock adjustment|change on hand quantity|correct inventory count|adjust stock level|how to manually change inventory|fix inventory quantity|inventory adjustment',
    approvedAnswerMarkdown: `## How to Adjust Inventory Quantities Manually

Use an inventory adjustment to correct on-hand quantities. Every adjustment creates an auditable movement record.

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item and click the action menu → **Adjust Quantity**
3. Enter the **quantity change** (positive to add, negative to subtract)
4. Enter a **reason** (required — this is recorded in the audit trail)
5. Optionally enter a unit cost for the adjustment
6. Click **Submit**

### How It Works
- The system creates an \`adjustment\` movement with the quantity delta you entered
- On-hand is recalculated as the sum of all movements — there is no manual override of the balance
- If the item has **Allow Negative** disabled and the adjustment would take on-hand below zero, the system will block it
- The adjustment is locked with \`SELECT FOR UPDATE\` to prevent race conditions if two people adjust at the same time

### When to Use Adjustments vs Other Options
- **Adjustment** — correcting a count discrepancy or setting initial stock
- **Shrink** — recording known loss (damage, theft, spoilage, expiry)
- **Transfer** — moving stock between locations
- **Receiving** — adding stock from a vendor delivery

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-troubleshoot-onhand-incorrect',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'why is my on-hand quantity incorrect|on hand wrong|stock count does not match|inventory quantity is wrong|system shows wrong quantity|physical count does not match system|why is inventory off|stock discrepancy',
    approvedAnswerMarkdown: `## Why Is My On-Hand Quantity Incorrect?

On-hand quantity is calculated as the **sum of all inventory movements** for that item at that location. If it doesn't match your physical count, one or more movements are missing or incorrect.

### Common Causes
1. **Unreceived deliveries** — Stock arrived physically but wasn't received in the system via a receiving receipt
2. **Unrecorded shrink** — Breakage, theft, spoilage, or expiration not entered as shrink records
3. **Transfers not posted** — Inventory moved between locations but not recorded as a transfer
4. **Track Inventory disabled** — The item's "Track Inventory" flag may be off, so POS sales don't decrement stock
5. **Voided receipt not reversed** — A receipt was voided but the reversal movements weren't created (check receipt status)
6. **Duplicate receipt** — A delivery was accidentally received twice
7. **POS event not processed** — The order event that triggers inventory deduction may have failed or been delayed

### How to Investigate
1. Go to the item in **Retail Inventory** or **F&B Inventory**
2. Open **Movement History** — this shows every transaction (receipts, sales, adjustments, transfers, shrink) with dates, quantities, and who performed them
3. Compare movements against your expected activity (deliveries, sales reports, transfers)
4. Look for gaps — a delivery with no matching receive, sales with no deduction, etc.

### How to Fix
- Record an **Adjustment** with the difference and a reason explaining the discrepancy
- For known causes (theft, damage), record as **Shrink** with the appropriate type

**Permission required:** \`inventory.view\` to investigate, \`inventory.manage\` to adjust.`,
  },
  {
    slug: 'inv-howto-transfer-between-locations',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I transfer inventory between locations|transfer stock|move inventory to another location|inventory transfer|send stock to another store|transfer between warehouses|move items between locations',
    approvedAnswerMarkdown: `## How to Transfer Inventory Between Locations

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item you want to transfer
3. Click the action menu → **Transfer**
4. Select the **Source Location** (defaults to your current location)
5. Select the **Destination Location**
6. Enter the **Quantity** to transfer
7. Optionally add a reason/note
8. Click **Submit**

### How It Works
- The system creates two linked movements: a \`transfer_out\` at the source and a \`transfer_in\` at the destination, grouped by a batch ID
- Source location stock is decremented and destination location stock is incremented simultaneously
- The transfer **always enforces** sufficient stock at the source — you cannot transfer more than what's on hand, even if the item has "Allow Negative" enabled
- Both the source and destination must already have an inventory record for the catalog item (this is created automatically when the item was first added to the catalog)

### Important Notes
- Transfers do not change item cost — the unit cost carries over from source to destination
- Both movements appear in the movement history for the respective locations
- If either location doesn't have an inventory record for the item, the transfer will fail

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-receive-from-po',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I receive inventory from a purchase order|receive PO|receive delivery|how to receive stock|receive shipment|receiving inventory|how to process a delivery|receive goods from vendor',
    approvedAnswerMarkdown: `## How to Receive Inventory from a Purchase Order

### Steps
1. Go to **Inventory** → **Receiving**
2. Click **New Receipt**
3. Select the **Vendor**
4. If receiving against a PO, link the **Purchase Order** — this pre-fills line items with ordered quantities and costs
5. For each line item:
   - Verify or enter the **Quantity Received**
   - Verify or enter the **Unit Cost**
   - Select the **Unit of Measure** (if different from base unit, the system converts automatically)
   - Optionally enter **Lot Number**, **Serial Numbers**, or **Expiration Date**
6. Add any **Freight/Shipping Charges** if applicable
7. Choose the **Freight Mode**:
   - **Allocate** — shipping cost is distributed into each item's landed cost
   - **Expense** — shipping cost goes to a GL expense account, not into item cost
8. If allocating shipping, choose the **Allocation Method**: by cost, by quantity, by weight, by volume, or manual
9. Review the receipt and click **Post**

### What Happens on Post
- The system creates \`receive\` movements for each line item
- Item costs are updated based on the costing method:
  - **Weighted Average**: blends the new cost with existing on-hand cost
  - **FIFO**: updates current cost to the new received landed unit cost
  - **Standard**: current cost remains unchanged
- Vendor records are updated with the latest cost and received date
- If linked to a PO, the PO's received quantities are updated and status may change to \`partially_received\` or \`closed\`
- The receipt number is auto-generated (format: RCV-YYYYMMDD-XXXXXX)

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-partial-receive-po',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I partially receive a purchase order|partial delivery|receive part of a PO|vendor short shipped|partial receipt|did not receive full order|some items missing from delivery|partial shipment',
    approvedAnswerMarkdown: `## How to Partially Receive a Purchase Order

If a vendor delivers only part of your order, you can receive what arrived and leave the rest open.

### Steps
1. Go to **Inventory** → **Receiving** → **New Receipt**
2. Select the vendor and link the **Purchase Order**
3. The system pre-fills all PO lines with ordered quantities
4. For each line, change the **Quantity Received** to match what actually arrived
5. Remove any lines that were not included in this delivery
6. Click **Post**

### What Happens
- Only the quantities you entered are received into inventory
- The PO status changes to **Partially Received** — it stays open for future receipts
- Each PO line tracks \`qty_received\` as a running total across all receipts
- You can create additional receipts against the same PO for subsequent deliveries
- When all lines are fully received, the PO status changes to **Closed**

### Tips
- Always verify quantities against the packing slip before posting
- Note any discrepancies in the receipt notes for vendor follow-up
- You can create multiple receipts against the same PO over time

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-return-to-vendor',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I return inventory to a vendor|vendor return|return stock to supplier|send back inventory|return damaged goods to vendor|vendor credit|return to vendor',
    approvedAnswerMarkdown: `## How to Return Inventory to a Vendor

To return inventory to a vendor, you void the original receipt (if the entire delivery is being returned) or record a negative adjustment.

### Option 1: Void the Entire Receipt
Use this if you're returning the entire delivery.
1. Go to **Inventory** → **Receiving**
2. Find the posted receipt for the delivery
3. Click **Void Receipt**
4. The system creates \`void_reversal\` movements that reverse all quantities and costs from the original receipt
5. Item costs are recalculated (weighted average items have the receipt's cost effect removed)

### Option 2: Partial Return via Adjustment
Use this if you're returning only some items from a delivery.
1. Go to the item in **Retail Inventory** or **F&B Inventory**
2. Click **Adjust Quantity**
3. Enter a **negative** quantity for the amount being returned
4. In the reason field, note the vendor return details (vendor name, reason)
5. Submit the adjustment

### Important Notes
- Only **posted** receipts can be voided — draft receipts can simply be deleted
- Voiding a receipt reverses all inventory and cost effects
- For accounting purposes, coordinate vendor returns with your AP team to ensure the vendor credit is applied

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-record-damage-loss-theft',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I record damaged inventory|record lost inventory|record stolen inventory|shrink|waste|record breakage|inventory loss|how to write off inventory|damaged goods|theft|spoilage',
    approvedAnswerMarkdown: `## How to Record Damaged, Lost, or Stolen Inventory

Use the **Shrink** function to record inventory losses. Shrink creates a permanent, auditable record with the specific loss type.

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item and click the action menu → **Record Shrink**
3. Enter the **Quantity** lost
4. Select the **Shrink Type**:
   - **Waste** — food spoilage, expired product
   - **Damage** — broken, defective, or unsellable items
   - **Theft** — known or suspected theft
   - **Expiry** — product past its expiration date
   - **Other** — any other loss not covered above
5. Enter a **Reason** (required — recorded in audit trail)
6. Click **Submit**

### How It Works
- A \`shrink\` movement is created with a negative quantity delta
- The movement includes the shrink type for reporting and analysis
- On-hand quantity is reduced immediately
- The movement is recorded with your employee ID and timestamp for accountability
- If the item has **Allow Negative** disabled and this would take on-hand below zero, the system will block it

### Reporting
- View all shrink records in the item's **Movement History** (filter by movement type: shrink)
- Shrink data feeds into inventory valuation and COGS calculations

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-physical-count',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I perform a physical inventory count|physical count|full inventory count|annual inventory|stocktake|how to count all inventory|wall to wall count|physical inventory',
    approvedAnswerMarkdown: `## How to Perform a Physical Inventory Count

A physical inventory count compares your actual on-hand stock against system quantities and records adjustments for any discrepancies.

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Export the current inventory list (use the **Export** function to get a spreadsheet with items, SKUs, and system quantities)
3. Print or load the list on a mobile device for counting
4. Physically count each item in your location
5. For each discrepancy found:
   - Open the item in the inventory list
   - Click **Adjust Quantity**
   - Enter the difference (positive if you have more than the system shows, negative if less)
   - Enter a reason such as "Physical count adjustment — [date]"
6. For known losses, use **Record Shrink** instead of a generic adjustment

### Best Practices
- Count during non-business hours to avoid sales affecting quantities during the count
- Have two people count independently and compare results for high-value items
- Investigate significant discrepancies before recording adjustments
- Review the **Movement History** for large variances to identify the root cause
- Consider counting by department or category over multiple days (cycle counting) rather than all at once

**Permission required:** \`inventory.view\` to export the list, \`inventory.manage\` to record adjustments.`,
  },
  {
    slug: 'inv-howto-cycle-counts',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I enter cycle counts|cycle count|count part of inventory|partial count|how to do cycle counting|ABC counting|rolling inventory count|count by category',
    approvedAnswerMarkdown: `## How to Enter Cycle Counts

Cycle counting means counting a subset of your inventory on a rotating basis rather than counting everything at once.

### Steps
1. Decide on your cycle count schedule (e.g., count one department per week, or high-value items more frequently)
2. Go to **Retail Inventory** or **F&B Inventory**
3. Filter the list by the **department**, **category**, or other criteria you're counting today
4. For each item counted:
   - Compare your physical count to the system's on-hand quantity
   - If they match, move on
   - If they don't match, click **Adjust Quantity** on that item
   - Enter the difference and reason (e.g., "Cycle count — Beverage dept — 2026-03-14")
5. Record shrink for any known losses (damage, expiry, etc.)

### Cycle Count Strategy Tips
- **ABC Analysis**: Count A items (high value/high volume) weekly, B items monthly, C items quarterly
- **Low Stock Focus**: Use the **Low Stock** filter to prioritize counting items near their reorder point
- **Use the Export** function to create count sheets filtered by department or category
- Track count dates in your notes so you know which areas were counted recently

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-troubleshoot-count-mismatch',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'why do my counted quantities not match system quantities|count does not match|physical count discrepancy|system quantity wrong after count|counted more than system shows|counted less than system shows',
    approvedAnswerMarkdown: `## Why Do My Counted Quantities Not Match System Quantities?

Discrepancies between physical counts and system quantities indicate that one or more inventory events were not recorded — or were recorded incorrectly.

### Most Common Causes
1. **Receiving not posted** — A delivery was physically stocked but the receiving receipt was never posted (check for draft receipts)
2. **Shrink/waste not recorded** — Damaged, spoiled, or stolen items were discarded but never recorded in the system
3. **Transfers not recorded** — Items moved between locations without a system transfer
4. **Track Inventory is off** — The item's inventory tracking flag is disabled, so sales don't deduct stock
5. **Timing** — Sales occurred between when you printed the count sheet and when you finished counting
6. **Wrong item scanned** — A barcode scan matched the wrong item (check the item's barcode/UPC identifiers)
7. **Unit of measure confusion** — Counted in cases but system tracks in eaches (check base unit vs purchase unit)

### How to Investigate
1. Open the item's **Movement History** to see every in/out transaction
2. Cross-reference against receiving records, sales reports, and transfer logs
3. Check if any receipts are still in **Draft** status (not yet posted)
4. Verify the item's **Track Inventory** flag is enabled

### How to Resolve
- Once you've identified the cause, record an **Adjustment** or **Shrink** to bring the system in line with the physical count
- Always note the reason — this creates an audit trail for variance analysis

**Permission required:** \`inventory.view\` to investigate, \`inventory.manage\` to adjust.`,
  },
  {
    slug: 'inv-howto-set-reorder-points',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I set reorder points|set par levels|reorder point|minimum stock level|par level|set low stock threshold|when to reorder|how to set reorder quantity',
    approvedAnswerMarkdown: `## How to Set Reorder Points and Par Levels

Reorder points and par levels tell the system when to alert you that an item needs to be reordered.

### Definitions
- **Reorder Point** — When on-hand falls to or below this number, the item appears in low-stock alerts and reorder suggestions
- **Reorder Quantity** — The suggested quantity to order when reordering
- **Par Level** — The ideal stock level you want to maintain (used to calculate suggested order quantity)

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item and click the action menu → **Edit Item**
3. Set the **Reorder Point** (e.g., 10 units)
4. Set the **Reorder Quantity** (e.g., 50 units) — this is the default quantity suggested when creating a purchase order
5. Optionally set the **Par Level** (e.g., 60 units) — if set, the suggested order quantity is calculated as \`par level - current on-hand\`
6. Click **Save**

### How Suggestions Are Calculated
When on-hand falls at or below the reorder point:
- If **Reorder Quantity** is set → suggest that quantity
- If **Par Level** is set (and reorder qty is not) → suggest \`par level - on-hand\`
- If neither is set → suggest \`reorder point - on-hand + 1\`

### Alerts
- Items at or below reorder point trigger a \`inventory.low_stock.v1\` event
- Items with negative on-hand trigger a \`inventory.negative.v1\` event
- View all alerts in **Inventory** → **Stock Alerts**

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-see-low-stock',
    moduleKey: 'inventory',
    route: '/inventory/stock-alerts',
    questionPattern:
      'how do I see which items are low in stock|low stock items|what is running low|out of stock|low inventory|items below reorder point|stock alert|which items need to be reordered',
    approvedAnswerMarkdown: `## How to See Which Items Are Low in Stock

There are two ways to view low-stock items:

### Option 1: Stock Alerts Dashboard
1. Go to **Inventory** → **Stock Alerts**
2. The **Live** tab shows:
   - **Critical** items — negative on-hand (red)
   - **Warning** items — at or below reorder point (amber)
3. Each alert shows the item name, current on-hand, reorder point, suggested order quantity, and preferred vendor
4. The **History** tab shows recent alert notifications (up to 90 days)

### Option 2: Inventory List Filter
1. Go to **Retail Inventory** or **F&B Inventory**
2. Enable the **Low Stock Only** filter
3. The list shows only items where on-hand is at or below the reorder point
4. Items are color-coded:
   - **Red** — negative on-hand
   - **Amber** — at or below reorder point
   - **Green** — adequate stock

### Reorder Suggestions
The **Reorder Suggestions** panel (available on the Receiving page) shows all low-stock items with:
- Current on-hand
- Reorder point
- Suggested order quantity
- Preferred vendor name

**Permission required:** \`inventory.view\``,
  },
  {
    slug: 'inv-howto-create-po-from-low-stock',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I create a purchase order from low stock items|create PO from reorder suggestions|auto create purchase order|reorder from low stock|generate PO from stock alerts|order low stock items',
    approvedAnswerMarkdown: `## How to Create a Purchase Order from Low-Stock Items

### Steps
1. Go to **Inventory** → **Receiving**
2. Review the **Reorder Suggestions** panel — this shows all items at or below their reorder point, grouped by preferred vendor
3. Each suggestion includes:
   - Item name and SKU
   - Current on-hand quantity
   - Reorder point
   - Suggested order quantity (based on par level or reorder quantity settings)
   - Preferred vendor
4. Create a new **Purchase Order** for the vendor
5. Add the suggested items to the PO with the recommended quantities
6. Adjust quantities as needed based on budget, storage capacity, or vendor minimums
7. Submit the PO

### Purchase Order Workflow
- **Draft** → edit freely
- **Submitted** → reviewed and approved internally
- **Sent** → transmitted to the vendor
- **Partially Received** → some items delivered
- **Closed** → all items received
- **Canceled** → PO voided

### Tips
- Group orders by vendor to minimize shipping costs
- Check vendor lead times (set on the vendor-item link) to ensure timely delivery
- Review the suggested quantity — it uses your par level and reorder quantity settings

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-track-lot-batch',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I track inventory by lot number|lot tracking|batch number tracking|batch tracking|track lot numbers|lot traceability|batch traceability',
    approvedAnswerMarkdown: `## How to Track Inventory by Lot or Batch Number

Lot and batch numbers can be recorded during the receiving process and are stored on receipt lines and inventory movements.

### Recording Lot Numbers
1. Go to **Inventory** → **Receiving** → create or open a draft receipt
2. Add or edit a receipt line
3. Enter the **Lot Number** field with the vendor's lot or batch number
4. Optionally enter the **Expiration Date** associated with that lot
5. Post the receipt

### Where Lot Data Is Stored
- On the **receiving receipt line** — viewable when you open the receipt detail
- In the **inventory movement metadata** — the lot number is copied into the movement record when the receipt is posted
- You can view lot information by looking at the movement history for an item and checking the details of each receive movement

### Current Limitations
- Lot tracking is **capture-only** at this stage — lot numbers are recorded on receipts and movements but there is no dedicated lot-level on-hand tracking
- You cannot query "how many units of lot X are still on hand" directly — you would need to review movement history
- POS sales do not specify which lot is being sold (no lot depletion tracking)
- For full lot traceability (FIFO depletion, lot-specific recalls), this feature is on the product roadmap

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-track-serial-numbers',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I track inventory by serial number|serial number tracking|track serial numbers|serialized inventory|serial number management',
    approvedAnswerMarkdown: `## How to Track Inventory by Serial Number

Serial numbers can be recorded during the receiving process for serialized items.

### Recording Serial Numbers
1. Go to **Inventory** → **Receiving** → create or open a draft receipt
2. Add or edit a receipt line for the serialized item
3. Enter the **Serial Numbers** field — you can enter multiple serial numbers for the quantity received
4. Post the receipt

### Where Serial Data Is Stored
- On the **receiving receipt line** as a list of serial numbers
- In the **inventory movement metadata** when the receipt is posted

### Current Limitations
- Serial number tracking is **capture-only** — serial numbers are recorded during receiving but there is no per-serial-number status tracking (assigned, sold, returned, etc.)
- POS sales do not capture which specific serial number was sold
- You cannot look up a serial number to see its current status or location
- For full serialized inventory management (serial-level tracking through sale and return), this feature is on the product roadmap

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-track-expiration-dates',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I track expiration dates|expiration date tracking|track product expiry|expired inventory|manage expiration dates|shelf life tracking|best before dates',
    approvedAnswerMarkdown: `## How to Track Expiration Dates

Expiration dates can be recorded during the receiving process and are stored alongside lot numbers.

### Recording Expiration Dates
1. Go to **Inventory** → **Receiving** → create or open a draft receipt
2. Add or edit a receipt line
3. Enter the **Expiration Date** for the received items
4. Optionally enter the associated **Lot Number**
5. Post the receipt

### Where Expiration Data Is Stored
- On the **receiving receipt line** — viewable when you open the receipt detail
- In the **inventory movement metadata** — copied when the receipt is posted

### Managing Expired Inventory
When items expire:
1. Go to the item in **Retail Inventory** or **F&B Inventory**
2. Click the action menu → **Record Shrink**
3. Select shrink type: **Expiry**
4. Enter the quantity being discarded
5. Note the lot number and expiration date in the reason field

### Current Limitations
- Expiration tracking is **capture-only** — dates are recorded on receipts and movements
- There is no automated alert for approaching or past expiration dates
- FEFO (First Expired, First Out) picking is not automated — manage this operationally
- Automated expiration alerts are on the product roadmap

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-manage-multi-location',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I manage inventory across multiple locations|multi-location inventory|inventory at different stores|multiple warehouse inventory|see stock at other locations|manage stock across locations|multi-site inventory',
    approvedAnswerMarkdown: `## How to Manage Inventory Across Multiple Locations

The system tracks inventory **per location** — each catalog item has a separate inventory record at every active location.

### How It Works
- When you create a new catalog item, the system automatically creates an inventory record at **every active location** in your tenant
- Each location maintains its own on-hand quantity, cost, reorder point, and par level
- Use the **Location** selector in the header to switch between locations and view their inventory

### Viewing Stock Across Locations
1. Go to **Retail Inventory** or **F&B Inventory**
2. Use the **Location** filter to view stock at a specific location
3. Each location shows its own on-hand, reorder points, and stock status

### Transferring Between Locations
1. Find the item and click **Transfer**
2. Select source and destination locations
3. Enter the quantity to transfer
4. The system enforces that the source has sufficient stock

### Location-Specific Settings
Each location's inventory record can have different:
- Reorder points and par levels
- Costing method and standard cost
- Allow negative stock setting

### Reports
- Inventory reports can be filtered by location
- Reorder suggestions are location-specific
- Stock alerts show which location has the low-stock or negative-stock item

**Permission required:** \`inventory.view\` to view, \`inventory.manage\` to transfer or adjust.`,
  },
  {
    slug: 'inv-howto-item-variants',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I set up item variants|size color style variants|item variations|product variants|SKU variants|different sizes of same item|variant tracking',
    approvedAnswerMarkdown: `## How to Set Up Item Variants (Size, Color, Style)

Item variants are managed at the **catalog level**. Each variant becomes its own catalog item with its own SKU and inventory tracking.

### Steps
1. Go to **Catalog**
2. Create the parent item (e.g., "Polo Shirt")
3. In the item editor, use the **Variants** section to define variant attributes (e.g., Size: S, M, L, XL; Color: Black, White, Navy)
4. The system generates individual SKU combinations (e.g., POLO-BLK-S, POLO-BLK-M, etc.)
5. Each variant gets its own:
   - SKU
   - Price (can override the parent price)
   - Inventory tracking (separate on-hand per variant per location)
   - Barcode/UPC
6. Save the item

### Inventory Implications
- Each variant is tracked independently — "Polo Shirt Black Small" and "Polo Shirt White Large" have separate on-hand quantities
- Receiving, adjustments, and transfers are done per variant
- Reorder points and par levels can be set per variant
- POS shows variants as separate selectable options when ringing up the parent item

**Permission required:** \`catalog.manage\` to create variants, \`inventory.manage\` for stock management.`,
  },
  {
    slug: 'inv-howto-bundles-kits-combos',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I create bundles|create kits|combo items|package items|bundle inventory|kit assembly|how to bundle products|create a combo|package deal',
    approvedAnswerMarkdown: `## How to Create Bundles, Kits, or Combo Items

Bundles (also called packages or combos) are catalog items that contain multiple component items. When sold, inventory is deducted from each **component**, not the bundle itself.

### Steps
1. Go to **Catalog**
2. Click **New Item** and set the item type to **Package** (or edit an existing item)
3. In the **Package Components** section, add the individual items that make up the bundle:
   - Select each component item
   - Set the quantity of each component per bundle
4. Set the bundle's selling price
5. Save the item

### How Inventory Works for Bundles
- The bundle item itself is **not** tracked in inventory
- When a bundle is sold at POS, the system deducts inventory from each **component item** based on the component quantities defined
- Example: A "Gift Set" bundle with 1x Candle + 2x Soap → selling one gift set deducts 1 candle and 2 soaps from inventory
- Receiving is done on the individual component items, not on the bundle

### Combo Items (F&B)
The \`catalog_combos\` and \`catalog_combo_items\` tables support F&B combo meals:
- Define a combo with a set of items and an optional combo price
- Component items have their inventory tracked individually

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-troubleshoot-no-deduction-after-sale',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'why did inventory not deduct after a sale|inventory not decreasing after sale|sold item but stock did not change|POS sale not reducing inventory|stock not updating after order|inventory not syncing with sales',
    approvedAnswerMarkdown: `## Why Didn't Inventory Deduct After a Sale?

Inventory deduction happens **asynchronously** via an event-driven process, not inline with the sale. Here's how it works and what can go wrong.

### How Sales Deduct Inventory
1. POS places an order → emits an \`order.placed.v1\` event
2. The inventory module's consumer receives the event
3. For each line item, a \`sale\` movement is created (negative quantity)
4. Package/bundle items deduct from each component, not the package itself
5. Only items with **Track Inventory = true** are deducted

### Common Causes for No Deduction
1. **Track Inventory is disabled** — Check the item's inventory settings. If "Track Inventory" is off, sales won't create movements
2. **Event processing delay** — The event may not have been processed yet. The outbox processes events asynchronously; check back in a moment
3. **No inventory record at this location** — The item may not have an inventory record at the location where the sale occurred (this is auto-created but could be missing if the item was created before the location)
4. **Idempotency prevented duplicate** — If the same order event was processed before (retry), the \`ON CONFLICT DO NOTHING\` prevents a second deduction. This is correct behavior
5. **Item is a package** — If the sold item is a package/bundle, inventory deducts from the **components**, not the package item itself. Check the component items' movements

### How to Verify
1. Open the item in inventory and check **Movement History**
2. Look for a \`sale\` movement matching the order time
3. If missing, check the item's **Track Inventory** setting
4. For packages, check the component items' movement history

**Permission required:** \`inventory.view\``,
  },
  {
    slug: 'inv-troubleshoot-double-deduction',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'why did inventory deduct twice|double deduction|inventory counted twice|stock went down too much|duplicate inventory deduction|item deducted more than sold',
    approvedAnswerMarkdown: `## Why Did Inventory Deduct Twice?

The system has built-in idempotency protection to prevent duplicate deductions, but here's what to check.

### Built-In Protection
Inventory movements have a unique index on \`(tenant_id, reference_type, reference_id, inventory_item_id, movement_type)\`. If the same order event is processed twice, the second insert is silently ignored (\`ON CONFLICT DO NOTHING\`). This means **true event-driven duplicates should not occur**.

### Possible Causes of Apparent Double Deduction
1. **Two separate orders** — Verify that two different orders weren't placed for the same item (check the order IDs in the movement history)
2. **Manual adjustment + automatic deduction** — Someone may have manually adjusted the quantity AND the automatic sale deduction also occurred
3. **Package component overlap** — If an item appears as a component in a package AND was also ordered individually, both deductions are correct
4. **Transfer confused with sale** — A transfer-out at this location may look like an extra deduction

### How to Investigate
1. Open the item's **Movement History**
2. Look at all movements around the time of the discrepancy
3. Check the **reference_id** on each \`sale\` movement — each should correspond to a different order
4. Check for \`adjustment\` or \`transfer_out\` movements that might explain the extra reduction

### How to Fix
If you confirm a genuine over-deduction:
1. Record a positive **Adjustment** for the over-deducted quantity
2. Note the reason (e.g., "Correcting duplicate deduction — see order #XYZ")

**Permission required:** \`inventory.view\` to investigate, \`inventory.manage\` to adjust.`,
  },
  {
    slug: 'inv-howto-movement-history',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I see inventory movement history|inventory history|stock movement log|what happened to my inventory|inventory transaction history|trace inventory changes|inventory audit trail',
    approvedAnswerMarkdown: `## How to See Inventory Movement History

Every inventory change is recorded as an **append-only movement** that can never be edited or deleted.

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item
3. Click the action menu → **Movement History**
4. View the chronological list of all movements

### Movement Types You'll See
| Type | Description |
|------|-------------|
| **receive** | Stock added from a vendor delivery |
| **sale** | Stock deducted by a POS/online order |
| **adjustment** | Manual quantity correction |
| **shrink** | Recorded loss (waste, theft, damage, expiry) |
| **transfer_in** | Stock received from another location |
| **transfer_out** | Stock sent to another location |
| **void_reversal** | Reversal of a voided receipt or voided order |
| **return** | Stock returned from a customer return |
| **initial** | Starting quantity when first set up |
| **conversion** | Unit of measure conversion |

### Each Movement Shows
- Date and time
- Movement type
- Quantity (positive = in, negative = out)
- Unit cost and extended cost
- Reference (order ID, receipt ID, transfer batch ID, or "manual")
- Source (POS, online, manual, system, integration)
- Employee who performed it
- Business date

### Filtering
- Filter by **movement type** (e.g., show only sales, or only adjustments)
- Filter by **source** (POS, manual, system)
- Results use cursor-based pagination for performance

**Permission required:** \`inventory.view\``,
  },
  {
    slug: 'inv-howto-find-who-changed-quantity',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I find out who changed an inventory quantity|who adjusted inventory|inventory audit|who made this change|track inventory changes by user|inventory change log|who received this item',
    approvedAnswerMarkdown: `## How to Find Out Who Changed an Inventory Quantity

Every inventory movement records the employee who performed it.

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Find the item and open **Movement History**
3. Each movement shows:
   - **Employee ID** — who performed the action
   - **Terminal ID** — which terminal was used (for POS sales)
   - **Timestamp** — exact date and time
   - **Source** — whether it was POS, manual, system, or integration
   - **Reference** — links to the order, receipt, or transfer that caused the movement

### For More Detail
- **Receiving**: Open the linked receipt to see who created, edited, and posted it (includes \`posted_by\` field)
- **Adjustments and Shrink**: The movement records the employee directly
- **POS Sales**: The movement references the order ID — open the order to see the cashier/server
- **Transfers**: The movement records the employee who initiated the transfer
- **Audit Log**: The system maintains a separate audit log that records all changes with user identity, accessible via the audit history

**Permission required:** \`inventory.view\``,
  },
  {
    slug: 'inv-howto-set-default-vendors',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I set default vendors for items|preferred vendor|assign vendor to item|link item to vendor|set up vendor for ordering|default supplier|vendor-item relationship',
    approvedAnswerMarkdown: `## How to Set Default Vendors for Items

You can link inventory items to one or more vendors and mark one as the preferred (default) vendor.

### Steps
1. Go to **Inventory** → **Vendors**
2. Find or create the vendor
3. Open the vendor detail and go to the **Catalog** tab
4. Click **Add Item** to link a catalog item to this vendor
5. Fill in the vendor-specific details:
   - **Vendor SKU** — the vendor's part number
   - **Vendor Cost** — the vendor's price
   - **Lead Time** (days) — how long delivery takes
   - **Minimum Order Quantity** — vendor's minimum
   - **Pack Size** — units per case/pack
   - **Is Preferred** — toggle on to make this the default vendor for this item
6. Save

### How Preferred Vendor Is Used
- **Reorder Suggestions** show the preferred vendor name next to each low-stock item
- When creating a purchase order, the preferred vendor is suggested first
- If an item has multiple vendors, only one can be marked as preferred

### Viewing an Item's Vendors
1. Open the inventory item
2. View the **Vendors** section to see all linked vendors, their costs, and which is preferred

### Vendor Cost Tracking
- When a receipt is posted, the system automatically updates the vendor's **Last Cost** and **Last Received Date**
- This keeps vendor pricing current without manual updates

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-update-item-costs',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I update item costs|change item cost|update cost|cost changed|vendor raised prices|how to update pricing|change purchase cost|update unit cost',
    approvedAnswerMarkdown: `## How to Update Item Costs

Item costs are updated in different ways depending on your costing method.

### Automatic Cost Updates (via Receiving)
The most common way costs update is through receiving:
1. When you post a **Receiving Receipt**, the system calculates the **landed unit cost** (including any allocated shipping)
2. The item's \`current_cost\` is updated based on the costing method:
   - **Weighted Average**: New cost = weighted blend of existing on-hand cost and new received cost
   - **FIFO**: Current cost updates to the latest received landed unit cost
   - **Standard**: Current cost does **not** change on receive (stays at the manually set standard cost)

### Manual Cost Updates

#### Standard Cost Items
1. Go to the item in **Retail Inventory** or **F&B Inventory**
2. Click **Edit Item**
3. Update the **Standard Cost** field
4. Save

#### Vendor Cost
1. Go to **Inventory** → **Vendors** → select the vendor
2. Find the item in the vendor's catalog
3. Update the **Vendor Cost**
4. Save

This updates the vendor's quoted price but does not change the item's current cost — current cost only changes when you actually receive at the new price.

### Important Notes
- **Current Cost** drives inventory valuation and COGS calculations
- Vendor cost and current cost are separate fields — vendor cost is what the vendor charges, current cost is what you carry the item at
- Cost changes are reflected in future movements, not retroactively applied to past movements

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-costing-methods',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how is average cost calculated|FIFO costing|costing methods|weighted average cost|standard cost|how does inventory costing work|cost of goods calculation|COGS method',
    approvedAnswerMarkdown: `## How Inventory Costing Methods Work

Each inventory item has a costing method that determines how \`current_cost\` is calculated. This cost is used for inventory valuation and COGS.

### Weighted Average
The most common method. On each receipt:

\`New Cost = (Current On-Hand x Current Cost + Received Qty x Landed Unit Cost) / (Current On-Hand + Received Qty)\`

- If current on-hand is zero or negative, the new cost is simply the incoming landed unit cost
- When a receipt is voided, the weighted average is reversed to remove the receipt's effect
- Best for: items with frequent purchases at varying prices (most retail and F&B items)

### FIFO (First In, First Out)
On each receipt, the current cost is updated to the **latest received landed unit cost**.

- Note: This is a simplified FIFO — the system does not maintain cost layers. It uses the last-received cost as the current cost
- Best for: items where the most recent cost is the most relevant (perishables, commodities)

### Standard Cost
The current cost is set **manually** and does **not change** when inventory is received.

- You set the standard cost when creating or editing the item
- Receiving at a different price does not affect the item's cost
- Variances between standard cost and actual received cost can be analyzed via movement history
- Best for: manufactured items or items with contractually fixed prices

### Landed Cost
Regardless of costing method, the system calculates **landed cost** on each receipt line:
- \`Landed Cost = Extended Cost + Allocated Shipping\`
- \`Landed Unit Cost = Landed Cost / Base Quantity\`
- Shipping allocation uses one of six methods: by cost, by quantity, by weight, by volume, manual, or none

### Inventory Valuation
The accounting module can pull beginning/ending inventory valuations for any period using the \`getInventoryMovementsSummary\` query, which calculates valuation from the movement ledger.

**Permission required:** \`inventory.view\``,
  },
  {
    slug: 'inv-troubleshoot-valuation-wrong',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'why is my inventory valuation wrong|inventory value incorrect|COGS wrong|cost of goods does not match|inventory dollar value is off|valuation discrepancy|inventory cost mismatch',
    approvedAnswerMarkdown: `## Why Is My Inventory Valuation Wrong?

Inventory valuation is calculated from the movement ledger. If it's wrong, one of these is usually the cause.

### Common Causes
1. **Receipts posted with wrong cost** — Verify the unit cost on receiving receipts matches vendor invoices. Costs entered during receiving flow directly into valuation
2. **Shipping not allocated** — If freight mode was set to "Expense" instead of "Allocate", shipping costs went to GL as an expense rather than into item landed cost
3. **Standard cost not updated** — If using standard costing and the standard cost is outdated, valuation won't reflect actual purchase prices
4. **Voided receipt not accounted for** — A voided receipt creates reversal movements but may leave cost in an unexpected state if the weighted average reversal couldn't fully unwind (e.g., if items were sold between receive and void)
5. **Missing receipts** — Inventory was received physically but not posted in the system — quantities are in stock but cost basis is missing
6. **Unit of measure errors** — If the purchase-to-base conversion ratio is wrong, landed unit cost will be miscalculated
7. **Adjustments without cost** — Adjustments can optionally include a unit cost; if cost is omitted, the movement has zero cost impact, affecting valuation

### How to Investigate
1. Compare the item's **Movement History** costs against vendor invoices
2. Check receiving receipts for correct unit costs and freight allocation
3. Verify the costing method is appropriate for the item type
4. Review the **Inventory Movements Summary** in accounting for the period in question
5. Check if any receipts are still in Draft (not yet posted into valuation)

**Permission required:** \`inventory.view\` to investigate, \`inventory.manage\` to correct.`,
  },
  {
    slug: 'inv-howto-import-from-csv',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I import inventory items from Excel|import from CSV|bulk import items|upload inventory spreadsheet|import inventory list|mass add inventory items|bulk upload items',
    approvedAnswerMarkdown: `## How to Import Inventory Items from Excel or CSV

Item import is handled through the **Catalog Import** feature, since inventory items are created automatically from catalog items.

### Steps
1. Go to **Catalog**
2. Click **Import** (or look for the import option in the action menu)
3. Download the **import template** to see the required format
4. Prepare your Excel or CSV file with the required columns:
   - Item name, SKU, department, price
   - Item type (retail, food, beverage, etc.)
   - Optional: reorder point, par level, vendor, cost
5. Upload the file
6. Review the validation results — the system checks for:
   - Required fields
   - Duplicate SKUs
   - Valid departments and categories
7. Confirm the import

### After Import
- Catalog items are created and inventory records are automatically generated for every active location
- Initial on-hand quantities are zero — use adjustments or receiving to set starting quantities
- Import results are logged in the \`catalog_import_logs\` table for audit purposes

### Tips
- Start with a small test batch to verify your formatting
- Ensure SKUs are unique across your catalog
- Use the template provided — it has the exact column headers the system expects

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-export-inventory-list',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I export my inventory list|export inventory|download inventory report|export stock list to CSV|inventory spreadsheet export|download inventory data',
    approvedAnswerMarkdown: `## How to Export Your Inventory List

### Steps
1. Go to **Retail Inventory** or **F&B Inventory**
2. Apply any filters you want (department, category, location, low stock only, etc.)
3. Click the **Export** or **Download** button (typically a download icon in the toolbar)
4. The system generates a CSV file with the filtered inventory data

### What's Included in the Export
- Item name, SKU
- Item type, department, category
- Current on-hand quantity
- Reorder point, reorder quantity, par level
- Current cost, standard cost
- Costing method
- Status (active, archived)
- Location

### Other Export Options
- **Reports** — Go to the **Reporting** section for more detailed inventory reports that can be exported to CSV
- **Movement History** — Individual item movement history can also be used for detailed audit exports

**Permission required:** \`inventory.view\` (view/export), \`reports.export\` (CSV download from reports).`,
  },
  {
    slug: 'inv-howto-assign-bin-shelf',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I assign inventory to a bin|shelf location|bin location|storage location|where is item stored|assign warehouse location|bin management|aisle and shelf tracking',
    approvedAnswerMarkdown: `## How to Assign Inventory to a Specific Location, Bin, or Shelf

Inventory is tracked at the **location level** (store, warehouse, etc.). Sub-location tracking (bins, shelves, aisles) is not currently a built-in feature.

### What's Available Now
- Each inventory item is tracked per **location** (tenant location / store / warehouse)
- You can transfer inventory between locations
- Location-level on-hand, reorder points, and par levels

### Workarounds for Bin/Shelf Tracking
1. **Item notes** — Use the item's notes field to record bin or shelf locations
2. **SKU encoding** — Include bin/shelf codes in the SKU naming convention (e.g., A1-WIDGET-001)
3. **Custom identifiers** — Use the item identifiers table to store bin location as a custom identifier type

### On the Roadmap
Granular sub-location tracking (warehouse zones, aisles, racks, bins) is planned for a future release. This would include:
- Bin assignment per item per location
- Pick/put-away suggestions
- Bin-level stock queries

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-reserved-committed-inventory',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I manage reserved inventory|committed inventory|allocated stock|reserved stock|inventory on hold|hold inventory for order|committed vs available',
    approvedAnswerMarkdown: `## How to Manage Reserved or Committed Inventory

The current system tracks **on-hand quantity** as a single pool per item per location. There is no built-in distinction between "available" and "reserved/committed" quantities.

### How It Works Today
- On-hand = sum of all inventory movements (an item is either in stock or not)
- POS sales and orders deduct from on-hand when the order is placed (via the \`order.placed\` event)
- There is no intermediate "reserved" state between order creation and inventory deduction

### Workarounds
1. **Manual adjustments** — If you need to hold stock for a specific purpose, you could transfer it to a designated "hold" location
2. **Par level management** — Set par levels high enough to account for expected commitments
3. **Allow Negative = false** — Ensure this is set so the system blocks sales/adjustments that would take on-hand below zero, effectively protecting your last units

### On the Roadmap
Inventory reservation (soft allocation before fulfillment) is planned for future ecommerce and warehouse management features, including:
- Order-level allocation (reserved on order, released on cancel)
- Available-to-promise calculation (on-hand minus reserved)
- Backorder management

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-handle-backorders',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I handle backorders|out of stock handling|item not in stock|backorder management|out of stock item ordered|negative inventory from orders',
    approvedAnswerMarkdown: `## How to Handle Backorders or Out-of-Stock Items

### Current Behavior
- If an item's **Allow Negative** is set to \`false\` (default), manual adjustments and transfers that would take on-hand below zero are blocked
- However, **POS sales can still sell items with zero or low stock** — the \`order.placed\` event will create a negative movement if needed (POS is not blocked by the Allow Negative flag on manual adjustments)
- The system will emit an \`inventory.negative.v1\` event when on-hand goes below zero, which appears in **Stock Alerts** as a critical alert

### Managing Out-of-Stock Situations
1. **Monitor Stock Alerts** — Check **Inventory** → **Stock Alerts** regularly. Negative and low-stock items are flagged automatically
2. **Set Reorder Points** — Ensure reorder points are set so you get warned before running out
3. **Review Reorder Suggestions** — The system calculates suggested order quantities based on par levels
4. **Disable items at POS** — If an item is truly out of stock and shouldn't be sold, you can temporarily deactivate it in the catalog or use the 86'd (unavailable) feature in F&B

### Backorder Tracking
Formal backorder management (tracking customer orders against future stock) is not currently built. Workarounds:
- Use **Purchase Order** status tracking to monitor when replenishment is expected
- Check PO expected delivery dates against customer demand
- Use notes on PO lines to track which customer orders are waiting for stock

**Permission required:** \`inventory.view\` to monitor, \`inventory.manage\` to reorder.`,
  },
  {
    slug: 'inv-howto-track-manufacturing-assembly',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I track inventory used in manufacturing|assembly tracking|raw materials tracking|work in progress inventory|bill of materials|recipe costing|manufacturing inventory|ingredient tracking',
    approvedAnswerMarkdown: `## How to Track Inventory Used in Manufacturing or Assembly

### Current Capabilities
The system supports **package/bundle items** which function similarly to a bill of materials:

1. **Package Items** — Create a catalog item of type "Package" with component items and quantities
   - When the package is sold, inventory deducts from each component
   - This is useful for kits, bundles, or assembled products

2. **F&B Recipes** — For food and beverage operations:
   - Catalog items can have ingredient components defined
   - When an F&B item is sold, inventory for the ingredients can be deducted
   - Recipe costing is calculated from component costs

3. **Conversion Movements** — The \`conversion\` movement type exists for tracking unit-of-measure conversions (e.g., breaking a case into individual units)

### What's Not Built
- Work-in-progress (WIP) inventory tracking
- Multi-stage manufacturing routing
- Production orders with yield tracking
- Automated assembly/disassembly commands
- Scrap and by-product tracking

### Workarounds
1. Use **adjustments** to manually deduct raw materials when entering production
2. Use **adjustments** to add finished goods when production is complete
3. Include detailed reasons on each adjustment for traceability
4. Use the \`conversion\` movement type for transformations

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-connect-pos-ecommerce',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I connect inventory with POS|inventory POS integration|sync inventory with sales|how does POS update inventory|connect inventory to ecommerce|inventory and order sync|real time inventory sync',
    approvedAnswerMarkdown: `## How Inventory Connects with POS and Sales Channels

Inventory is automatically connected to POS and order channels through the **event-driven architecture**. No manual setup is required.

### How It Works

#### POS Sales
1. A sale is completed at POS → an \`order.placed.v1\` event is emitted
2. The inventory module's event consumer processes the event
3. For each line item with **Track Inventory = true**:
   - A \`sale\` movement is created with the sold quantity (negative)
   - Package/bundle items deduct from each component item
4. This happens **asynchronously** (event-driven), not inline with the POS transaction

#### Voids
- When an order is voided → \`order.voided.v1\` event → \`void_reversal\` movements are created to add the stock back

#### Returns
- When items are returned → \`order.returned.v1\` event → \`return\` movements are created to add stock back (including package component items)

### Idempotency
All sale/void/return movements use \`ON CONFLICT DO NOTHING\` to prevent duplicate processing. If an event is delivered twice, the second attempt is safely ignored.

### Ensuring Items Are Tracked
- Verify **Track Inventory** is enabled on each item that should sync
- Items with Track Inventory = false will not have any movements created from sales

### Multi-Location
- Inventory is deducted at the **location where the order was placed** (from the order's \`locationId\`)
- Each location maintains independent stock levels

**Permission required:** \`inventory.view\``,
  },
  {
    slug: 'inv-troubleshoot-online-vs-instore-mismatch',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'why are online stock levels different from in-store|inventory does not match between channels|online and POS inventory different|stock mismatch between channels|inventory sync issue between online and store',
    approvedAnswerMarkdown: `## Why Are Online Stock Levels Different from In-Store Stock Levels?

### How Multi-Channel Inventory Works
All sales channels (POS, online) deduct from the **same inventory pool** at the order's location. The system maintains a single source of truth — the inventory movement ledger.

### Common Causes of Apparent Mismatches
1. **Event processing delay** — Inventory deductions happen asynchronously via events. A POS sale may take a moment to be reflected, during which an online system might show stale data
2. **Different locations** — POS and online orders may be fulfilled from different locations. Check which location each channel is deducting from
3. **Cache/display lag** — If an external system (ecommerce platform) caches stock levels, it may show outdated quantities between sync intervals
4. **Track Inventory disabled** — The item's Track Inventory flag may be off, meaning no channel deducts stock
5. **Integration sync frequency** — If using an external ecommerce platform, stock levels sync periodically, not in real-time

### How to Investigate
1. Check the item's **Movement History** — see all deductions across all sources (POS, online, manual)
2. Verify the **Location** — ensure both channels are looking at the same location's inventory
3. Check the movement **source** field — it shows whether each deduction came from \`pos\`, \`online\`, \`manual\`, or \`integration\`

### Resolution
- For genuine discrepancies, use an **Adjustment** to correct the system quantity
- For integration-related lag, check the sync configuration of your external platform

**Permission required:** \`inventory.view\``,
  },
  {
    slug: 'inv-howto-reports-by-category-vendor-location',
    moduleKey: 'inventory',
    route: '/retail-inventory',
    questionPattern:
      'how do I run inventory reports|inventory report by category|inventory report by vendor|inventory report by location|stock report|inventory valuation report|inventory analysis|inventory reporting',
    approvedAnswerMarkdown: `## How to Run Inventory Reports by Category, Vendor, or Location

### Inventory List Reports
1. Go to **Retail Inventory** or **F&B Inventory**
2. Apply filters to narrow your view:
   - **Location** — select a specific location or view all
   - **Department / Sub-Department / Category** — drill down by product hierarchy
   - **Item Type** — filter by retail, food, beverage, etc.
   - **Low Stock Only** — show only items at or below reorder point
   - **Show Archived** — include discontinued items
3. **Export** the filtered list to CSV for further analysis

### Stock Alerts Report
1. Go to **Inventory** → **Stock Alerts**
2. View critical (negative stock) and warning (low stock) items
3. Filter by severity level

### Inventory Valuation
- The accounting module provides **Inventory Movements Summary** for any date range
- Shows beginning inventory, purchases (receipts), COGS (sales), adjustments, and ending inventory
- Used for period-end financial reporting and COGS calculation

### Movement History Reports
1. Open any item's **Movement History**
2. Filter by movement type (receives, sales, adjustments, shrink, transfers)
3. Filter by source (POS, manual, system)
4. Review individual transactions with full audit details

### Reorder Suggestions
- View on the **Receiving** page — shows all items below reorder point with suggested order quantities and preferred vendors

### Tips
- All list views and reports support CSV export
- For vendor-specific reports, go to **Inventory** → **Vendors** → select a vendor → view their **Catalog** to see all items from that vendor

**Permission required:** \`inventory.view\` for reports, \`reports.export\` for CSV downloads.`,
  },
  {
    slug: 'inv-howto-set-permissions',
    moduleKey: 'inventory',
    route: '/settings',
    questionPattern:
      'how do I set user permissions for inventory|inventory permissions|who can adjust inventory|restrict inventory access|inventory security|inventory role permissions|limit who can receive inventory',
    approvedAnswerMarkdown: `## How to Set User Permissions for Inventory Functions

Inventory access is controlled by the RBAC (Role-Based Access Control) system with two main permission levels.

### Inventory Permissions

| Permission | What It Allows | Default Roles |
|------------|---------------|---------------|
| \`inventory.view\` | View stock levels, movement history, receiving history, reports | Owner, Manager, Supervisor, Cashier, Staff |
| \`inventory.manage\` | Receive inventory, adjust quantities, transfer stock, record shrink, manage vendors and POs | Owner, Manager, Supervisor |

### F&B-Specific Inventory Permissions

| Permission | What It Allows | Default Roles |
|------------|---------------|---------------|
| \`pos_fnb.inventory.view\` | View F&B inventory items and stock levels | Owner, Manager, Supervisor, Cashier, Server, Staff |
| \`pos_fnb.inventory.manage\` | Add, edit, and manage F&B inventory items | Owner, Manager, Supervisor |

### How to Configure
1. Go to **Settings** → **Roles & Permissions**
2. Select the role you want to modify
3. Find the **Inventory** section
4. Toggle permissions on or off for that role
5. Save

### Role Hierarchy
The six built-in roles from most to least privileged:
1. **Owner** — all permissions (\`*\`)
2. **Manager** — full operational access including inventory management
3. **Supervisor** — inventory management included
4. **Cashier** — view only (no adjustments, receiving, or transfers)
5. **Server** — F&B inventory view only
6. **Staff** — view only

### Important Notes
- All inventory mutations (adjustments, receiving, shrink, transfers) require \`inventory.manage\` and are audited
- Catalog item creation requires \`catalog.manage\` (separate from inventory permissions)
- Viewing inventory does not allow making changes — the view and manage permissions are separate
- The \`inventory.manage\` permission is flagged for audit tracking

**Permission required:** \`settings.manage\` to change role permissions.`,
  },
];

// ─── Seed Function ───────────────────────────────────────────────────────────

export async function seedTrainingData(tenantId: string | null = null) {
  await db
    .insert(aiSupportAnswerCards)
    .values(
      TRAINING_CARDS.map((c) => ({
        ...c,
        tenantId,
        status: 'draft' as const,
        version: 1,
      })),
    )
    .onConflictDoNothing();

  return {
    answerCardsInserted: TRAINING_CARDS.length,
    message: `Inserted ${TRAINING_CARDS.length} answer cards as draft. Review and activate from the admin portal at /ai-assistant/answers.`,
  };
}
