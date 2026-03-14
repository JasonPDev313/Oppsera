import { db, aiSupportRouteManifests, aiSupportAnswerCards } from '@oppsera/db';

// ─── Route Manifests ──────────────────────────────────────────────────────────

const ROUTE_MANIFESTS = [
  {
    route: '/dashboard',
    moduleKey: 'dashboard',
    pageTitle: 'Dashboard',
    description:
      'Your business at a glance. Shows today\'s sales summary, recent orders, open shifts, and quick-access tiles to all enabled modules.',
    helpText:
      'Use the Dashboard to get a fast overview of how your business is performing right now. Tap any tile to jump directly to that area.',
  },
  {
    route: '/pos',
    moduleKey: 'orders',
    pageTitle: 'Point of Sale (Retail)',
    description:
      'The retail point-of-sale screen. Cashiers add items from the catalog, apply discounts, collect payment, and close transactions here.',
    helpText:
      'Start a new sale by tapping a product or scanning a barcode. When the customer is ready, tap Charge to collect payment.',
  },
  {
    route: '/pos/fnb',
    moduleKey: 'fnb',
    pageTitle: 'Point of Sale (F&B)',
    description:
      'The food-and-beverage POS. Servers manage table tabs, assign courses, fire items to kitchen display screens (KDS), and close tabs here.',
    helpText:
      'Select a table to open or resume a tab. Add items by course, then fire the course to the kitchen when the guest is ready to order.',
  },
  {
    route: '/orders',
    moduleKey: 'orders',
    pageTitle: 'Orders',
    description:
      'A searchable list of all sales orders across locations. Managers can view, reopen, void, or process returns from this screen.',
    helpText:
      'Search by order number, customer name, or date range. Click an order to see its full detail, including payment and line-item breakdown.',
  },
  {
    route: '/catalog',
    moduleKey: 'catalog',
    pageTitle: 'Catalog',
    description:
      'Manage your products and services. Create items, set prices, assign to departments and categories, and control tax/service-charge rules.',
    helpText:
      'Add a new item with the + button. Prices here are in dollars and will appear on the POS and in receipts.',
  },
  {
    route: '/inventory',
    moduleKey: 'inventory',
    pageTitle: 'Inventory',
    description:
      'Track stock levels, receive purchase orders, adjust quantities, and view inventory movement history across locations.',
    helpText:
      'Use Receive Stock to log an incoming delivery. Use Adjust to correct a count discrepancy. All changes are recorded with a reason code.',
  },
  {
    route: '/customers',
    moduleKey: 'customers',
    pageTitle: 'Customers',
    description:
      'Your customer directory. View customer profiles, purchase history, loyalty balances, and contact information.',
    helpText:
      'Search by name, email, or phone to find a customer. Click a profile to see their full order history and loyalty activity.',
  },
  {
    route: '/accounting',
    moduleKey: 'accounting',
    pageTitle: 'Accounting / General Ledger',
    description:
      'View and manage general ledger entries, journal postings, and GL account balances. Supports manual journal entry and period close.',
    helpText:
      'GL entries are posted automatically when orders are completed. Use Manual Journal to make adjustments. Check the posting status column to confirm entries have been applied.',
  },
  {
    route: '/reports',
    moduleKey: 'reporting',
    pageTitle: 'Reports',
    description:
      'Pre-built business reports: sales by day/location/employee, payment tender breakdown, inventory valuation, and more.',
    helpText:
      'Select a report from the list, choose your date range and location filters, then click Run. Export to CSV or PDF from the toolbar.',
  },
  {
    route: '/settings',
    moduleKey: 'settings',
    pageTitle: 'Settings',
    description:
      'System-wide configuration: business info, tax rules, payment processors, user roles, shift rules, receipt templates, and module toggles.',
    helpText:
      'Changes here affect the whole account. Some settings require Owner or Manager role to edit. Scroll to find the section you need.',
  },
];

// ─── Answer Cards ─────────────────────────────────────────────────────────────

