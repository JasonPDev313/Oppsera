# SECTION 4B — JSON SEED SCHEMA

These JSON objects are compatible with the `createAnswerCard()` command in `packages/modules/ai-support/src/commands/review-commands.ts`.

All cards created as `status: "draft"` for admin review before activation.

```json
[
  {
    "slug": "erp-howto-create-customer-vendor",
    "moduleKey": "customers",
    "route": "/customers",
    "questionPattern": "how do I create a new customer|how to add a customer|how do I create a vendor|how to add a vendor|create new customer|add new vendor|new customer record|set up a vendor",
    "approvedAnswerMarkdown": "## How to Create a New Customer or Vendor\n\n**Customers** and **vendors** are managed in separate areas:\n\n### Creating a Customer\n1. Go to **Customers** from the main navigation\n2. Click **New Customer**\n3. Fill in the required fields: name, email, phone\n4. Optionally add: addresses, contacts, notes, custom identifiers\n5. Click **Save**\n\n### Creating a Vendor\n1. Go to **Inventory** → **Vendors**\n2. Click **New Vendor**\n3. Fill in vendor details and contact information\n4. Optionally set up vendor catalog items (SKU, cost, lead time)\n5. Click **Save**\n\n**Permission required:** `customers.manage` for customers, `inventory.manage` for vendors.",
    "status": "draft"
  },
  {
    "slug": "erp-corrections-edit-posted-invoice",
    "moduleKey": "ar",
    "route": "/customers/billing",
    "questionPattern": "how do I edit a posted invoice|edit invoice after posting|change a posted invoice|modify posted invoice|fix an invoice that was already posted|invoice was wrong how to fix",
    "approvedAnswerMarkdown": "## Editing a Posted Invoice\n\nPosted invoices **cannot be directly edited** — this is by design to maintain an accurate audit trail.\n\n### How to Correct a Posted Invoice\n1. Go to **Customers** → **Billing**\n2. Find the invoice that needs correction\n3. Issue a **Credit Memo** against the original invoice to reverse it\n4. Create a new invoice with the correct details\n\n### Why This Approach?\nAccounting standards require that posted financial documents remain unchanged. A credit memo creates a proper paper trail showing what was corrected and why.\n\n**Permission required:** `ar.manage`",
    "status": "draft"
  },
  {
    "slug": "erp-troubleshoot-invoice-unpaid",
    "moduleKey": "ar",
    "route": "/customers/billing",
    "questionPattern": "invoice showing unpaid|payment entered but invoice still unpaid|why does invoice show unpaid|invoice not marked as paid|payment was made but invoice is open|customer paid but invoice says outstanding",
    "approvedAnswerMarkdown": "## Invoice Showing as Unpaid Despite Payment\n\nThis usually has one of these causes:\n\n1. **Payment applied to wrong invoice** — Check the AR ledger for the customer to see which invoice the payment was applied to\n2. **Payment still in draft/pending state** — The payment may have been entered but not posted/finalized\n3. **Partial payment** — The payment amount may not cover the full invoice balance\n4. **GL posting delay** — The GL adapter processes payments asynchronously; check posting status\n\n### How to Diagnose\n1. Go to **Customers** → find the customer → **Billing** tab\n2. Check the **AR Ledger** to see all payments and their allocation\n3. Verify the payment amount matches the invoice total\n4. Check if the payment status shows as completed\n\nIf the payment is correctly recorded and allocated but the invoice still shows unpaid, please contact support.",
    "status": "draft"
  },
  {
    "slug": "erp-corrections-credit-memo",
    "moduleKey": "ar",
    "route": "/customers/billing",
    "questionPattern": "how to issue a credit memo|how do I issue a refund in AR|create credit memo|refund an invoice|issue accounting refund|credit note|how to credit a customer account",
    "approvedAnswerMarkdown": "## Issuing a Credit Memo\n\n1. Go to **Customers** → **Billing**\n2. Find the original invoice\n3. Click **Issue Credit Memo**\n4. Enter the credit amount and reason\n5. Review and post the credit memo\n\nThe credit memo will reduce the customer's outstanding balance and create a corresponding GL entry.\n\n**Note:** This is different from a POS refund/return. If the customer is returning items purchased at the point of sale, use the **Return** workflow from the Orders page instead.\n\n**Permission required:** `ar.manage`",
    "status": "draft"
  },
  {
    "slug": "erp-howto-bank-reconciliation",
    "moduleKey": "accounting",
    "route": "/accounting/bank-reconciliation",
    "questionPattern": "how do I reconcile my bank account|bank reconciliation|how to reconcile bank|reconcile bank statement|match bank transactions|bank rec|bank recon process",
    "approvedAnswerMarkdown": "## Bank Account Reconciliation\n\n1. Go to **Accounting** → **Bank Reconciliation**\n2. Click **New Reconciliation Session** for the account you want to reconcile\n3. Enter the bank statement ending balance and date\n4. Match system transactions against your bank statement:\n   - Auto-match will pair obvious matches\n   - Manually match remaining items\n   - Review unmatched items on both sides\n5. When the difference is $0.00, click **Complete Reconciliation**\n\n### Additional Tools\n- **Settlement Matching** — match card processor settlements against recorded tenders\n- **CSV Import** — import settlement files for bulk matching\n- **Daily Reconciliation** — view day-by-day reconciliation status\n- **Reconciliation Waterfall** — see the progression of unreconciled items\n\n**Permission required:** `banking.reconcile`",
    "status": "draft"
  },
  {
    "slug": "erp-corrections-wrong-journal-entry",
    "moduleKey": "accounting",
    "route": "/accounting/journals",
    "questionPattern": "fix journal entry posted to wrong account|correct a journal entry|wrong GL account on journal entry|journal entry mistake|posted to wrong account|how to reverse a journal entry|void journal entry",
    "approvedAnswerMarkdown": "## Correcting a Journal Entry Posted to the Wrong Account\n\nPosted journal entries **cannot be edited directly**. To correct one:\n\n1. Go to **Accounting** → **Journals**\n2. Find the incorrect journal entry\n3. Click **Void** to reverse the original entry (this creates an equal and opposite entry)\n4. Click **New Journal Entry** to create a correcting entry with the correct accounts\n5. Review the debit/credit amounts and post\n\n### Tips\n- Always add a note on the correcting entry referencing the original entry number\n- Voiding creates a full reversal — both the original and void will appear in the GL detail report\n- If the original was posted in a closed period, you'll need to post the correction in the current open period\n\n**Permission required:** `accounting.manage`\n\n**Caution:** This affects financial statements. If you're unsure, consult your accounting manager before making corrections.",
    "status": "draft"
  },
  {
    "slug": "erp-reporting-pl-by-location",
    "moduleKey": "accounting",
    "route": "/accounting/statements/profit-loss",
    "questionPattern": "run profit and loss report|P&L by location|P&L by department|profit and loss by location|income statement by department|how to see P&L|run P&L report|financial statements by location",
    "approvedAnswerMarkdown": "## Running a P&L Report by Location or Department\n\n1. Go to **Accounting** → **Statements** → **Profit & Loss**\n2. Set your **date range** (month, quarter, year, or custom)\n3. Use the **Location** filter to select a specific location\n4. Use the **Department** filter to drill down by department\n5. Click **Generate** to view the report\n\n### Other Financial Reports\n- **Consolidated P&L** — Compare all locations side-by-side: Accounting → Reports → Consolidated P&L\n- **Budget vs. Actual** — See variance against budgets: Accounting → Reports → Budget vs Actual\n- **Balance Sheet** — Accounting → Statements → Balance Sheet\n- **Cash Flow** — Accounting → Statements → Cash Flow\n\nAll reports can be **exported to CSV** using the download button.\n\n**Permission required:** `financials.view` (view), `reports.export` (CSV download)",
    "status": "draft"
  },
  {
    "slug": "erp-howto-close-period",
    "moduleKey": "accounting",
    "route": "/accounting/period-close",
    "questionPattern": "close the month|close accounting period|month end close|how to close period|period close process|end of month accounting|close the books",
    "approvedAnswerMarkdown": "## Closing an Accounting Period\n\n### Before You Start\nPeriod close is **irreversible** — once closed, no entries can be posted to that period.\n\n### Steps\n1. Go to **Accounting** → **Period Close**\n2. Review the **Close Checklist** — the system checks for:\n   - Unposted journal entries\n   - Unreconciled bank accounts\n   - Pending settlements\n   - Open AP/AR items\n   - Location close status\n3. Resolve any open items flagged by the checklist\n4. Click **Run Close Orchestrator** to begin the close process\n5. The system will:\n   - Lock the period from further posting\n   - Generate retained earnings entries\n   - Update the period status across all locations\n6. Confirm the close\n\n### Tips\n- All locations must be ready before closing the period\n- Run a trial balance first to verify all accounts balance\n- Review the P&L and balance sheet before closing\n- Once closed, corrections must be posted to the next open period\n\n**Permission required:** `period.close`",
    "status": "draft"
  },
  {
    "slug": "erp-troubleshoot-inventory-mismatch",
    "moduleKey": "inventory",
    "route": "/retail-inventory",
    "questionPattern": "inventory not matching|inventory count wrong|physical count doesn't match system|on hand quantity incorrect|why is inventory off|stock count mismatch|inventory discrepancy",
    "approvedAnswerMarkdown": "## Inventory Quantities Not Matching Physical Counts\n\n### Common Causes\n1. **Unreceived deliveries** — Stock arrived but wasn't received in the system\n2. **Unrecorded shrink** — Breakage, theft, or spoilage not entered\n3. **Transfers not posted** — Inventory transferred between locations but not recorded\n4. **POS tracking not enabled** — Item's \"Track Inventory\" flag may be off, so sales don't decrement\n5. **86'd items** — Items marked as unavailable may still show system quantity\n\n### How to Investigate\n1. Go to the **Inventory** section (Retail or F&B)\n2. Find the item and check its **Movements History** — this shows every transaction that affected the quantity\n3. Compare the movements against your expected receipts, sales, and adjustments\n4. Use **Inventory Reconciliation** to systematically compare system vs physical counts\n5. Record any discrepancies as **Adjustments** or **Shrink** to correct the system\n\n### Prevention\n- Always receive deliveries promptly in the system\n- Record shrink/spoilage as it occurs\n- Run periodic physical counts and reconcile\n- Ensure all sold items have inventory tracking enabled",
    "status": "draft"
  },
  {
    "slug": "erp-howto-transfer-inventory",
    "moduleKey": "inventory",
    "route": "/inventory/receiving",
    "questionPattern": "transfer inventory between locations|move stock to another location|how to transfer inventory|inter-location transfer|send inventory to another store|inventory transfer",
    "approvedAnswerMarkdown": "## Transferring Inventory Between Locations\n\n1. Go to **Inventory** → **Receiving**\n2. Click **New Transfer**\n3. Select the **source location** (where the inventory is now)\n4. Select the **destination location** (where it's going)\n5. Add items and quantities to transfer\n6. Review and **post** the transfer\n\nThe transfer will:\n- Decrease quantity at the source location\n- Increase quantity at the destination location\n- Create movement records at both locations for audit\n\n**Permission required:** `inventory.manage`",
    "status": "draft"
  },
  {
    "slug": "erp-howto-receive-inventory",
    "moduleKey": "inventory",
    "route": "/inventory/receiving",
    "questionPattern": "receive a purchase order|how to receive inventory|receive shipment|receive delivery|log incoming inventory|receiving stock|receive PO|receive goods",
    "approvedAnswerMarkdown": "## Receiving Inventory\n\nOppsEra uses **inventory receipts** to log incoming stock.\n\n### Full Receipt\n1. Go to **Inventory** → **Receiving**\n2. Click **New Receipt**\n3. Select the **vendor**\n4. Add line items — choose from the vendor's catalog or search all items\n5. Enter quantities received and verify costs\n6. Optionally add receiving charges (freight, handling)\n7. Click **Post Receipt** to finalize\n\n### Partial Receipt\nFollow the same steps but enter only the quantities actually received. The remaining quantities can be received on a subsequent receipt.\n\n### Tips\n- Costs on the receipt update inventory valuation\n- Landed cost allocation is available for distributing freight across line items\n- Posted receipts create GL entries for inventory and AP\n- You can **void** a posted receipt if it was entered in error (reverses all movements)\n\n**Permission required:** `inventory.manage`",
    "status": "draft"
  },
  {
    "slug": "erp-corrections-void-receipt",
    "moduleKey": "inventory",
    "route": "/inventory/receiving",
    "questionPattern": "cancel purchase order|void purchase order|cancel a receipt|void a receipt|undo a receipt|reverse receiving|how to cancel PO|void PO",
    "approvedAnswerMarkdown": "## Cancelling or Voiding an Inventory Receipt\n\n### If the Receipt Is Still a Draft\n- Open the draft receipt and click **Delete** — no inventory or GL impact.\n\n### If the Receipt Has Been Posted\n1. Go to **Inventory** → **Receiving**\n2. Find and open the posted receipt\n3. Click **Void Receipt**\n4. Confirm the void\n\nVoiding a posted receipt will:\n- Reverse all inventory quantity movements\n- Create reversing GL entries\n- If landed cost was allocated, those entries are also reversed\n\n**Note:** OppsEra uses receipt-based receiving rather than formal purchase orders. If you're looking for a PO approval workflow, that is not currently part of the system.\n\n**Permission required:** `inventory.manage`",
    "status": "draft"
  },
  {
    "slug": "cross-permissions-manage-users",
    "moduleKey": "settings",
    "route": "/settings",
    "questionPattern": "set user permissions|restrict employee access|change user role|manage permissions|who can do what|limit what employees can do|set up roles|permission settings|RBAC|role based access",
    "approvedAnswerMarkdown": "## Managing User Permissions\n\nOppsEra uses **role-based access control** with 6 predefined roles:\n\n| Role | Access Level |\n|------|-------------|\n| **Owner** | Full access to everything |\n| **Manager** | All operational features |\n| **Supervisor** | Most features except financial/admin |\n| **Cashier** | POS and basic operations |\n| **Server** | F&B POS and table service |\n| **Staff** | View-only and basic tasks |\n\n### How to Set a User's Role\n1. Go to **Settings** → **Users**\n2. Find the user\n3. Change their **Role** assignment\n4. Save\n\n### Manager PIN Override\n11 high-risk operations (void, comp, price override, large discounts, etc.) require a **Manager PIN** at the POS, regardless of the user's role. This adds a second layer of authorization.\n\n### What If I Need Custom Roles?\nCustom roles are not currently supported. The 6 predefined roles cover 62 individual permissions across all modules. If you need a specific permission combination, contact support.\n\n**Permission required:** `users.manage`",
    "status": "draft"
  },
  {
    "slug": "erp-config-add-location",
    "moduleKey": "settings",
    "route": "/settings/general",
    "questionPattern": "add new location|add department|add cost center|create new location|set up a new store|new branch|add a new site|create department",
    "approvedAnswerMarkdown": "## Adding a New Location, Department, or Cost Center\n\n1. Go to **Settings** → **General**\n2. Navigate to the **Locations** or **Departments** section\n3. Click **Add New**\n4. Fill in the required details (name, address, etc.)\n5. Save\n\n### Important Follow-Up Steps\nAfter adding a new location, you'll need to configure:\n- **Tax rates** for the new location (Accounting → Tax)\n- **GL mappings** so transactions at this location post to the correct accounts\n- **Inventory** — set up initial stock levels\n- **POS terminals** — configure registers and payment devices\n- **User access** — ensure staff are assigned to the new location\n\n**Permission required:** `settings.update`",
    "status": "draft"
  },
  {
    "slug": "erp-integrations-payroll-sync",
    "moduleKey": null,
    "route": null,
    "questionPattern": "payroll not syncing|payroll data sync issue|payroll integration|connect payroll|payroll export|time clock sync|payroll system|where is payroll",
    "approvedAnswerMarkdown": "## Payroll in OppsEra\n\n**OppsEra does not include a payroll module.** There is no payroll processing, paycheck generation, or payroll tax filing.\n\n### What IS Available\n- **Tip Management** — Tip pools, tip finalization, and tip payouts (with GL posting)\n- **Commissions** — Spa provider commission rules, calculation, and ledger\n- **Expense Reimbursements** — Track and reimburse employee expenses\n- **CSV Export** — Export sales, tip, and labor data to CSV for import into your payroll provider\n\n### If You Need Payroll\nUse an external payroll provider (ADP, Gusto, Paychex, etc.) and export the relevant data from OppsEra via CSV reports.\n\nIf you were expecting payroll to sync with an external system and it's not working, please clarify what data you're trying to export and we can help you find the right report.",
    "status": "draft"
  },
  {
    "slug": "cross-reporting-export-csv",
    "moduleKey": "reporting",
    "route": null,
    "questionPattern": "export to excel|export to CSV|download report|export data|save as spreadsheet|export to file|download data|get data out of system|export spreadsheet",
    "approvedAnswerMarkdown": "## Exporting Data to Excel or CSV\n\nMost report pages have a **Download/Export** button that exports the current view to CSV format (compatible with Excel).\n\n### Where to Find Exports\n- **Accounting Reports** — Each report (P&L, Balance Sheet, Trial Balance, Tax, etc.) has its own export button\n- **Sales Reports** — Daily sales, sales history, item sales\n- **Inventory Reports** — Inventory summary, movements\n- **Customer Reports** — Customer lists, spending analysis\n- **PMS Reports** — Manager's report, occupancy, revenue\n- **Spa Reports** — Provider performance, service analytics\n\n### How to Export\n1. Navigate to the report you want\n2. Set your filters (date range, location, etc.)\n3. Click the **Export** or **Download CSV** button\n4. The file will download to your computer\n5. Open in Excel, Google Sheets, or any spreadsheet application\n\n**Permission required:** `reports.export`\n\n**Tip:** If you don't see the export button, you may not have the `reports.export` permission. Ask your administrator to grant it.",
    "status": "draft"
  },
  {
    "slug": "erp-troubleshoot-tax-calculation",
    "moduleKey": "accounting",
    "route": "/accounting/tax",
    "questionPattern": "sales tax wrong|tax calculation incorrect|wrong tax amount|tax not right|why is tax wrong|tax rate issue|incorrect tax on invoice|tax miscalculation",
    "approvedAnswerMarkdown": "## Sales Tax Calculating Incorrectly\n\n### Common Causes\n1. **Wrong tax rate on item** — The item may be assigned to the wrong tax group, or the tax rate in that group is incorrect\n2. **Inclusive vs. exclusive mismatch** — Check if the item uses tax-inclusive pricing (tax embedded in price) vs. exclusive (tax added on top)\n3. **Tax group not assigned** — The item may not have a tax group at all, causing zero tax\n4. **Location-specific rate** — Different locations may have different tax rates; check the rate for this specific location\n5. **Tax-exempt flag** — The order or customer may be marked as tax-exempt\n\n### How to Check\n1. Go to **Accounting** → **Tax**\n2. Review the tax rates configured for your location\n3. Check the item in **Catalog** — verify its tax group assignment\n4. Look at the **Sales Tax Liability Report** to see how tax is being calculated across transactions\n\n### Important Notes\n- Tax rates are **manually configured** — there is no automatic tax rate lookup service\n- All tax math uses **integer cents** to avoid rounding errors\n- Changes to tax rates apply to **new transactions only** — existing orders are not retroactively recalculated\n\n**If you believe the tax engine itself is miscalculating, please escalate to support with a specific order number so we can investigate.**",
    "status": "draft"
  },
  {
    "slug": "erp-integrations-external-systems",
    "moduleKey": null,
    "route": null,
    "questionPattern": "connect to QuickBooks|integrate with Stripe|connect accounting software|QuickBooks integration|Xero integration|Stripe integration|sync with external system|connect ERP to other software|third party integration",
    "approvedAnswerMarkdown": "## External Integrations\n\n### What's Currently Available\n- **CardPointe** — Payment processing for POS card-present transactions (terminals, card readers)\n- **Stripe** — Deposit authorization and payment for hotel/PMS reservations\n- **Twilio** — SMS notifications for reservations and host stand waitlist\n\n### What's NOT Available\n- **QuickBooks** — No integration. OppsEra has its own full accounting module (GL, AP, AR, financial statements, period close)\n- **Stripe for POS** — POS uses CardPointe, not Stripe\n- **Xero, Sage, FreshBooks** — No integration\n- **External payroll** — No direct sync; use CSV export\n\n### Why No QuickBooks?\nOppsEra includes a complete, built-in accounting system with chart of accounts, journal entries, bank reconciliation, financial statements, and period close. It replaces the need for external accounting software rather than integrating with it.\n\nIf you need to move data to an external system, use the **CSV export** feature available on all reports.",
    "status": "draft"
  },
  {
    "slug": "cross-howto-audit-history",
    "moduleKey": "accounting",
    "route": "/accounting/audit",
    "questionPattern": "find audit history|see who changed a record|audit log|audit trail|who edited this|change history|track changes|who made this change|activity log",
    "approvedAnswerMarkdown": "## Finding Audit History\n\nOppsEra tracks changes at multiple levels:\n\n### Platform Audit Log\n- Go to **Accounting** → **Audit**\n- Shows all write operations across the system (who, what, when)\n- Filter by user, module, date range, or action type\n\n### Customer-Specific History\n- Open a customer profile → **Activity** tab\n- Shows field-level changes, communications, visits, and tag changes\n\n### Financial Audit Trail\n- **GL Tender Audit Trail** — tracks every payment and its GL posting\n- **Tag Audit Log** — tracks customer tag assignments and removals\n- **Item Change Log** — tracks catalog item modifications\n\n### Tips\n- Every write operation that requires audit is automatically logged\n- The audit log includes the old value and new value for changed fields\n- Entries cannot be deleted or modified\n\n**Permission required:** `audit.view`",
    "status": "draft"
  },
  {
    "slug": "pos-howto-ring-up-sale",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "how to ring up a sale|ring up sale|make a sale|start a transaction|sell an item|process a sale|how to use the POS|how do I sell something|ring something up|new sale",
    "approvedAnswerMarkdown": "## Ringing Up a Sale\n\nOppsEra has two POS modes — the workflow depends on which one you're using:\n\n### Retail POS\n1. Go to **POS** → **Retail**\n2. Tap items from the **quick menu grid** or use the **search bar** to find items\n3. Items appear in the **cart** on the right\n4. Adjust quantities, add modifiers, or apply discounts as needed\n5. When ready, click **Pay** or **Tender**\n6. Select payment method (cash, card, gift card, etc.)\n7. Complete the transaction\n\n### F&B (Table Service) POS\n1. Go to **POS** → **F&B**\n2. **Open a tab** on a table from the floor plan\n3. Add items from the menu, assigning courses (appetizer, entree, etc.)\n4. **Send to Kitchen** when ready\n5. When guests are done, **Present Check**\n6. Process payment\n\n### Quick Tips\n- Use `@` in the search bar to search for customers\n- Use `#` in the search bar to recall held orders\n- Barcode scanning is supported via USB scanner\n\n**Permission required:** `orders.create`",
    "status": "draft"
  },
  {
    "slug": "pos-howto-apply-discount",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "apply a discount|add discount|promo code|apply promo|percentage off|dollar off|how to discount|give a discount|discount an item|coupon",
    "approvedAnswerMarkdown": "## Applying Discounts at the POS\n\n### Line-Item Discount (single item)\n1. Select the item in the cart\n2. Tap **Discount**\n3. Choose a quick percentage (5%, 10%, 15%, 20%) or enter a custom amount\n4. Select percentage or dollar amount\n5. Confirm\n\n### Order-Level Discount (entire order)\n1. Tap the **Discount** button on the order toolbar\n2. Enter a percentage or fixed dollar amount\n3. Add a reason (required)\n4. Confirm\n\n### Notes\n- **No promo code system** — discounts are applied manually\n- Large discounts may require **manager PIN override**\n- All discounts are tracked in reporting and can be reviewed by managers\n- Customer-specific discount rules can be configured on the customer profile\n\n**Permission required:** `discounts.apply`",
    "status": "draft"
  },
  {
    "slug": "pos-corrections-void",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "void an item|void a transaction|void order|cancel transaction|remove item from order|void the whole order|undo a sale|cancel a sale|delete an item from order|void line item",
    "approvedAnswerMarkdown": "## Voiding Items or Transactions\n\n### Void a Single Item\n1. Select the item in the cart/tab\n2. Tap **Void**\n3. Enter a **reason** (required)\n4. Confirm with **manager PIN** (required)\n\nThe item will appear struck through and won't be charged.\n\n### Void an Entire Order\n1. Open the order\n2. Tap **Order Actions** → **Void Order**\n3. Enter a reason\n4. Confirm with manager PIN\n\n### Important\n- Voids require `orders.void` permission AND manager PIN override\n- Voided items still appear in the order history (for audit) but are excluded from totals\n- In F&B, voiding an item also updates the KDS (kitchen display)\n- If the order has already been paid, you may need to process a **refund/return** instead (see: how to process a refund)\n\n**Permission required:** `orders.void` + Manager PIN",
    "status": "draft"
  },
  {
    "slug": "pos-corrections-refund-return",
    "moduleKey": "orders",
    "route": "/orders",
    "questionPattern": "issue a refund at POS|process a return|return an item|give money back|customer wants refund|how to refund|return merchandise|refund a transaction|process POS refund|take back an item",
    "approvedAnswerMarkdown": "## Processing a Refund or Return\n\n1. Go to **Orders**\n2. Find the original order (search by order number or customer name)\n3. Open the order detail\n4. Click **Return** in the top-right corner\n5. Select the items being returned and enter quantities\n6. Select a **return reason**\n7. Confirm the return\n\nThe system will:\n- Create a return order linked to the original\n- Reverse the payment (refund to original payment method)\n- Update inventory if the items are tracked\n\n### Notes\n- Requires `returns.create` permission\n- Card refunds go back to the original card via CardPointe\n- Cash refunds require cash in the drawer\n- This is for POS returns. For accounting-level credit memos, use **Customers → Billing**\n\n**Permission required:** `returns.create`",
    "status": "draft"
  },
  {
    "slug": "pos-hardware-receipt-printer",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "receipt printer not printing|printer not working|can't print receipt|receipt won't print|printer offline|no receipt printing|printer issue|receipt not coming out|print not working",
    "approvedAnswerMarkdown": "## Receipt Printer Not Printing\n\nOppsEra prints receipts via the browser's print system (80mm thermal printer format).\n\n### Troubleshooting Steps\n1. **Check printer hardware** — Is it powered on? Is the paper loaded? Any paper jam?\n2. **Check connection** — USB or network cable securely connected?\n3. **Check OS default printer** — The receipt printer must be set as the **default printer** in your operating system\n4. **Try a test print** — Print a test page from your OS printer settings\n5. **Check browser settings** — Make sure the browser isn't blocking print popups\n6. **Try a different browser** — Chrome works best for thermal printing\n\n### If It Still Doesn't Work\n- Restart the printer\n- Restart the browser\n- Check if other applications can print to this printer\n- If the printer prints from other apps but not OppsEra, it may be a browser configuration issue\n\n**If basic troubleshooting doesn't resolve it, please contact support with your printer model and connection type (USB/network).**",
    "status": "draft"
  },
  {
    "slug": "pos-hardware-cash-drawer",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "cash drawer not opening|drawer won't open|cash register won't open|drawer stuck|cash drawer problem|till not opening|drawer doesn't pop|register drawer issue",
    "approvedAnswerMarkdown": "## Cash Drawer Not Opening\n\nCash drawers typically open via a command sent through the **receipt printer** (RJ-11 cable from printer to drawer).\n\n### Troubleshooting Steps\n1. **Check the receipt printer** — If the printer isn't working, the drawer won't get the open command either. Fix the printer first.\n2. **Check the physical connection** — Is the RJ-11 cable from the printer to the drawer securely connected?\n3. **Is the drawer key-locked?** — Many cash drawers have a key lock that prevents electronic opening\n4. **Try a manual open** — Use the drawer key to manually open and verify the mechanism isn't jammed\n5. **Try a No Sale** — Use the **No Sale** drawer event button on the POS (requires `cash.drawer` permission) to send an explicit open command\n\n### If the Drawer Opens Manually but Not Electronically\n- The printer may not be sending the kick pulse\n- Try a different RJ-11 cable\n- Check if the printer model is compatible with your drawer\n\n**If troubleshooting doesn't resolve it, please contact support.**\n\n**Permission for No Sale:** `cash.drawer`",
    "status": "draft"
  },
  {
    "slug": "pos-howto-split-check",
    "moduleKey": "orders",
    "route": "/pos/fnb",
    "questionPattern": "split a check|split payment|split bill|divide check|separate checks|split between people|split the tab|pay separately|how to split|multiple payments on one order",
    "approvedAnswerMarkdown": "## Splitting Checks or Payments\n\nThere are several ways to split:\n\n### Split Tender (One Check, Multiple Payments)\nUse this when guests want to pay their share of one bill:\n1. On the payment screen, click **Split Tender**\n2. Add the first payment (e.g., $25 on Card A)\n3. Add the second payment (e.g., $25 on Card B)\n4. Continue until the full balance is covered\n\n### Split Check (F&B — Separate Checks)\nUse this when guests want separate checks:\n1. Open the tab\n2. Click **Split**\n3. Choose a mode: **By Seat**, **Even Split**, or **Custom**\n4. Drag items between checks (or let the system auto-split)\n5. Each check can be paid independently\n\n### Even Split\nDivide the total evenly among N guests:\n1. Click **Split** → **Even Split**\n2. Enter the number of guests\n3. Each guest's share is calculated automatically\n\n### Rejoin Checks\nIf you split in error, use **Rejoin Checks** to undo the split.",
    "status": "draft"
  },
  {
    "slug": "pos-corrections-reopen-ticket",
    "moduleKey": "orders",
    "route": "/orders",
    "questionPattern": "reopen a closed ticket|reopen a closed order|reopen tab|undo close|bring back closed order|ticket was closed too early|reopen transaction|reopen a check",
    "approvedAnswerMarkdown": "## Reopening a Closed Ticket\n\n1. Go to **Orders** (or find the tab in F&B)\n2. Find the closed order/ticket\n3. Click **Reopen**\n4. The order returns to an editable state\n\n### When to Use\n- Forgot to add items before closing\n- Need to apply a correction\n- Guest wants to add to their order after paying\n\n### Important Notes\n- Requires `orders.manage` permission\n- If the register shift or close batch has already been completed, reopening may affect the shift summary and Z-report\n- Reopening reverses the closed/paid status — you'll need to close and re-tender the order when done\n\n**Permission required:** `orders.manage`",
    "status": "draft"
  },
  {
    "slug": "pos-howto-transfer-tab",
    "moduleKey": "fnb",
    "route": "/pos/fnb",
    "questionPattern": "transfer a tab|move tab to another server|transfer ticket|change server on tab|hand off tab|move order to different register|transfer to another server|reassign tab",
    "approvedAnswerMarkdown": "## Transferring a Tab or Ticket\n\n### Transfer to Another Server\n1. Open the tab\n2. Tap **Transfer**\n3. Select the destination **server**\n4. Confirm\n\n### Transfer to Another Table\n1. Open the tab\n2. Tap **Transfer**\n3. Select the destination **table**\n4. Confirm\n\n### Bulk Transfer (Shift Change)\nWhen a server is leaving and needs to hand off all their tabs:\n1. Go to **Manage Tabs** panel\n2. Select multiple tabs\n3. Use **Bulk Transfer**\n4. Select the receiving server\n\n**Permission required:** `pos_fnb.tabs.transfer`",
    "status": "draft"
  },
  {
    "slug": "pos-billing-card-declined",
    "moduleKey": "payments",
    "route": "/pos/retail",
    "questionPattern": "card declined|payment declined|card not working|why did the card get declined|card rejected|payment failed|card won't go through|card denied|transaction declined",
    "approvedAnswerMarkdown": "## Card Payment Declined\n\nWhen a card is declined, the POS displays the reason from the payment processor (CardPointe).\n\n### Common Decline Reasons\n- **Insufficient funds** — Customer doesn't have enough balance\n- **Expired card** — Card is past its expiration date\n- **Incorrect PIN** — Wrong PIN entered (debit cards)\n- **Card restricted** — The card issuer has placed a restriction\n- **Suspected fraud** — The issuer flagged the transaction\n- **Do Not Honor** — Generic decline from the card issuer\n\n### What to Do\n1. Ask the customer to try a **different card**\n2. Suggest an **alternative payment method** (cash, gift card)\n3. If the terminal shows a specific error code, note it for support\n\n### If the Terminal Didn't Respond at All\nThat's a different issue — the terminal may be **offline**. See: \"Why is the credit card terminal offline?\"\n\n**Note:** OppsEra cannot override a decline — it comes from the customer's card issuer.",
    "status": "draft"
  },
  {
    "slug": "pos-hardware-terminal-offline",
    "moduleKey": "payments",
    "route": "/pos/retail",
    "questionPattern": "card terminal offline|terminal not connecting|credit card reader offline|terminal not responding|can't connect to terminal|payment device offline|card machine not working|terminal disconnected",
    "approvedAnswerMarkdown": "## Credit Card Terminal Offline\n\nOppsEra uses **CardPointe Bolt** terminals for card-present payments.\n\n### Troubleshooting Steps\n1. **Check terminal power** — Is it plugged in and turned on?\n2. **Check network connection** — The terminal connects via Ethernet or WiFi\n3. **Restart the terminal** — Power off, wait 10 seconds, power on\n4. **Check the CardPresentIndicator** — On the POS screen, look for the terminal status icon:\n   - Green = connected\n   - Yellow = connecting\n   - Red = offline\n5. **Verify HSN** — The terminal's Hardware Serial Number must be configured in your settings\n6. **Check network/firewall** — The terminal must be able to reach CardPointe's servers\n\n### If It Still Won't Connect\n- Verify the terminal's HSN matches what's configured in the system\n- Try a different network cable or WiFi network\n- Check if other devices on the same network have internet access\n\n**If basic troubleshooting doesn't resolve it, contact support with your terminal model and HSN.**",
    "status": "draft"
  },
  {
    "slug": "pos-howto-custom-item",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "add custom item|open price item|misc item|one-time item|item not in system|ring up something not in catalog|create ad hoc item|ring up miscellaneous|open ring",
    "approvedAnswerMarkdown": "## Adding a Custom or Open-Priced Item\n\n1. On the POS, click the **Custom Item** or **MISC** button\n2. Enter a **name** for the item\n3. Enter the **price**\n4. Set the **quantity**\n5. The item is added to the cart as a one-time entry\n\nThis creates a line item with a placeholder SKU — it won't affect inventory or catalog.\n\n### When to Use\n- Selling an item not yet in the catalog\n- One-time charges or services\n- Special requests\n\n**Permission required:** May require `price.override` depending on configuration",
    "status": "draft"
  },
  {
    "slug": "pos-config-edit-menu",
    "moduleKey": "catalog",
    "route": "/catalog",
    "questionPattern": "change menu items|edit menu|change pricing|update item price|modify menu|add modifier|change modifiers|edit item in catalog|update menu item|change item details",
    "approvedAnswerMarkdown": "## Changing Menu Items, Modifiers, or Pricing\n\n### Edit an Item\n1. Go to **Catalog** → **Items**\n2. Find the item you want to change\n3. Click to open the item detail\n4. Click **Edit**\n5. Make your changes (name, price, description, category, modifiers, tax group, inventory tracking)\n6. **Save**\n\n### Edit Modifiers\n1. On the item edit page, scroll to the **Modifier Groups** section\n2. Add, remove, or edit modifier groups and their options\n3. Set min/max selections, default options, and pricing for each modifier option\n\n### Edit Pricing\n- Prices in the catalog are stored in **dollars** (e.g., \"12.99\")\n- When sold at POS, prices are automatically converted to **cents** for calculation\n- Price changes take effect **immediately** on the POS\n\n**Permission required:** `catalog.manage`\n\n**Tip:** Changes to items, modifiers, and pricing are reflected on the POS right away — no restart or refresh needed.",
    "status": "draft"
  },
  {
    "slug": "pos-howto-clock-in-out",
    "moduleKey": "fnb",
    "route": "/pos/fnb",
    "questionPattern": "clock in|clock out|time clock|punch in|punch out|start shift|end shift|time tracking|log hours|track work hours",
    "approvedAnswerMarkdown": "## Clock In / Clock Out\n\n**OppsEra does not have a dedicated time-clock or employee hour tracking module.**\n\n### What IS Available\n- **Server PIN Login** (F&B) — Servers enter a 4-digit PIN to identify themselves on a shared terminal. This is for POS session management, not time tracking.\n- **Register Shift** (Retail) — Opening and closing a shift tracks the register session, not employee hours.\n\n### If You Need Time Tracking\nUse a dedicated time-and-attendance system alongside OppsEra. Popular options integrate via their own hardware (fingerprint scanners, badge readers) or mobile apps.\n\n### Were You Looking For Something Else?\n- **\"How do I open a register shift?\"** — See: How to close out the register\n- **\"How do I log in as a server?\"** — Enter your 4-digit server PIN on the F&B POS",
    "status": "draft"
  },
  {
    "slug": "pos-troubleshoot-tax-error",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "tax wrong on sale|POS tax incorrect|tax not calculating right at register|wrong tax at POS|sale shows wrong tax|tax amount is off|register tax issue",
    "approvedAnswerMarkdown": "## Tax Not Calculating Correctly on a Sale\n\n### Quick Checks\n1. **Is the order marked tax-exempt?** — Check if the tax-exempt toggle is on for this order\n2. **Is the item assigned to a tax group?** — Go to Catalog → find the item → check Tax Group assignment\n3. **Is the tax rate correct for this location?** — Go to Accounting → Tax and verify rates\n4. **Inclusive vs. exclusive** — Is the item using tax-inclusive pricing? This changes whether tax is added on top or embedded\n\n### How Tax Works\n- Tax rates are configured per item via tax groups\n- All math uses **integer cents** to avoid rounding errors\n- Tax is calculated per line item, then summed\n- Rounding uses proportional allocation with last-rate remainder (guarantees exact totals)\n\n### If the Rate Itself Is Wrong\nTax rates are manually configured. If your local tax rate changed, you need to update it in **Accounting → Tax**. Changes only apply to new orders.\n\n**If you believe the tax engine itself is miscalculating (not a config issue), please escalate with a specific order number.**",
    "status": "draft"
  },
  {
    "slug": "pos-howto-close-register",
    "moduleKey": "orders",
    "route": "/pos/close",
    "questionPattern": "close the register|close out register|end of day|close shift|cash out|Z report|end of day close|close the till|register closeout|close batch",
    "approvedAnswerMarkdown": "## Closing the Register / End of Day\n\n### Retail POS\n1. Click **Close Shift**\n2. Count your cash by denomination (bills and coins)\n3. Enter the **counted total**\n4. Optionally add notes\n5. Review the **shift summary**:\n   - Sales count and total\n   - Cash, card, and other tenders received\n   - Tips collected\n   - Paid-in, paid-out, cash drops\n   - Opening balance, expected cash, counted cash\n   - **Variance** (green = balanced, blue = over, red = short)\n6. Confirm and close\n\n### F&B Close Batch\n1. Go to **POS** → **Close**\n2. Complete **server checkouts** — each server's tabs, sales, tips, and cash owed\n3. Complete the **cash count**\n4. Review the **Z-Report** (gross sales, discounts, comps, voids, net sales, tax, tender breakdown, tips, covers)\n5. **Post batch to GL** to finalize\n\n**Permission required:** `shift.manage` (retail), `pos_fnb.close_batch` (F&B)",
    "status": "draft"
  },
  {
    "slug": "pos-troubleshoot-inventory-not-updating",
    "moduleKey": "inventory",
    "route": "/retail-inventory",
    "questionPattern": "inventory not updating after sale|stock not decreasing|sold item but inventory same|POS not deducting inventory|count not changing after sale|inventory stuck|sales not reducing stock",
    "approvedAnswerMarkdown": "## Inventory Not Updating After Sales\n\n### Most Likely Cause\nThe item's **Track Inventory** flag is not enabled.\n\n### How to Fix\n1. Go to **Catalog** → **Items**\n2. Find the item\n3. Click **Edit**\n4. Look for the **Track Inventory** toggle\n5. Enable it\n6. Save\n\nOnly items with inventory tracking enabled will decrement when sold at POS.\n\n### Other Possible Causes\n- **Different location** — The sale may have occurred at a different location than where inventory is stocked\n- **Item uses a different SKU** — The POS item and inventory item may not be linked correctly\n\n### How to Verify\n- Check the item's **Inventory Movements** history to see if sale events are being recorded\n- The POS item grid shows an **inventory indicator** (green = in stock, amber = low, red = out) for tracked items\n\n**Permission to edit items:** `catalog.manage`",
    "status": "draft"
  },
  {
    "slug": "pos-howto-reprint-receipt",
    "moduleKey": "orders",
    "route": "/orders",
    "questionPattern": "reprint receipt|print receipt again|get another copy of receipt|reprint a receipt|duplicate receipt|copy of receipt|print old receipt|receipt copy|reprint ticket",
    "approvedAnswerMarkdown": "## Reprinting a Receipt\n\n1. Go to **Orders**\n2. Find the order (search by order number, customer, or date)\n3. Open the order detail\n4. Click **Print Receipt**\n\nThe receipt will print to your default printer.\n\n### Alternatives\n- **Email receipt** — From the same order detail, click **Email Receipt** to send a digital copy to the customer's email\n- **Kitchen chits** — To reprint a kitchen chit, use the **Reprint** option from KDS management\n\n**No special permission required** to reprint receipts.",
    "status": "draft"
  },
  {
    "slug": "pos-config-assign-register",
    "moduleKey": "orders",
    "route": "/pos/retail",
    "questionPattern": "assign register to employee|change register|set up register|register assignment|which register am I on|employee register setup|assign terminal|switch register",
    "approvedAnswerMarkdown": "## Assigning a Register to an Employee\n\nOppsEra uses **session-based** register assignment, not permanent mappings.\n\n### F&B POS\n- Servers identify themselves by entering their **4-digit PIN** on a shared terminal\n- Multiple servers can use the same physical terminal\n- Each server's tabs and sales are tracked by their PIN\n\n### Retail POS\n- An employee **opens a shift** on a specific register\n- That register is \"theirs\" for the duration of the shift\n- To change registers: close the shift on the current register, open a new shift on the desired register\n\n### Setting Up Server PINs\nServer PINs are configured in user management (Settings → Users). Each server gets a unique 4-digit PIN.\n\n**Permission required:** `shift.manage` (to open/close shifts), `users.manage` (to set up PINs)",
    "status": "draft"
  },
  {
    "slug": "pos-troubleshoot-kds-not-receiving",
    "moduleKey": "kds",
    "route": "/pos/fnb",
    "questionPattern": "order not going to KDS|kitchen not receiving orders|KDS not showing tickets|order didn't send to kitchen|kitchen display not working|printer not getting order|nothing on kitchen screen|KDS issue|food not getting sent",
    "approvedAnswerMarkdown": "## Order Not Appearing on KDS or Kitchen Printer\n\nThis is a multi-step diagnostic:\n\n### Step 1: Was the Order Actually Sent?\nItems stay in **draft** until you press **Send to Kitchen** (or **Fire Course**). Check if the items have a \"sent\" status on the tab.\n\n### Step 2: Is a KDS Station Configured?\n- Check if a KDS station exists for your location\n- Each station routes specific item categories (e.g., \"grill\" station vs \"bar\" station)\n\n### Step 3: Is the KDS Terminal Online?\n- KDS terminals send a heartbeat — check if the terminal shows as active\n- Look for the terminal status indicator on the KDS display\n\n### Step 4: Item Routing\nThe routing logic checks in order:\n1. **Item-level** station assignment\n2. **Category-level** station assignment\n3. **Location default** station\n\nIf none are configured, the item has nowhere to route.\n\n### Step 5: Check Send Tracking\nThe system logs every dispatch attempt in `fnb_kds_send_tracking`. The **KDS diagnostics** tool can help identify routing failures.\n\n### For Kitchen Printers\nCheck printer routing rules: station-specific → location-level → terminal receipt printer fallback.\n\n**If the issue persists, please provide the order number so we can check the routing logs.**",
    "status": "draft"
  },
  {
    "slug": "res-howto-create-reservation",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "create a reservation|make a reservation|book a room|new reservation|new booking|how to reserve|book a table|schedule an appointment|make a booking",
    "approvedAnswerMarkdown": "## Creating a New Reservation\n\nOppsEra handles three types of reservations:\n\n### Hotel Room Reservation (PMS)\n1. Go to **PMS** → **Reservations** → **New Reservation**\n2. Search for or create a **guest profile**\n3. Select **room type**, **check-in** and **check-out** dates\n4. Choose a **rate plan**\n5. Add special requests or notes\n6. Click **Create Reservation**\n\nThe system will check availability, calculate nightly rates + tax, and create a folio.\n\n### Spa Appointment\n1. Go to **Spa** → **Appointments** → **New Appointment**\n2. Select the **service(s)**\n3. Choose a **provider** (or leave as any-available)\n4. Select a **date and time** from available slots\n5. Add customer information\n6. Confirm booking\n\n### Dining Reservation\n1. Go to the **Host Stand**\n2. Use the **Reservation Timeline** to add a new reservation\n3. Enter party name, size, date, and time\n\n**Permissions:** `pms.reservations.create`, `spa.appointments.create`, or `pos_fnb.host.*`",
    "status": "draft"
  },
  {
    "slug": "res-corrections-modify-cancel",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "modify reservation|cancel reservation|change a booking|edit a reservation|cancel a booking|update reservation|change dates|cancel appointment|reschedule",
    "approvedAnswerMarkdown": "## Modifying or Cancelling a Reservation\n\n### Hotel Reservation (PMS)\n**Modify:** Open the reservation → click **Edit** → change dates, room type, notes, or special requests → **Save**\n\n**Cancel:** Open the reservation → click **Cancel** → confirm. This deactivates the room block and closes the folio. If a deposit was collected, you may need to process a refund separately.\n\n### Spa Appointment\n**Reschedule:** Open the appointment → click **Reschedule** → select new time/provider → confirm.\n\n**Cancel:** Open the appointment → click **Cancel**. The cancellation engine calculates fees:\n- Less than 4 hours notice: 100% fee\n- 4–12 hours: 75% fee\n- 12–24 hours: 50% fee\n- More than 24 hours: no fee\n- First-cancellation grace and VIP exemptions may apply\n\nDeposit refund = deposit amount minus cancellation fee.\n\n### Dining Reservation\nEdit or remove from the host stand reservation timeline.\n\n**Note:** Cancellation fees and windows are configurable in settings.",
    "status": "draft"
  },
  {
    "slug": "res-availability-time-slot",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "time slot not available|why can't I book|date unavailable|no availability|slot unavailable|why is it blocked|can't make reservation for this date|no rooms available|fully booked",
    "approvedAnswerMarkdown": "## Why a Time Slot or Date Is Unavailable\n\n### Hotel Rooms (PMS)\n- **All rooms booked** — All rooms of that type are reserved for those dates\n- **Room out of order** — The room is marked as out-of-order for maintenance\n- **Rate restriction** — The rate plan may have a closed-to-arrival, min-stay, max-stay, or stop-sell restriction for that date\n- **Group block** — A group booking may have consumed the available inventory\n\n**Check:** PMS → Calendar to see what's occupying the rooms.\n\n### Spa Appointments\n- **Provider unavailable** — The provider has time-off or is outside their availability window\n- **Provider busy** — Another appointment at that time\n- **Resource busy** — The required room/equipment is booked\n- **Customer overlap** — The same customer already has an appointment at that time\n- **Provider not eligible** — The selected provider can't perform that service\n\n**Check:** Spa → Calendar to see provider schedules.\n\n### Dining\n- **Table capacity** — All tables are reserved or occupied\n- **Closed time window** — Outside configured booking hours\n\n**Check:** Host Stand floor map for real-time table status.",
    "status": "draft"
  },
  {
    "slug": "res-howto-add-guest",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "add guest to reservation|add person to booking|add another guest|additional guest|add companion|more people on reservation|increase party size",
    "approvedAnswerMarkdown": "## Adding a Guest to an Existing Reservation\n\n### Hotel (PMS)\n1. Open the reservation\n2. Add additional **linked guest profiles** to the reservation\n3. Save\n\n### Spa\n1. Open the appointment\n2. Click **Add Service** to add additional services for the new guest\n3. Multi-service appointments support multiple guests\n\n### Dining\n1. On the Host Stand, find the reservation on the timeline\n2. Edit the reservation and increase the **party size**\n3. Verify the table can accommodate the larger party\n\n**Note:** For PMS, adding a guest doesn't change the room type or rate unless you switch to a larger room. For spa, each additional person needs their own service line.",
    "status": "draft"
  },
  {
    "slug": "res-howto-move-reservation",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "move reservation|change table|change room|different time|reschedule booking|switch rooms|change assigned room|drag reservation|move to another table",
    "approvedAnswerMarkdown": "## Moving a Reservation\n\n### Hotel (PMS)\n- **Change room:** Open the reservation → click **Move** → select a new room (system checks availability) → confirm\n- **Change dates:** Open the reservation → click **Resize** → select new check-in/check-out dates → confirm (recalculates rates)\n- **Calendar:** You can also drag reservations on the PMS Calendar to move them\n\n### Spa\n- Open the appointment → click **Reschedule** → select a new date, time, or provider → confirm\n\n### Dining\n- On the Host Stand timeline, drag the reservation to a new time\n- Or edit the reservation and change the table assignment\n\n**Note:** Moving a hotel reservation recalculates rates based on the new dates and rate plan. Moving a spa appointment checks the new provider's availability.",
    "status": "draft"
  },
  {
    "slug": "res-howto-check-in",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "check in guest|mark as arrived|guest arrived|check in a reservation|front desk check in|mark arrived|guest is here|arrival check-in",
    "approvedAnswerMarkdown": "## Checking In a Guest\n\n### Hotel (PMS)\n1. Go to **PMS** → **Reservations** or **Front Desk**\n2. Find the reservation\n3. Click **Check In**\n4. The system will:\n   - Auto-assign a room if not pre-assigned\n   - Post the first night's room charges to the folio\n   - Update the room status to OCCUPIED\n   - Start the nightly charge posting schedule\n5. Early check-in is supported — the system adjusts dates automatically\n\n### Spa\n1. Open the appointment\n2. Click **Check In**\n3. The appointment moves to \"Checked In\" status, ready for service\n\n### Dining\n1. On the Host Stand, find the guest on the waitlist or reservation timeline\n2. Click **Mark Arrived** or **Seat** to assign them to a table\n3. Guests can also self-check-in via QR code\n\n**Permission:** `pms.front_desk.check_in`, `spa.appointments.manage`",
    "status": "draft"
  },
  {
    "slug": "res-howto-no-show",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "handle no show|late arrival|guest didn't show up|no show|mark as no show|what to do about no show|guest never arrived|no show fee",
    "approvedAnswerMarkdown": "## Handling No-Shows and Late Arrivals\n\n### Hotel (PMS)\n1. Open the reservation\n2. Click **No-Show** (only available after the check-in date has passed)\n3. The system deactivates the room block and updates the reservation status\n4. No-shows can also run automatically via a **nightly auto-no-show job** with a configurable grace period\n\n### Spa\n1. Open the appointment\n2. Click **No-Show**\n3. The **no-show fee engine** calculates the fee (configurable, defaults to 100% of service price)\n4. The fee is offset against any deposit already collected:\n   - If fee > deposit → remaining amount is charged\n   - If fee ≤ deposit → excess deposit is refunded\n5. Waiver rules may apply: first no-show grace, VIP/Platinum member exemption\n\n### Dining\nOn the Host Stand, you can remove the guest from the reservation timeline or mark them as a no-show for tracking.\n\n### Reporting\nNo-show data feeds into reports: PMS Managers Report, Spa Reporting Dashboard.",
    "status": "draft"
  },
  {
    "slug": "res-config-block-resources",
    "moduleKey": "pms",
    "route": null,
    "questionPattern": "block off rooms|block off tables|block time off|close a room|mark room unavailable|out of order|block off resource|maintenance block|block off calendar",
    "approvedAnswerMarkdown": "## Blocking Off Resources\n\n### Hotel Rooms\n- **Out of Order:** Go to PMS → Rooms → select room → **Set Out of Order**. This removes the room from availability.\n- **Maintenance Block:** Create a room block of type MAINTENANCE with a date range. The room is blocked for those dates.\n- **House Use:** Block type HOUSE_USE for internal/complimentary use.\n\n### Spa Resources\n- **Provider Time-Off:** Go to Spa → Providers → select provider → **Add Time Off** (date range + reason). The provider won't appear in availability.\n- **Resource/Room:** Manage resource availability from Spa → Resources.\n\n### Dining Tables\n- Tables are managed from the **Floor Plan Editor**\n- You can change table status (available, reserved, occupied, closed) from the host stand\n\n### Note on Golf\nGolf tee time management is not currently available in the web application.",
    "status": "draft"
  },
  {
    "slug": "res-config-booking-rules",
    "moduleKey": "pms",
    "route": "/pms/rate-plans",
    "questionPattern": "booking rules|minimum notice|cancellation window|cancellation policy|minimum stay|advance booking|booking restrictions|how far in advance|cancellation fee setup",
    "approvedAnswerMarkdown": "## Configuring Booking Rules and Cancellation Policies\n\n### Hotel (PMS)\n**Rate Restrictions** — configured per rate plan:\n1. Go to **PMS** → **Rate Plans** → select or create a rate plan\n2. Set restrictions:\n   - **Minimum stay** — minimum number of nights required\n   - **Maximum stay** — maximum number of nights allowed\n   - **Closed to arrival** — no check-ins on specific dates\n   - **Closed to departure** — no check-outs on specific dates\n   - **Stop sell** — completely block a rate plan for specific dates\n\n**Deposit Policy:**\n- Configure per property: first night, percentage, or fixed amount\n- Charge timing: at booking or N days before arrival\n\n### Spa\nGo to **Spa** → **Settings**:\n- **Cancellation window** — hours before appointment (e.g., 24 hours)\n- **Cancellation fee tiers** — different percentages by notice period\n- **No-show fee** — separate fee configuration\n- **Deposit requirement** — percentage or flat amount\n- **Waivers** — first-cancellation grace, VIP exemption\n\n### Dining (Host Stand)\nGo to **Host** → **Waitlist Config**:\n- Max party size\n- Time windows\n- Auto-quote wait times\n- SMS notification settings",
    "status": "draft"
  },
  {
    "slug": "res-notifications-not-received",
    "moduleKey": "pms",
    "route": null,
    "questionPattern": "customer didn't get confirmation|email not received|text not received|confirmation not sent|no confirmation email|guest didn't get email|SMS not delivered|booking confirmation missing",
    "approvedAnswerMarkdown": "## Customer Not Receiving Confirmation\n\n### Troubleshooting Steps\n1. **Verify contact info** — Is the customer's email address/phone number correct on their profile?\n2. **Check spam/junk** — Ask the customer to check spam folders\n3. **Check message log** — PMS maintains a communication log showing delivery status\n4. **Verify template exists** — PMS uses message templates. Ensure a confirmation template is configured for this event type.\n\n### Email\n- Spa booking confirmations are sent automatically and are **non-fatal** (if sending fails, the booking still succeeds but the error is logged)\n- PMS emails use the `send-reservation-message` command with configurable templates\n- Check that your email service is properly configured\n\n### SMS\n- SMS is sent via Twilio. Verify:\n  - Twilio is configured with valid credentials\n  - The customer's phone number includes the country code\n  - Your Twilio account has sufficient balance\n\n### Resend\nYou can manually resend from the reservation or appointment detail page.\n\n**If messages are consistently not delivering, please escalate — there may be an email/SMS service configuration issue.**",
    "status": "draft"
  },
  {
    "slug": "res-notifications-resend-confirmation",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "resend confirmation|send confirmation again|re-send booking email|resend reservation email|send another confirmation|resend text confirmation|email confirmation again",
    "approvedAnswerMarkdown": "## Resending a Confirmation\n\n### Hotel (PMS)\n1. Open the reservation\n2. Click **Send Message** or **Resend Confirmation**\n3. Select the template (email or SMS)\n4. Confirm\n\nThe communication is logged in the message history.\n\n### Spa\n1. Open the appointment\n2. Click **Resend Confirmation**\n3. The booking confirmation email is re-sent to the customer's email on file\n\nSpa confirmation emails include:\n- Service, provider, date/time, duration, price\n- Deposit paid and cancellation policy\n- \"Manage Appointment\" link\n- Google Calendar and Outlook Calendar add links\n\n### Notes\n- Make sure the customer's email/phone is correct before resending\n- Each send is logged for audit",
    "status": "draft"
  },
  {
    "slug": "res-billing-collect-deposit",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "collect a deposit|take a deposit|prepayment|take payment upfront|collect deposit for reservation|require deposit|charge deposit|advance payment|booking deposit",
    "approvedAnswerMarkdown": "## Collecting a Deposit or Prepayment\n\n### Hotel (PMS)\nDeposits use Stripe for card authorization:\n1. Open the reservation\n2. Click **Collect Deposit**\n3. Enter or select the guest's payment method\n4. The system creates an **authorization hold** (not a charge) for the deposit amount\n5. The hold can be **captured** later (at check-in or per your policy)\n\n**Deposit policy options** (configured per property):\n- **First night** — deposit = one night's rate\n- **Percentage** — deposit = X% of total stay\n- **Fixed amount** — deposit = flat dollar amount\n- **Charge timing** — at booking or N days before arrival\n\n### Spa\nDeposits are collected as part of the booking flow:\n- Amount calculated from spa settings (percentage or flat)\n- **Auto-waived** for walk-in bookings, front desk bookings, and Platinum/VIP members\n- Manual override amount supported\n\n**Note:** PMS uses Stripe for deposits. POS uses CardPointe for payment processing. These are separate payment systems.",
    "status": "draft"
  },
  {
    "slug": "res-billing-refund-deposit",
    "moduleKey": "pms",
    "route": "/pms/reservations",
    "questionPattern": "refund deposit|return deposit|give deposit back|cancel and refund|deposit refund|get deposit back|refund prepayment|refund a booking deposit",
    "approvedAnswerMarkdown": "## Refunding a Deposit\n\n### Hotel (PMS)\n1. Open the reservation\n2. Go to the payment/folio section\n3. Find the deposit transaction\n4. Click **Refund**\n5. The system processes a Stripe refund to the original card\n\n**Note:** Whether a full or partial refund is appropriate depends on your deposit/cancellation policy.\n\n### Spa\nDeposit refunds are automatically calculated by the **cancellation engine**:\n- Refundable amount = deposit minus cancellation fee\n- If the cancellation fee exceeds the deposit, the remaining amount is charged\n- If the deposit exceeds the fee, the excess is refunded\n\n**Cancellation fee tiers** (configurable):\n- Less than 4 hours: 100% fee\n- 4–12 hours: 75% fee\n- 12–24 hours: 50% fee\n- 24+ hours: no fee\n\n**Waiver rules:** First-cancellation grace, VIP/Platinum member exemption, walk-in bookings.\n\n**High-value refunds should be reviewed by a manager.** If there's a dispute about the refund amount, escalate to finance.",
    "status": "draft"
  },
  {
    "slug": "res-config-capacity-limits",
    "moduleKey": "pms",
    "route": null,
    "questionPattern": "capacity limits|max party size|maximum occupancy|set capacity|limit bookings|max guests|max seats|how many can I book|room capacity",
    "approvedAnswerMarkdown": "## Setting Capacity Limits\n\n### Hotel (PMS)\n- **Room types** have a max occupancy setting\n- The `count-available-rooms-by-type` query enforces this when checking availability\n- Configure room types in PMS settings\n\n### Spa\n- **Provider schedules** limit concurrent appointments per provider\n- **Resources** (rooms, equipment) have capacity constraints\n- The availability engine respects both when returning available slots\n\n### Dining (Host Stand)\n- **Max party size** — configure in Host → Waitlist Config\n- **Table capacity** — set per table in the Floor Plan editor\n- **Cover balance** — the host stand shows a real-time cover balance (total capacity vs. current/upcoming guests)\n\n### Tips\n- PMS: Edit room types to set max occupancy\n- Spa: Edit provider availability windows and resource capacity\n- Dining: Edit tables in the floor plan editor and waitlist config for party size limits",
    "status": "draft"
  },
  {
    "slug": "res-howto-recurring-reservation",
    "moduleKey": "spa",
    "route": "/spa/appointments/new",
    "questionPattern": "recurring reservation|recurring booking|repeat booking|recurring appointment|weekly appointment|standing reservation|repeating booking|regular booking|series booking",
    "approvedAnswerMarkdown": "## Creating Recurring Reservations or Appointments\n\n### Spa — Recurring Appointments ✅\nSpa has a dedicated **create recurring appointment** feature:\n1. Go to **Spa** → **Appointments** → **New Appointment**\n2. Set up the appointment details (service, provider, time)\n3. Select **Recurring**\n4. Choose the frequency (weekly, biweekly, etc.) and end date\n5. The system creates individual appointments for each occurrence\n\n### Hotel (PMS) — No Native Recurring ⚠️\nPMS does not have a recurring reservation feature. Alternatives:\n- **Group bookings** — for block reservations over a date range\n- **Create individual reservations** — manually create each one\n\n### Dining — No Recurring ⚠️\nThe host stand does not support recurring dining reservations. Each reservation must be created individually.",
    "status": "draft"
  },
  {
    "slug": "res-howto-manage-waitlist",
    "moduleKey": "pms",
    "route": null,
    "questionPattern": "manage waitlist|waitlist management|how does the waitlist work|add to waitlist|view waitlist|waitlist queue|waiting list|join waitlist|waitlist settings",
    "approvedAnswerMarkdown": "## Managing the Waitlist\n\nOppsEra has **three separate waitlist systems** depending on the product area:\n\n### Dining Waitlist (Host Stand)\nThe most interactive waitlist — designed for walk-in guests:\n1. Go to the **Host Stand**\n2. **Add** a guest to the waitlist (name, party size, notes)\n3. The system estimates wait time\n4. When a table opens, **Offer Table** to the guest\n5. If accepted, **Seat** them directly from the waitlist\n6. **SMS notifications** can be sent to notify guests when their table is ready\n\nFeatures: analytics, merge/split entries, bump priority, waitlist quotes, QR code for guest self-join.\n\n### Hotel Waitlist (PMS)\nFor when rooms are sold out:\n- Guests are added with **date flexibility** preferences (exact, ±1 day, ±3 days, ±1 week, any)\n- When a cancellation occurs, the **scoring engine** ranks waitlist entries by room type match, date overlap, flexibility, and VIP/deposit status\n- Offers are sent automatically; guests can accept or decline\n\n### Spa Waitlist\nFor when preferred providers or times are unavailable:\n- Managed from Spa → Waitlist\n- **Rebooking engine** suggests alternatives when slots open up\n- Waitlist stats available for analytics\n\n**Permissions:** Vary by product area.",
    "status": "draft"
  },
  {
    "slug": "res-howto-assign-resources",
    "moduleKey": "pms",
    "route": null,
    "questionPattern": "assign to staff|assign to table|assign to room|assign provider|assign resource|which room|which table|assign server|resource assignment|assign specific room",
    "approvedAnswerMarkdown": "## Assigning Reservations to Staff, Tables, or Resources\n\n### Hotel — Room Assignment\n- **Pre-assign:** On the reservation, select a specific room from the available rooms of that type\n- **Auto-assign at check-in:** Leave the room unassigned — the system's **room assignment engine** will pick the best available room at check-in\n- **Move:** Use the Move command to change the assigned room after check-in\n\n### Spa — Provider Assignment\n- **Pre-assign:** When creating the appointment, select a specific provider\n- **Any-available:** Leave the provider as \"any\" and the availability engine shows all eligible providers' slots\n- **Reassign:** Reschedule the appointment to change providers\n\n### Dining — Table Assignment\n- **From the host stand:** Select a waitlist entry or reservation, then click a table on the floor plan to seat them\n- **Assign mode:** The host stand has an explicit \"assign mode\" for seating workflow\n- **Server assignment:** Tables belong to server sections; seating at a table auto-assigns the server\n\nAll systems support both pre-assignment (at booking time) and at-service-time assignment.",
    "status": "draft"
  },
  {
    "slug": "res-troubleshoot-double-booking",
    "moduleKey": "pms",
    "route": null,
    "questionPattern": "double booking|overlapping reservations|two bookings same time|overbooking|double booked|overlap conflict|same room booked twice|booking conflict|concurrent bookings",
    "approvedAnswerMarkdown": "## Double Bookings or Overlapping Reservations\n\nThis should not normally happen — OppsEra has availability checks built into every booking path.\n\n### What to Check First\n1. **Was a restriction override used?** — Staff can override rate restrictions when creating reservations. If someone overrode availability, that could cause a conflict.\n2. **Group blocks** — Group bookings reserve blocks of rooms. If individual reservations were also made for the same rooms, there may be overlap.\n3. **Channel manager** — If external booking channels are configured, simultaneous bookings from different sources could create a race condition.\n\n### For Spa\n- Check if the provider was manually double-booked by different staff members\n- The conflict detector checks for: provider_busy, resource_busy, and customer_overlap\n\n### What to Do\n1. Identify which booking should take priority\n2. Move or cancel the other booking\n3. If this is happening repeatedly, **please escalate to support** — it may indicate a concurrency issue that needs investigation\n\n**This is likely a bug if it's happening without override. Please provide specific booking IDs when reporting.**",
    "status": "draft"
  },
  {
    "slug": "res-integrations-calendar-sync",
    "moduleKey": "pms",
    "route": null,
    "questionPattern": "sync with Google Calendar|calendar sync|sync reservations|Outlook sync|external calendar|Google Calendar integration|sync with calendar app|calendar integration|iCal sync",
    "approvedAnswerMarkdown": "## Calendar Sync and External Channel Integration\n\n### What's Currently Available\n\n**Spa — Calendar Links (One-Way)**\nSpa booking confirmation emails include:\n- **Google Calendar** deep-link (adds the appointment to Google Calendar)\n- **Outlook Calendar** deep-link (adds to Outlook)\n\nThese are one-way \"add to calendar\" links — there is no two-way sync.\n\n**PMS — Channel Manager (Infrastructure Only)**\nThe system has the infrastructure for OTA/channel manager integration:\n- Create and configure channels\n- Sync tracking and logging\n- Credential and mapping storage\n\nHowever, actual OTA API adapters (Booking.com, Expedia, etc.) are **not yet connected**. The plumbing is in place for future implementation.\n\n### What's NOT Available\n- Two-way Google Calendar sync\n- iCal feed export\n- Real-time external calendar sync\n- Live OTA channel integration\n\n### Workaround\nFor now, use the calendar deep-links in confirmation emails to add individual bookings to personal calendars. For bulk calendar management, the PMS Calendar and Spa Calendar views within OppsEra are the primary scheduling tools.",
    "status": "draft"
  },
  {
    "slug": "res-reporting-booking-reports",
    "moduleKey": "pms",
    "route": "/pms/reports",
    "questionPattern": "booking reports|reservation reports|cancellation report|no show report|occupancy report|utilization report|booking analytics|reservation analytics|how many bookings",
    "approvedAnswerMarkdown": "## Reservation and Booking Reports\n\n### Hotel (PMS) Reports\nGo to **PMS** → **Reports**:\n- **Managers Report** — The comprehensive daily report:\n  - Revenue by category (room, other, adjustments, taxes, fees)\n  - Guest activity: arrivals, walk-ins, group arrivals, departures, stayovers, no-shows, cancellations\n  - Statistics: rooms sold, occupancy %, ADR (avg daily rate), RevPAR (revenue per available room), avg length of stay\n  - 7-day forward forecast with occupancy and revenue projections\n  - Today / Period-to-Date / Year-to-Date columns\n- **Occupancy Forecast** — Forward-looking daily occupancy with arrivals/departures\n- **Utilization Grid** — Room-by-room and aggregate utilization\n- **Pickup Report** — Reservations booked within a date range\n- **No-Show Report** — No-show tracking\n- **Revenue by Room Type** — Revenue breakdown\n\n### Spa Reports\nGo to **Spa** → **Reports**:\n- Total, completed, canceled, no-show appointment counts\n- Revenue: service, addon, retail, tips\n- Utilization rate, rebooking rate, online booking %\n- Walk-in %, no-show rate\n- Provider performance\n- Service analytics\n- Daily trends and KPI dashboard\n\nAll reports support date range filtering and CSV export.\n\n**Permissions:** `pms.reports.view`, `spa.reports.view`, `reports.export` (for CSV)",
    "status": "draft"
  }
]
```