const ANSWER_CARDS = [
  // ── 10 "What does this page do?" ─────────────────────────────────────────

  {
    slug: 'page-overview-dashboard',
    moduleKey: 'dashboard',
    route: '/dashboard',
    questionPattern: 'what does this page do|what is the dashboard|what can I see here|dashboard overview',
    approvedAnswerMarkdown: `## Dashboard Overview

The **Dashboard** is your business command center. Every time you log in you'll see:

- **Today's Sales** — total revenue so far today, compared to yesterday
- **Open Orders** — any transactions that haven't been paid yet
- **Active Shifts** — which cashiers or servers are currently clocked in
- **Quick-access tiles** — tap any tile (Orders, Catalog, Inventory, etc.) to jump straight there

The numbers update automatically as sales come in. No refresh needed.`,
  },
  {
    slug: 'page-overview-pos-retail',
    moduleKey: 'orders',
    route: '/pos',
    questionPattern: 'what does this page do|what is the pos|retail pos overview|how does the point of sale work',
    approvedAnswerMarkdown: `## Point of Sale (Retail)

This is where your team rings up sales. Here's how a typical transaction works:

1. **Add items** — tap a product tile or scan a barcode
2. **Apply a discount** — tap the discount icon on any line item if needed
3. **Collect payment** — tap **Charge** and choose the tender (cash, card, split)
4. **Print or email receipt** — the system prompts after payment is captured

The POS only shows items assigned to the current location's catalog. If a product is missing, check that it's active in **Catalog**.`,
  },
  {
    slug: 'page-overview-pos-fnb',
    moduleKey: 'fnb',
    route: '/pos/fnb',
    questionPattern: 'what does this page do|what is fnb pos|food and beverage pos|table service overview',
    approvedAnswerMarkdown: `## Point of Sale (F&B / Table Service)

This screen is built for table service. Servers can:

- **Open a tab** on any available table
- **Add items by course** (Appetizer, Main, Dessert, etc.)
- **Fire a course** to send it to the kitchen display (KDS) when guests are ready
- **Transfer a tab** to another table or server
- **Close the tab** and collect payment when the meal is done

Each table shows its current status (Available, Occupied, Needs Attention) so hosts and managers can see the floor at a glance.`,
  },
  {
    slug: 'page-overview-orders',
    moduleKey: 'orders',
    route: '/orders',
    questionPattern: 'what does this page do|what is the orders screen|orders list overview|how do I find an old order',
    approvedAnswerMarkdown: `## Orders Screen

The **Orders** screen is a full history of every sale. You can:

- **Search** by order number, customer name, or date range
- **Filter** by status (open, completed, voided, returned)
- **View detail** — click any row to see line items, payments, and timestamps
- **Process a return** — open a completed order and tap **Return**
- **Void an order** — available for open orders if you have the right permissions

Managers use this screen to handle post-sale exceptions. Cashiers typically use the POS screen instead.`,
  },
  {
    slug: 'page-overview-catalog',
    moduleKey: 'catalog',
    route: '/catalog',
    questionPattern: 'what does this page do|what is the catalog|how do I manage products|catalog overview',
    approvedAnswerMarkdown: `## Catalog

**Catalog** is where you manage everything you sell. From here you can:

- **Add or edit items** — name, price (in dollars), description, and photo
- **Organize by department and category** — controls how items appear on the POS
- **Set tax rules** — choose which tax rates apply to each item
- **Control service charges** — mark items as exempt if needed
- **Activate or deactivate items** — deactivated items won't show on the POS

Prices you set here are in dollars. The system converts to cents automatically when an order is placed.`,
  },
  {
    slug: 'page-overview-inventory',
    moduleKey: 'inventory',
    route: '/inventory',
    questionPattern: 'what does this page do|what is inventory|inventory screen overview|how does stock tracking work',
    approvedAnswerMarkdown: `## Inventory

The **Inventory** screen tracks how much stock you have on hand. Key actions:

- **Receive Stock** — record an incoming delivery against a purchase order
- **Adjust** — correct a count (e.g., breakage, theft, count correction)
- **Transfer** — move stock between locations
- **View history** — see every movement with user, timestamp, and reason

Inventory levels update in real time as sales are made at the POS. A negative quantity means you've sold more than what's been received — usually a sign that a delivery wasn't logged.`,
  },
  {
    slug: 'page-overview-customers',
    moduleKey: 'customers',
    route: '/customers',
    questionPattern: 'what does this page do|what is the customers screen|customer directory overview|how do I look up a customer',
    approvedAnswerMarkdown: `## Customers

The **Customers** screen is your client directory. You can:

- **Search** by name, email, or phone number
- **View a profile** — purchase history, total spend, loyalty balance, contact info
- **Add a new customer** — name and email or phone required
- **Merge duplicates** — contact your account manager for bulk merges

Customer profiles are shared across all locations in your account. Loyalty points earn and redeem at any location unless restricted in Settings.`,
  },
  {
    slug: 'page-overview-accounting',
    moduleKey: 'accounting',
    route: '/accounting',
    questionPattern: 'what does this page do|what is the accounting screen|GL overview|general ledger overview',
    approvedAnswerMarkdown: `## Accounting / General Ledger

The **Accounting** screen shows your business's financial record. Every completed sale, payment, and refund automatically creates a GL entry. From here you can:

- **View journal entries** — date, account, debit/credit, source
- **Create a manual journal** — for adjustments, corrections, or accruals
- **Check posting status** — entries show as Pending, Posted, or Failed
- **Run period close** — lock a date range so no further changes can post to it

This screen is typically used by your bookkeeper or accountant. Sales staff don't need access here.`,
  },
  {
    slug: 'page-overview-reports',
    moduleKey: 'reporting',
    route: '/reports',
    questionPattern: 'what does this page do|what is the reports screen|reports overview|how do I run a report',
    approvedAnswerMarkdown: `## Reports

The **Reports** screen gives you pre-built views of your business data:

- **Sales Summary** — revenue by day, week, or month
- **Sales by Location** — compare performance across sites
- **Sales by Employee** — see who's selling what
- **Payment Tender** — cash vs card vs gift card breakdown
- **Inventory Valuation** — current stock value by category
- **End-of-Day Report** — shift totals for reconciliation

Select a report, choose your date range and location, then tap **Run**. Use the Export button to download as CSV or PDF.`,
  },
  {
    slug: 'page-overview-settings',
    moduleKey: 'settings',
    route: '/settings',
    questionPattern: 'what does this page do|what is the settings screen|settings overview|how do I configure the system',
    approvedAnswerMarkdown: `## Settings

**Settings** is the control panel for your entire account. Key sections include:

- **General** — business name, address, timezone, currency
- **Tax** — create and assign tax rates
- **Payment Processing** — connect your card terminal or payment gateway
- **Users & Roles** — invite staff and set permission levels
- **Shifts** — configure shift rules and clock-in requirements
- **Receipts** — customize receipt header, footer, and logo
- **Modules** — enable or disable feature modules for your plan

Most settings require **Manager** or **Owner** role to change. If a section is grayed out, ask your account owner to grant you access.`,
  },

  // ── 5 "How do I?" workflows ───────────────────────────────────────────────

  {
    slug: 'how-to-process-refund',
    moduleKey: 'orders',
    route: '/orders',
    questionPattern: 'how do I refund|how do I process a return|how to give money back|customer wants a refund',
    approvedAnswerMarkdown: `## How to Process a Refund

1. Go to **Orders** and find the completed order you want to refund
2. Click the order to open its detail view
3. Tap **Return** in the top-right corner
4. Select which items to return (partial returns are supported)
5. Choose the refund method — original payment method is recommended
6. Confirm — the refund is processed and a return receipt is generated

**Notes:**
- You need the **orders.return** permission to process refunds
- Cash refunds may require a manager override depending on your settings
- The refund posts to the GL automatically`,
  },
  {
    slug: 'how-to-close-batch',
    moduleKey: 'payments',
    route: '/pos',
    questionPattern: 'how do I close the batch|how do I settle card payments|end of day card settlement|batch close',
    approvedAnswerMarkdown: `## How to Close a Batch (Card Settlement)

Batch close sends all captured card transactions to your payment processor for settlement. To close the batch:

1. Go to **Settings → Merchant Services** (or your payment terminal menu)
2. Tap **Close Batch** (sometimes labeled "Settle" on the terminal)
3. Review the batch totals — confirm the count and amount match your expected sales
4. Confirm to submit

**Tips:**
- Most businesses close the batch at end of business each day
- If you see a mismatch, check the **Orders** screen for any voided or adjusted transactions
- Some payment processors close automatically at midnight — check with your provider`,
  },
  {
    slug: 'how-to-transfer-tab',
    moduleKey: 'fnb',
    route: '/pos/fnb',
    questionPattern: 'how do I transfer a tab|move a tab to another table|transfer table|reassign tab to server',
    approvedAnswerMarkdown: `## How to Transfer a Tab

To move a tab to a different table or server:

1. Open the tab you want to transfer (tap the table on the floor map)
2. Tap the **⋯ More** menu or the **Transfer** button
3. Choose **Transfer Table** to move to a new table, or **Transfer Server** to assign a different server
4. Select the destination table or server from the list
5. Confirm — the tab moves instantly

**Notes:**
- The original server's name stays on the ticket for tip tracking purposes
- Transferring a table does not affect any items already fired to the kitchen
- You need the **fnb.transfer** permission to transfer tabs`,
  },
  {
    slug: 'how-to-receive-stock',
    moduleKey: 'inventory',
    route: '/inventory',
    questionPattern: 'how do I receive stock|how to log a delivery|receive purchase order|add inventory',
    approvedAnswerMarkdown: `## How to Receive Stock

When a delivery arrives, record it in the system so your inventory levels stay accurate:

1. Go to **Inventory → Receive Stock**
2. Select the **Purchase Order** the delivery is against (or create an ad-hoc receipt if there's no PO)
3. For each item in the delivery, enter the quantity received
4. If there's a discrepancy (short shipment, damage), note it in the reason field
5. Tap **Confirm Receipt** — quantities are added to your on-hand counts immediately

**Tips:**
- Partial receipts are allowed — you can receive the rest when it arrives
- The received quantities and costs are recorded for inventory valuation reports`,
  },
  {
    slug: 'how-to-post-journal-entry',
    moduleKey: 'accounting',
    route: '/accounting',
    questionPattern: 'how do I post a journal entry|manual journal|how to make an accounting adjustment|how to record a manual entry',
    approvedAnswerMarkdown: `## How to Post a Manual Journal Entry

Use manual journal entries for adjustments, accruals, or corrections that the system didn't generate automatically.

1. Go to **Accounting** and tap **New Journal Entry**
2. Enter a description (required — be specific, e.g. "Prepaid insurance adjustment Jan 2026")
3. Add debit and credit lines — each line needs an account and an amount
4. The entry must balance (total debits = total credits) before you can save
5. Tap **Post** — the entry is recorded and appears in the GL immediately

**Notes:**
- You need the **accounting.journal.post** permission
- Posted entries cannot be deleted — use a reversing entry to correct a mistake
- If you're not sure which accounts to use, consult your accountant`,
  },

  // ── 5 "Why is this disabled?" scenarios ──────────────────────────────────

  {
    slug: 'disabled-role-based',
    moduleKey: 'settings',
    route: '/settings',
    questionPattern: 'why is this button grayed out|why can\'t I click this|why is this disabled|button not working',
    approvedAnswerMarkdown: `## Why Is This Button Disabled?

Most disabled buttons mean your **user role doesn't have permission** for that action.

**What to do:**
1. Ask your **Manager or Owner** to grant you the permission
2. They can do this in **Settings → Users & Roles** by editing your role
3. If you're a Manager and something is still disabled, it may require **Owner** level — contact your account owner

**Common examples:**
- Void an order → requires **orders.void** permission
- Edit catalog prices → requires **catalog.edit** permission
- View accounting → requires **accounting.view** permission

If a button looks enabled but nothing happens when you tap it, check whether you have an **open shift** — some actions require a shift to be active.`,
  },
  {
    slug: 'disabled-shift-not-open',
    moduleKey: 'orders',
    route: '/pos',
    questionPattern: 'shift not open|can\'t start a sale|why can\'t I ring up|pos not letting me sell|charge button disabled',
    approvedAnswerMarkdown: `## Why Can't I Start a Sale? (Shift Not Open)

If the POS isn't letting you ring up sales, the most common reason is that **no shift is open**.

**To fix this:**
1. Tap the **Clock In / Open Shift** button (usually in the top menu or on the POS home screen)
2. Enter your PIN or confirm your name
3. Once your shift is open, the POS will allow transactions

**If the button is still disabled after clocking in:**
- Your role may not have POS access — ask your manager
- The location may be in **closed** status — check with your manager
- The terminal may need to be reassigned — your manager can do this in Settings`,
  },
  {
    slug: 'disabled-batch-closed',
    moduleKey: 'payments',
    route: '/pos',
    questionPattern: 'batch is closed|can\'t process card|card payment not working|batch already closed',
    approvedAnswerMarkdown: `## Why Can't I Process a Card Payment? (Batch Closed)

If card payments are failing with a "batch closed" message, it means the current batch has already been settled and a new one hasn't started yet.

**What to do:**
1. Check your payment terminal — some terminals require you to manually open a new batch after settlement
2. If the terminal shows "Batch Open," the issue may be with the connection — restart the terminal
3. Contact your payment processor's support line if the terminal won't open a new batch

**To avoid this:** Most processors open a new batch automatically at the start of the next business day. If you process 24/7, check your processor's batch schedule in **Settings → Merchant Services**.`,
  },
  {
    slug: 'disabled-no-permission',
    moduleKey: 'settings',
    route: '/settings',
    questionPattern: 'access denied|not authorized|permission denied|you don\'t have access|403 error',
    approvedAnswerMarkdown: `## Why Am I Seeing "Access Denied"?

An **Access Denied** message means your account doesn't have permission to view or use that feature.

**Steps to resolve:**
1. Ask your **Account Owner or Manager** to check your role in **Settings → Users & Roles**
2. They can add the specific permission you need — for example, **reports.view** for the Reports screen
3. After they save the change, you may need to log out and log back in for it to take effect

**If you ARE the Owner and you're seeing this:**
- Try logging out and back in to refresh your session
- Contact OppsEra support — your account configuration may need a reset`,
  },
  {
    slug: 'disabled-feature-not-enabled',
    moduleKey: 'settings',
    route: '/settings',
    questionPattern: 'feature not available|module not enabled|this feature isn\'t included|upgrade required|not in your plan',
    approvedAnswerMarkdown: `## Why Is This Feature Not Available?

Some features are only available on certain subscription plans or must be enabled by your account owner.

**What to check:**
1. Go to **Settings → Modules** — you'll see which modules are active on your account
2. If the module you need shows as "Disabled" or "Not on your plan," contact OppsEra support to discuss upgrading
3. If the module shows as active but you still can't access it, make sure your **role** includes the right permissions (Settings → Users & Roles)

**Common examples:**
- **F&B / Table Service** — requires the F&B module to be enabled
- **Loyalty & Memberships** — separate add-on module
- **Advanced Reporting** — available on Business and above plans`,
  },

  // ── 5 "Why is this happening?" diagnostics ────────────────────────────────

  {
    slug: 'diagnostic-order-stuck',
    moduleKey: 'orders',
    route: '/orders',
    questionPattern: 'order is stuck|order won\'t close|order showing as open|can\'t complete order|order stuck open',
    approvedAnswerMarkdown: `## Why Is an Order Stuck Open?

An order stays open when payment hasn't been fully captured. Common causes:

1. **Payment not collected** — check the order detail for a "Balance Due" amount; collect the remaining payment
2. **Card authorization pending** — if a card was tapped but the terminal shows "Authorizing," wait a moment; if it times out, retry
3. **Split payment incomplete** — one of the split tenders wasn't collected; check the Payments section of the order
4. **System error during payment** — rare; if the order shows a payment but still shows as open, contact support with the order number

**To manually close a stuck order** (Manager+):
Open the order → tap **⋯ More** → **Force Close** (requires manager permission). Use this only when you've confirmed payment was actually collected.`,
  },
  {
    slug: 'diagnostic-payment-mismatch',
    moduleKey: 'payments',
    route: '/orders',
    questionPattern: 'payment doesn\'t match|payments don\'t balance|cash drawer is off|sales don\'t reconcile|end of day mismatch',
    approvedAnswerMarkdown: `## Why Don't My Payments Match?

End-of-day mismatches are usually caused by one of these:

1. **Voided transactions** — a voided order reduces the expected total; check the **Voided** filter in Orders
2. **Refunds** — refunds reduce cash or card totals; look at the Returns section of your EOD report
3. **Manual cash drawer changes** — if someone opened the drawer manually, it may not have been recorded
4. **No-sale** — any no-sale opens reduce your expected cash count
5. **Tender errors** — e.g., a cash sale was entered as card — check individual transaction details

Run the **End-of-Day Report** in Reports → filter by cashier and location → compare expected vs actual for each tender type to isolate the discrepancy.`,
  },
  {
    slug: 'diagnostic-gl-not-posting',
    moduleKey: 'accounting',
    route: '/accounting',
    questionPattern: 'GL not posting|journal entry not posting|accounting not updating|missing GL entry|transaction not in accounting',
    approvedAnswerMarkdown: `## Why Isn't a Transaction Showing in the GL?

When a sale doesn't appear in the General Ledger, check these things:

1. **Posting status** — in Accounting, filter by **Status: Pending**. Pending entries are queued but not yet posted. They typically post within a few minutes.
2. **Failed entries** — filter by **Status: Failed**. Failed entries have an error message explaining why. Common cause: an account code isn't mapped for that transaction type.
3. **Closed period** — if the transaction date falls in a closed accounting period, it can't post. Check Settings → Accounting → Periods.
4. **GL account mapping** — if a new product category or tender type was added, it may not have a GL account assigned. Go to Settings → Accounting → Account Mapping to check.

If entries remain in Pending status for more than 10 minutes, contact support.`,
  },
  {
    slug: 'diagnostic-kds-not-showing',
    moduleKey: 'kds',
    route: '/pos/fnb',
    questionPattern: 'KDS not showing orders|kitchen screen not receiving|items not going to kitchen|order not appearing on KDS|kitchen display blank',
    approvedAnswerMarkdown: `## Why Aren't Orders Showing on the Kitchen Display (KDS)?

If fired items aren't appearing on the kitchen screen, check these in order:

1. **KDS is on the right location** — the KDS terminal must be set to the same location as the POS sending the orders. Check the KDS settings (tap the gear icon on the KDS screen).
2. **Station assignment** — each item type (food, drinks, etc.) must be routed to the correct KDS station. Go to **Settings → KDS → Stations** and verify the routing rules.
3. **Course wasn't fired** — on the POS, confirm the server tapped **Fire Course**, not just added the items. Items only go to KDS when explicitly fired.
4. **KDS connection** — check that the KDS device is online and showing a green connection indicator. Restart the KDS app if it's offline.
5. **Item not assigned to a station** — if an item has no station assignment, it won't appear anywhere. Check the item's KDS routing in Catalog.`,
  },
  {
    slug: 'diagnostic-inventory-discrepancy',
    moduleKey: 'inventory',
    route: '/inventory',
    questionPattern: 'inventory is wrong|stock count doesn\'t match|inventory discrepancy|quantity is off|inventory not accurate',
    approvedAnswerMarkdown: `## Why Is My Inventory Count Off?

An inventory discrepancy means the system's count doesn't match what's physically on the shelf. Common causes:

1. **Unlogged deliveries** — stock arrived but wasn't received in the system. Go to **Inventory → Receive Stock** to log it.
2. **Missing adjustments** — breakage, spoilage, or internal use wasn't recorded. Create an **Adjustment** with the appropriate reason code.
3. **Sales without inventory deduction** — check that the sold items have inventory tracking enabled in Catalog (some items like services may be set to "no track").
4. **Transfer not recorded** — if stock moved between locations without a Transfer record, counts at both locations will be wrong.
5. **Count error** — run a **Cycle Count** in Inventory to do a fresh physical count and sync the system to reality.

The **Inventory Movement History** report shows every change to a SKU with user and timestamp — useful for tracking down where the discrepancy occurred.`,
  },
];

// ─── Seed Function ────────────────────────────────────────────────────────────

export async function seedDemoData(tenantId: string | null = null) {
  // Insert route manifests
  await db
    .insert(aiSupportRouteManifests)
    .values(
      ROUTE_MANIFESTS.map((m) => ({
        ...m,
        tenantId,
      })),
    )
    .onConflictDoNothing();

  // Insert answer cards
  await db
    .insert(aiSupportAnswerCards)
    .values(
      ANSWER_CARDS.map((c) => ({
        ...c,
        tenantId,
        status: 'active' as const,
        version: 1,
      })),
    )
    .onConflictDoNothing();

  return {
    routeManifestsCount: ROUTE_MANIFESTS.length,
    answerCardsCount: ANSWER_CARDS.length,
  };
}
