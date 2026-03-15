import { db, aiSupportAnswerCards } from '@oppsera/db';

// ─── Batch 5: 50 Inventory / Catalog Deep-Dive Answer Cards ─────────────────
// Grounded in actual OppsEra codebase features. Inserted as 'draft' for admin review.

const TRAINING_CARDS_BATCH5 = [
  {
    slug: 'inv-howto-opening-balance',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I set an opening balance for a brand-new item|set opening stock|initial inventory quantity|starting inventory balance|set beginning inventory|opening stock count|enter starting quantity',
    approvedAnswerMarkdown: `## Setting an Opening Balance for a New Item

1. Go to **Catalog** → open the item
2. Scroll to the **Stock** section and click **Adjust**
3. Enter the on-hand quantity and a reason such as "Opening balance"
4. Click **Save**

The system creates an inventory movement of type \`initial\` (or \`adjustment\`) that sets the on-hand quantity without any offsetting sale or receipt.

### Tips
- If you have many items to set up, create a receiving receipt from your initial supplier shipment — this records both quantity and cost in one step.
- The movement is recorded against the current location, so switch locations first if you operate multiple sites.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-convert-cases-to-eaches',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I convert from cases to eaches when receiving stock|receive in cases but track in eaches|case to each conversion|UOM conversion receiving|receive cases sell individual|purchase unit vs base unit',
    approvedAnswerMarkdown: `## Converting Cases to Eaches When Receiving

OppsEra supports a **purchase unit** and a **base unit** per item with a conversion ratio.

### Setup (one-time per item)
1. Go to **Catalog** → open the item → **Edit**
2. Set **Base Unit** to \`EA\` (each)
3. Set **Purchase Unit** to \`CS\` (case)
4. Set **Purchase-to-Base Ratio** — e.g. \`12\` means 1 case = 12 eaches

### During Receiving
1. Go to **Inventory** → **Receiving** → open or create a receipt
2. Add the item — the UOM defaults to the purchase unit (\`CS\`)
3. Enter the quantity received in cases (e.g. \`5\`)
4. The system automatically converts to base units on posting: 5 CS × 12 = 60 EA added to on-hand

### Unit Cost
The unit cost you enter is **per purchase unit** (per case). The system calculates the per-each cost automatically (e.g. $24.00 / 12 = $2.00 per EA).

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-change-base-unit',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I change an item base unit after it has been used|change unit of measure on existing item|switch UOM after transactions|change base unit existing item',
    approvedAnswerMarkdown: `## Changing an Item's Base Unit After Use

**Caution:** Changing the base unit on an item that already has movements can create inconsistencies between historical and future quantities.

### Recommended Approach
1. **Zero out** the current on-hand with an adjustment (reason: "UOM conversion")
2. Go to **Catalog** → open the item → **Edit**
3. Change the **Base Unit** and update the **Purchase-to-Base Ratio** if needed
4. **Adjust back in** the correct quantity in the new unit

### Why This Two-Step Process?
Historical movements stay in the original unit. By zeroing and re-entering, the on-hand quantity is correct in the new unit going forward. The adjustment audit trail clearly documents the reason.

### Alternative: Create a New Item
If the item has extensive history, consider creating a new catalog item with the correct base unit and archiving the old one. This keeps all historical reporting clean.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-record-spoilage',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I record spoilage separately from normal shrink|log spoilage|track food waste|record expired product|waste vs shrink|separate spoilage from theft',
    approvedAnswerMarkdown: `## Recording Spoilage Separately from Normal Shrink

OppsEra's shrink command supports a **reason** field, so you can categorize each reduction.

### Recording Spoilage
1. Go to **Catalog** → open the item → **Stock** section
2. Click **Shrink**
3. Enter the quantity lost
4. In the **Reason** field, enter a descriptive reason like "Spoilage — expired" or "Spoilage — temperature damage"
5. Click **Save**

### Recording Other Shrink
Use different reason text for other categories:
- **Theft** → "Shrink — suspected theft"
- **Breakage** → "Shrink — breakage"
- **Damage** → "Shrink — damaged in transit"

### Viewing History
Go to the item's **Movement History** — all shrink movements appear with their reason text, so you can filter and identify patterns.

### Tips
- Use consistent reason wording across your team so movement history is easy to filter
- Each shrink movement records the unit cost, so you can see the dollar impact

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-track-breakage',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I track breakage on glassware or retail merchandise|record broken items|log breakage|broken glassware inventory|track damaged goods',
    approvedAnswerMarkdown: `## Tracking Breakage on Glassware or Merchandise

Use the **Shrink** action with a breakage-specific reason.

1. Go to **Catalog** → open the item (e.g. "Pint Glass" or "Wine Glass")
2. Scroll to the **Stock** section → click **Shrink**
3. Enter the quantity broken
4. Set the **Reason** to "Breakage" (or "Breakage — bar" / "Breakage — kitchen" for more detail)
5. Click **Save**

The movement is recorded as type \`shrink\` with your reason text and the unit cost at time of recording.

### Monitoring Breakage Trends
- Open the item → **Movement History**
- Look for all movements with reason containing "Breakage"
- Compare breakage quantities across periods to spot spikes

**Tip:** For high-breakage items like glassware, set a higher **par level** to account for expected loss.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-receive-freight-into-cost',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I receive freight into item cost instead of expensing it|capitalize freight|include shipping in item cost|freight into landed cost|absorb freight into cost|freight cost allocation',
    approvedAnswerMarkdown: `## Receiving Freight into Item Cost (Landed Cost)

OppsEra's receiving module supports two freight modes: **expense** (charge to GL) or **allocate** (roll into item cost).

### Steps
1. Go to **Inventory** → **Receiving** → open or create a draft receipt
2. Set **Freight Mode** to **Allocate**
3. Add your receipt lines (items, quantities, unit costs)
4. Go to the **Charges** section and add a charge (e.g. "Freight" — $150.00)
5. Choose a **Shipping Allocation Method**:
   - **By Cost** — proportional to each line's extended cost
   - **By Quantity** — split equally per unit received
   - **By Weight** — proportional to line weight
   - **By Volume** — proportional to line volume
   - **Manual** — enter allocation per line yourself
6. **Post** the receipt

### What Happens on Posting
- Each receipt line gets an \`allocatedShipping\` amount added
- The **landed cost** = unit cost + allocated shipping per unit
- The item's current cost updates to reflect the landed cost
- Inventory movements use the landed unit cost

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-allocate-shipping',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I allocate shipping cost across all items on a receipt|split shipping across receipt lines|distribute freight|prorate shipping|shipping allocation method',
    approvedAnswerMarkdown: `## Allocating Shipping Cost Across Receipt Items

1. Go to **Inventory** → **Receiving** → open the draft receipt
2. Ensure **Freight Mode** is set to **Allocate**
3. Click **Add Charge** in the charges section
4. Enter the charge type (e.g. "Shipping") and amount
5. Select the **Allocation Method**:

| Method | How It Splits |
|---|---|
| **By Cost** | Proportional to each line's extended cost |
| **By Quantity** | Equal share per unit across all lines |
| **By Weight** | Proportional to each line's weight |
| **By Volume** | Proportional to each line's volume |
| **Manual** | You enter each line's share manually |

6. The receipt grid updates to show **Allocated Shipping** and **Landed Cost** per line
7. **Post** to finalize

### Example
Receipt with 2 lines ($200 and $800 extended cost), $50 shipping, method = By Cost:
- Line 1: $200 / $1,000 × $50 = **$10.00** allocated
- Line 2: $800 / $1,000 × $50 = **$40.00** allocated

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-see-landed-cost',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I see landed cost on my most recent receipt|view landed cost|check landed unit cost|receipt landed cost breakdown|see freight allocation on receipt',
    approvedAnswerMarkdown: `## Viewing Landed Cost on a Receipt

1. Go to **Inventory** → **Receiving**
2. Find the receipt (use the vendor or date filters)
3. Click to open it

The receipt detail shows each line with:
- **Unit Cost** — the vendor's price per unit
- **Extended Cost** — unit cost × quantity
- **Allocated Shipping** — the freight portion assigned to this line
- **Landed Cost** — extended cost + allocated shipping
- **Landed Unit Cost** — landed cost ÷ quantity received (in base units)

### Posted vs Draft
- **Draft** receipts show a cost preview — you can still adjust charges and allocation method
- **Posted** receipts show the final landed costs that were applied to inventory

**Tip:** The item's **current cost** on the catalog detail page reflects the most recent landed unit cost from receiving (for weighted-average items, it's blended with prior cost).

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-compare-vendor-cost',
    moduleKey: 'inventory',
    route: '/inventory/vendors',
    questionPattern:
      'how do I compare last vendor cost to current vendor cost|vendor cost comparison|vendor price change|cost variance|compare vendor pricing|vendor cost history|see vendor price changes',
    approvedAnswerMarkdown: `## Comparing Last Vendor Cost to Current Vendor Cost

### Per Item
1. Go to **Catalog** → open the item → **Stock** section
2. The section shows the item's **Current Cost**
3. Check the **Movement History** — each \`receive\` movement shows the unit cost at time of receipt

### Per Vendor
1. Go to **Vendors** → open the vendor
2. The vendor's **Catalog** tab shows all items linked to this vendor
3. Each item shows the **Vendor Cost** (current) and **Last Cost** (from last receipt)

### On a Receiving Receipt
When adding an item to a new receipt, the receipt line pre-fills the **vendor cost** from the vendor catalog. If the vendor sent a new price, update the unit cost on the receipt line — after posting, the **Last Cost** on the vendor catalog entry updates automatically.

**Tip:** Compare the vendor cost column against the last cost column on the vendor catalog to spot price increases.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-preferred-vendor',
    moduleKey: 'inventory',
    route: '/inventory/vendors',
    questionPattern:
      'how do I mark one supplier as the preferred vendor|set preferred vendor|default vendor for item|primary supplier|preferred supplier',
    approvedAnswerMarkdown: `## Marking a Preferred Vendor

An item can be linked to multiple vendors, but one can be flagged as **preferred**.

### Steps
1. Go to **Vendors** → open the vendor
2. Go to the **Catalog** tab
3. Find the item (or add it with **Add Item**)
4. Toggle **Preferred** to on

### What "Preferred" Does
- **Reorder Suggestions** — the reorder list shows the preferred vendor's cost and lead time
- **Receiving** — when searching for items during receiving, the preferred vendor's SKU and cost are used as defaults
- Only one vendor can be preferred per item — setting a new preferred vendor clears the flag on the previous one

### Alternative: From the Item Side
1. Go to **Catalog** → open the item → **Stock** section
2. View linked vendors
3. The preferred vendor is indicated

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-items-by-vendor',
    moduleKey: 'inventory',
    route: '/inventory/vendors',
    questionPattern:
      'how do I see all items purchased from a single vendor|vendor item list|vendor catalog|items supplied by vendor|what items does this vendor supply',
    approvedAnswerMarkdown: `## Viewing All Items from a Single Vendor

1. Go to **Vendors** → click the vendor name
2. Open the **Catalog** tab

This shows every item linked to this vendor with:
- **Vendor SKU** — the vendor's own part/SKU number
- **Vendor Cost** — current agreed cost
- **Last Cost** — cost from the most recent receipt
- **Lead Time** — days from order to delivery
- **Pack Size** and **Min Order Qty**
- **Preferred** flag

### Vendor Summary Stats
The vendor detail page header also shows aggregate stats:
- **Active Items** — count of linked items
- **Total Receipts** — number of posted receipts
- **Total Spend** — cumulative dollar amount from posted receipts
- **Last Receipt Date**

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-create-barcode',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I create a barcode for an item that does not have one|generate barcode|assign barcode|add UPC to item|item has no barcode|create item barcode',
    approvedAnswerMarkdown: `## Adding a Barcode to an Item

### If the Item Already Has a Manufacturer UPC/EAN
1. Go to **Catalog** → open the item → **Edit**
2. Enter the **Barcode** in the barcode field
3. Save

### If You Need to Generate a Barcode
OppsEra does not auto-generate UPC/EAN barcodes (those require a GS1 registration). However, you can assign an **internal barcode**:

1. Go to **Catalog** → open the item → **Edit**
2. In the **Barcode** field, enter an internal code (e.g. your SKU number or a custom numeric string)
3. Save
4. Print labels using your label printer software, encoding this value as a Code 128 or Code 39 barcode

### Searching by Barcode
Once assigned, the barcode is searchable:
- In **Catalog** item search
- During **Receiving** (scan-to-add)
- At the **POS** (scan to ring up)

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-print-labels',
    moduleKey: 'catalog',
    route: '/catalog/items',
    questionPattern:
      'how do I print shelf labels or item labels|print barcode labels|print price tags|label printing|shelf label|item label|barcode label',
    approvedAnswerMarkdown: `## Printing Shelf Labels or Item Labels

OppsEra does not currently include a built-in label designer or direct label-printer integration. Here's the recommended workflow:

### Recommended Approach
1. Go to **Catalog** and note the item's **Name**, **SKU**, **Barcode**, and **Price**
2. Use your label printer's companion software (e.g. Zebra ZDesigner, DYMO Label, Brother P-touch Editor, Bartender)
3. Create a label template with the item name, price, and barcode (Code 128 or EAN-13)
4. Print using your thermal or desktop label printer

### Bulk Approach
1. Export your catalog items (use the **Catalog** list or a CSV export)
2. Import the CSV into your label software for batch printing

### Tips
- Most label printers accept Code 128 barcodes — use the item's barcode/SKU value
- For shelf labels, include the item name, price, and barcode
- For receiving labels, include the vendor SKU and storage location

**Note:** Built-in label printing is on the product roadmap.`,
  },
  {
    slug: 'inv-howto-search-by-upc',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I search inventory by UPC instead of item name|search by barcode|find item by UPC|lookup by barcode|scan UPC to find item|barcode search',
    approvedAnswerMarkdown: `## Searching by UPC or Barcode

### In the Catalog
1. Go to **Catalog**
2. Type the UPC, EAN, or barcode number into the **search bar**
3. The search checks item name, SKU, and barcode fields — matching items appear in the list

### During Receiving
1. Open a draft receipt in **Inventory** → **Receiving**
2. In the item search field, type or scan the barcode
3. The system searches in order: **barcode → SKU → item name** (using trigram matching for partial matches)
4. Select the item to add it to the receipt

### At the POS
- Scan the barcode with your scanner — the POS searches the catalog by barcode/SKU and adds the item to the order

### Tip
If an item isn't found by barcode, the barcode may not be assigned yet. Go to **Catalog** → open the item → **Edit** and add the barcode value.

**Permission required:** \`catalog.read\` (search), \`catalog.manage\` (edit barcode)`,
  },
  {
    slug: 'inv-troubleshoot-negative-stock',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'why is this item allowing negative stock|item went below zero|negative inventory|negative on hand|stock went negative|how did inventory go negative',
    approvedAnswerMarkdown: `## Why an Item Is Allowing Negative Stock

### Check the "Allow Negative" Setting
Each inventory item has an **Allow Negative** flag. If enabled, the system permits sales and adjustments that take on-hand below zero.

1. Go to **Catalog** → open the item → **Stock** section
2. Look for **Allow Negative** — if it's on, that's why

### Common Reasons Negative Stock Happens
1. **Allow Negative is on** — this is the most common cause, especially for items where you want to sell even if stock count is behind
2. **Timing** — a sale was processed before a receipt was posted, temporarily pushing on-hand below zero
3. **Missed receipt** — stock was physically received but no receiving receipt was posted in the system

### How to Fix
- If negative stock is correct (you owe yourself a receipt): post the receiving receipt to bring on-hand back up
- If it's a data error: use **Adjust** on the item to correct the quantity

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-prevent-negative-stock',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I prevent staff from selling items below zero|disable negative stock|block overselling|prevent selling out of stock items|stop negative inventory',
    approvedAnswerMarkdown: `## Preventing Sales Below Zero Stock

1. Go to **Catalog** → open the item → **Edit**
2. Set **Allow Negative** to **off** (unchecked)
3. Save

### What Happens When Allow Negative Is Off
- POS sales that would reduce on-hand below zero are **blocked**
- The cashier sees an "out of stock" message
- Adjustments and shrink actions are also prevented from going below zero

### Bulk Update
If you want to disable negative stock across many items, update each item's setting. Currently this is done per-item.

### Tips
- Items that are made-to-order or service-type items typically should **allow** negative (or have tracking off entirely)
- Retail and F&B ingredients typically should **not** allow negative to catch receiving gaps early

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-dead-stock',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I see which items are sitting dead with no recent sales|dead stock report|slow moving items|no sales items|stale inventory|items with no movement|find dead inventory',
    approvedAnswerMarkdown: `## Identifying Dead Stock (No Recent Sales)

### Using Movement History
1. Go to **Catalog** → open a suspect item → **Stock** section
2. Check the **Movement History** — if the most recent \`sale\` movement is weeks or months ago (or absent), the item is sitting idle

### Using the Inventory Valuation Report
1. Go to **Accounting** → **Reports** → **Inventory Valuation**
2. Review items that have on-hand quantity but are not on the low-stock alert list
3. Cross-reference with sales data to identify items with quantity but no recent movement

### Tips
- Sort the catalog list by **On-Hand** (descending) and compare with your sales reports to spot items with high stock and low turns
- Consider marking dead stock items for clearance pricing, or archive them if they won't be reordered
- Use the **Shrink** action to write off items that are no longer sellable

**Note:** A dedicated dead-stock / inventory aging report is planned for a future release. Today, use the movement history and valuation report as described above.

**Permission required:** \`inventory.read\``,
  },
  {
    slug: 'inv-howto-valuation-report-by-location',
    moduleKey: 'reporting',
    route: '/accounting/reports/inventory-valuation',
    questionPattern:
      'how do I run an inventory valuation report by location|inventory value by location|stock value per location|location inventory report|inventory report by store',
    approvedAnswerMarkdown: `## Running an Inventory Valuation Report by Location

1. Go to **Accounting** → **Reports** → **Inventory Valuation**
2. The report shows all tracked items with on-hand quantities

The report displays KPI summary cards:
- **Total Items** tracked
- **Total On-Hand** units
- **Below Reorder** count
- **Zero Stock** count

Each item row shows on-hand quantity and a threshold bar indicating reorder status.

### Location Scope
The report respects your current **location context** — the data reflects on-hand quantities at the location selected in your session header.

### Tips
- Switch locations using the location selector in the top navigation to see each location's valuation
- The report is printable — use your browser's print function for a hard copy

**Note:** A consolidated multi-location valuation view with dollar values (cost × on-hand) is planned for a future release.

**Permission required:** \`reporting.read\``,
  },
  {
    slug: 'inv-howto-aging-report',
    moduleKey: 'reporting',
    route: '/accounting/reports',
    questionPattern:
      'how do I run an inventory aging report|inventory aging|stock aging|days on hand report|inventory turns report|how old is my stock',
    approvedAnswerMarkdown: `## Inventory Aging Report

A dedicated inventory aging report (showing days-on-hand, turnover rate, and aging buckets) is **not yet available** in OppsEra.

### What You Can Do Today
1. **Movement History** — go to **Catalog** → open an item → **Stock** section → view all movements with dates. The gap between the last \`receive\` and today gives you a rough age
2. **Inventory Valuation Report** — go to **Accounting** → **Reports** → **Inventory Valuation** to see on-hand quantities and reorder status
3. **Manual Calculation** — compare the last receiving date (from movement history) to today to estimate days since last replenishment

### Tips
- Items with high on-hand and no recent \`sale\` movements are candidates for aging concerns
- Consider setting lower **reorder points** for slow-moving items to reduce carrying cost

**Note:** A full inventory aging report with aging buckets (0–30, 31–60, 61–90, 90+ days) is on the product roadmap.`,
  },
  {
    slug: 'inv-howto-cycle-count-by-category',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I count only one category during cycle count|cycle count by category|partial inventory count|count one department|category-specific count|selective count',
    approvedAnswerMarkdown: `## Counting Only One Category (Cycle Count)

A built-in cycle count workflow is **not yet available** in OppsEra. Here's the recommended manual approach:

### Manual Cycle Count Process
1. Go to **Catalog** and filter by the **category** you want to count
2. For each item, note the system's on-hand quantity vs your physical count
3. For any discrepancies, open the item → **Stock** section → click **Adjust**
4. Enter the correct quantity and set the reason to "Cycle count — [category name]"
5. Save each adjustment

### Tips
- Use the category filter in the catalog list to isolate the items you're counting
- Record discrepancies with consistent reason text (e.g. "Cycle count — Spirits") so you can review them in movement history later
- Schedule regular cycle counts by rotating through categories (e.g. Week 1: Beer, Week 2: Spirits, etc.)

**Note:** A formal cycle count workflow with count sheets, variance review, and approval is planned for a future release.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-freeze-inventory',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I freeze inventory while a count is in progress|lock inventory during count|prevent changes during count|freeze stock for counting|inventory freeze',
    approvedAnswerMarkdown: `## Freezing Inventory During a Count

OppsEra does not currently have a formal inventory freeze or count-lock feature. However, you can minimize disruption:

### Recommended Approach
1. **Schedule counts during closed hours** — count before opening or after closing to avoid sales affecting on-hand during the count
2. **Count and adjust quickly** — complete the count and post all adjustments in one session
3. **Communicate with staff** — let the team know not to process receipts or transfers during the count window

### Why No Freeze Feature?
In a POS environment, freezing inventory would block all sales, which isn't practical during business hours. The recommended approach is to count during quiet periods and accept minor timing variances.

### Tips
- If you find discrepancies, adjust with reason "Physical count" so the audit trail is clear
- For high-value items, count first thing in the morning before any sales are processed

**Note:** A formal inventory freeze for scheduled counts is on the product roadmap.`,
  },
  {
    slug: 'inv-howto-approve-variances',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I approve count variances before posting them|variance approval|review count differences|approve inventory adjustments|count variance review',
    approvedAnswerMarkdown: `## Approving Count Variances Before Posting

OppsEra does not currently have a built-in count variance approval workflow. Adjustments post immediately when saved.

### Recommended Workaround
1. Have the counter **document** variances on paper or a spreadsheet (item, system qty, physical qty, difference)
2. A **manager reviews** the variance list before any adjustments are entered
3. Once approved, enter the adjustments in the system with reason "Approved count variance"

### Using Permissions to Control Access
- Only grant \`inventory.manage\` to supervisors/managers
- Counters with \`inventory.read\` can see quantities but cannot make adjustments
- This creates a natural approval gate — the counter reports, the manager adjusts

### Audit Trail
All adjustments are recorded in the item's **Movement History** with the user who made the change, the quantity delta, and the reason. Managers can review these after the fact.

**Note:** A formal count → review → approve → post workflow is planned for a future release.

**Permission required:** \`inventory.manage\` (to adjust)`,
  },
  {
    slug: 'inv-howto-recount-large-variances',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I recount only the items with large variances|recount high-variance items|selective recount|recount discrepancies|recount mismatched items',
    approvedAnswerMarkdown: `## Recounting Items with Large Variances

Since there's no built-in cycle count workflow yet, here's an efficient manual approach:

### Process
1. After your first count, compare physical counts to system on-hand for each item
2. Identify items where the variance exceeds your threshold (e.g. > 5% or > $50)
3. Physically recount **only** those items
4. If the recount confirms the variance, post the adjustment:
   - Go to **Catalog** → open the item → **Stock** → **Adjust**
   - Enter the correct quantity
   - Reason: "Recount confirmed — cycle count [date]"

### Tips
- Focus recounts on high-value and high-variance items first
- If a recount matches the original system quantity, the first count was likely wrong — no adjustment needed
- Document which items were recounted for your records

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-merge-duplicates',
    moduleKey: 'catalog',
    route: '/catalog',
    questionPattern:
      'how do I merge duplicate inventory items|merge items|combine duplicate SKUs|consolidate duplicate items|two items are the same|duplicate item cleanup',
    approvedAnswerMarkdown: `## Merging Duplicate Inventory Items

OppsEra does not currently have an automatic item merge feature. Here's the recommended manual approach:

### Steps
1. **Decide which item to keep** — choose the one with more transaction history or the correct SKU/barcode
2. **Transfer the duplicate's on-hand** to the keeper:
   - Open the **duplicate** item → **Stock** → **Shrink** the entire on-hand (reason: "Merge — transferred to [keeper SKU]")
   - Open the **keeper** item → **Stock** → **Adjust** to add the same quantity (reason: "Merge — received from [duplicate SKU]")
3. **Update references** — if the duplicate is linked to vendors, update those vendor catalog entries to point to the keeper item
4. **Archive** the duplicate: go to **Catalog** → open the duplicate → **Archive** with reason "Duplicate — merged into [keeper SKU]"

### Tips
- Check both items' movement history before merging to understand usage patterns
- Update any vendor catalog entries or POS favorites that reference the duplicate
- The archived item remains searchable for historical reporting but won't appear in active catalog lists

**Permission required:** \`catalog.manage\`, \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-replace-sku',
    moduleKey: 'catalog',
    route: '/catalog',
    questionPattern:
      'how do I replace one SKU with another without losing history|replace SKU|swap item|substitute SKU|item replacement|discontinue and replace',
    approvedAnswerMarkdown: `## Replacing One SKU with Another

### Steps
1. **Create the new item** in **Catalog** → **New Item** with the new SKU, pricing, and category
2. **Set up inventory** — the system auto-creates an inventory record; set the reorder point, par level, and costing method
3. **Receive initial stock** — either use **Adjust** for an opening balance or post a receiving receipt
4. **Archive the old item**:
   - Open the old item → **Archive** with reason "Replaced by [new SKU]"
   - This removes it from POS and catalog lists but preserves all historical transactions
5. **Update vendor links** — go to **Vendors** → open the vendor → **Catalog** tab → add the new item and remove the old one

### History Preservation
- The old item's movement history, sales history, and receipts remain intact and searchable
- The old item appears in historical reports for the periods it was active
- The new item starts fresh with its own history from the replacement date

**Permission required:** \`catalog.manage\`, \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-convert-nonstock-to-tracked',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I convert an item from non-stock to tracked inventory|start tracking inventory|enable inventory tracking|turn on stock tracking|make item trackable',
    approvedAnswerMarkdown: `## Converting a Non-Stock Item to Tracked Inventory

1. Go to **Catalog** → open the item → **Edit**
2. Enable **Track Inventory** (the \`isTrackable\` flag)
3. Set inventory fields:
   - **Base Unit** (e.g. EA, LB, CS)
   - **Costing Method** (weighted average, standard, or FIFO)
   - **Reorder Point** and **Par Level** (optional)
   - **Allow Negative** (on/off)
4. Save

### After Enabling Tracking
- The system creates an inventory item record with zero on-hand
- Set the opening balance: go to **Stock** section → **Adjust** → enter the current physical quantity
- Future sales will automatically deduct from on-hand
- Receiving receipts will add to on-hand and update cost

### Tips
- Set the opening balance immediately after enabling tracking to avoid false low-stock alerts
- If you switch costing methods later, consider the implications on cost reporting

**Permission required:** \`catalog.manage\`, \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-stop-tracking',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I stop tracking inventory for a service-type item|disable inventory tracking|turn off stock tracking|untrack item|service item inventory|stop counting this item',
    approvedAnswerMarkdown: `## Stopping Inventory Tracking for a Service-Type Item

1. Go to **Catalog** → open the item → **Edit**
2. Disable **Track Inventory** (uncheck \`isTrackable\`)
3. Save

### What Happens
- The item no longer appears in stock reports or low-stock alerts
- Sales no longer deduct from on-hand
- Existing movement history is preserved for reference
- The item remains sellable at the POS — it just isn't quantity-tracked

### When to Disable Tracking
- **Service items** (e.g. "Haircut", "Greens Fee", "Spa Treatment") — quantity doesn't apply
- **Miscellaneous charges** (e.g. "Delivery Fee", "Setup Charge")
- **Made-to-order items** that are assembled from tracked components

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-movement-history',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I see all movement history for one SKU this month|view stock movements|item movement log|inventory transactions|stock history|movement history for item',
    approvedAnswerMarkdown: `## Viewing Movement History for an Item

1. Go to **Catalog** → open the item
2. Scroll to the **Stock** section
3. Click **Movement History** (or view the movements inline)

### What You'll See
Each movement shows:
- **Date** — when the movement occurred
- **Type** — receive, sale, void_reversal, adjustment, transfer_in, transfer_out, shrink, waste, return, initial, conversion
- **Quantity Delta** — positive (stock in) or negative (stock out)
- **Unit Cost** — cost at time of movement
- **Extended Cost** — quantity × unit cost
- **Reference** — the source document (order ID, receipt ID, etc.)
- **Reason** — text entered for adjustments and shrink
- **Source** — pos, manual, system, integration
- **Business Date** — the operational date

### Via API
\`GET /api/v1/inventory/{id}/movements\` returns paginated movement history with cursor pagination.

**Permission required:** \`inventory.read\``,
  },
  {
    slug: 'inv-howto-identify-orders-reducing-qty',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I identify which orders reduced this item quantity|which orders used this item|track sales deductions|order inventory impact|what orders sold this item',
    approvedAnswerMarkdown: `## Identifying Orders That Reduced an Item's Quantity

1. Go to **Catalog** → open the item → **Stock** section → **Movement History**
2. Look for movements with type **sale** — each one corresponds to an order
3. The **Reference ID** column shows the order ID that triggered the deduction
4. Click or note the order ID to look it up in **Orders**

### Movement Types That Reduce Quantity
| Type | Cause |
|---|---|
| \`sale\` | POS or online order placed |
| \`transfer_out\` | Stock transferred to another location |
| \`shrink\` | Spoilage, breakage, theft |
| \`adjustment\` | Manual adjustment (negative) |

### Reversals
If an order is voided, a \`void_reversal\` movement appears that adds the quantity back. Returns create a \`return\` movement.

### Tips
- Filter by date range in the movement history to narrow down which orders affected stock during a specific period
- Each movement is idempotent — the same order can't create duplicate deductions

**Permission required:** \`inventory.read\``,
  },
  {
    slug: 'inv-troubleshoot-failed-event',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I see if a failed event stopped inventory from updating|inventory not updating after sale|stock not deducting|event failure inventory|order placed but stock not reduced|inventory event error',
    approvedAnswerMarkdown: `## Diagnosing a Failed Inventory Event

Inventory updates are driven by events (e.g. \`order.placed.v1\` triggers a stock deduction). If stock didn't update after a sale:

### Step 1: Check Movement History
1. Go to **Catalog** → open the item → **Stock** section → **Movement History**
2. Look for a \`sale\` movement matching the order date/time
3. If it's **missing**, the event consumer likely failed

### Step 2: Common Causes
1. **Event retry pending** — the outbox retries failed events up to 3 times. The movement may appear shortly.
2. **Item not trackable** — if \`isTrackable\` is off, the consumer skips the deduction
3. **Idempotency** — if the movement already exists (same order + item + movement type), a duplicate event won't create a second deduction

### Step 3: Manual Fix
If the event failed permanently and stock is wrong:
1. Open the item → **Stock** → **Adjust**
2. Enter the correct quantity with reason "Manual correction — order [order ID] event missed"

### Prevention
Stock alert events (\`inventory.low_stock.v1\`, \`inventory.negative.v1\`) fire when movements cross thresholds, which can surface problems early.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-reserve-stock',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I reserve stock for a future order or appointment|reserve inventory|hold stock|allocate stock for order|inventory reservation|set aside stock',
    approvedAnswerMarkdown: `## Reserving Stock for a Future Order

Stock reservation (soft allocation without immediate deduction) is **not yet available** as a built-in feature in OppsEra.

### Current Behavior
- Stock is deducted when an **order is placed**, not before
- There is no "reserved" or "allocated" quantity separate from on-hand

### Workarounds
1. **Increase par level** — if you regularly hold stock for future orders, raise the par level to account for expected reservations
2. **Manual note** — add a note to the order or appointment referencing the items needed, and visually track held stock
3. **Adjust with reason** — for critical reservations, adjust stock down with reason "Reserved for [order/appointment]" and adjust back if the reservation is canceled

### Tips
- The adjust-down approach gives you an audit trail but does reduce visible on-hand
- Spa and PMS appointments don't currently deduct inventory until the associated order is placed

**Note:** A formal stock reservation system is planned for a future release.`,
  },
  {
    slug: 'inv-howto-release-reserved',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I release reserved inventory that is no longer needed|unreserve stock|cancel reservation|release held stock|free up reserved inventory',
    approvedAnswerMarkdown: `## Releasing Reserved Inventory

Since formal stock reservations are not yet built into OppsEra, the release process depends on how you reserved the stock:

### If You Used the Adjustment Workaround
1. Go to **Catalog** → open the item → **Stock** → **Adjust**
2. Add back the reserved quantity
3. Set reason to "Released reservation — [original reason/order]"

### If You Used Par Level Padding
Simply lower the **par level** back to its normal value if you no longer need the buffer.

### Tips
- Check the movement history to confirm the original "Reserved for…" adjustment before releasing
- Always include a descriptive reason so the audit trail is clear

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-backorder',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I backorder an item that is out of stock|create backorder|backorder management|item out of stock but customer wants it|pending order out of stock',
    approvedAnswerMarkdown: `## Backorders for Out-of-Stock Items

OppsEra does not currently have a built-in backorder management system.

### Recommended Workaround
1. **Allow negative stock** on the item (if not already):
   - Go to **Catalog** → open the item → **Edit** → enable **Allow Negative**
   - This lets you place the order even though on-hand is zero or negative
2. **Place the order normally** — the system creates a \`sale\` movement that takes on-hand negative
3. **Create a receiving receipt** when the vendor shipment arrives — posting it brings on-hand back up

### Tracking Backorders
- Items with **negative on-hand** in the catalog list or stock alerts are effectively backordered
- Use the **Reorder Suggestions** to identify items that need to be reordered (items at or below reorder point with preferred vendor info)

### Tips
- If you don't want to allow negative stock, take the order manually (paper/notes) and enter it when stock arrives
- Check **Inventory** → **Stock Alerts** regularly for items that have gone negative

**Permission required:** \`inventory.manage\`, \`orders.manage\``,
  },
  {
    slug: 'inv-howto-substitute-bundle-item',
    moduleKey: 'catalog',
    route: '/catalog/items',
    questionPattern:
      'how do I substitute one item for another in a bundle or package|swap bundle component|replace item in combo|substitute combo item|bundle ingredient swap',
    approvedAnswerMarkdown: `## Substituting an Item in a Bundle or Combo

1. Go to **Catalog** → open the combo/bundle item
2. Find the **Components** section (combo items list)
3. Remove the old component item
4. Add the new substitute item with the correct quantity
5. Save

### Things to Check After Substitution
- **Cost roll-up** — the combo's cost may change with the new component. Review the total component cost.
- **Inventory** — the new component must be a tracked item if you want automatic deductions when the combo sells
- **POS** — the combo will immediately reflect the new component for future orders

### Tips
- If this is a temporary substitution (e.g. out of stock), consider adding the substitute as an **additional** component and removing the unavailable one, then reversing when stock returns
- Existing open orders with the combo are not retroactively changed — only new orders use the updated components

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-update-combo-quantities',
    moduleKey: 'catalog',
    route: '/catalog/items',
    questionPattern:
      'how do I update component quantities in a combo or kit|change bundle quantities|edit kit recipe|modify combo ingredients|update combo components',
    approvedAnswerMarkdown: `## Updating Component Quantities in a Combo or Kit

1. Go to **Catalog** → open the combo/bundle item
2. Find the **Components** section
3. Edit the quantity for each component (e.g. change "Burger Patty" from 1 to 2 for a double)
4. Save

### Impact
- **Inventory** — when the combo sells, each component deducts by the updated quantity
- **Cost** — the combo's total component cost recalculates based on the new quantities
- **Existing orders** — already-placed orders are not affected; changes apply to future sales only

### Tips
- Review the cost roll-up after changing quantities to ensure pricing still makes sense
- If you're changing a recipe significantly, consider creating a new combo item instead of modifying the existing one (preserves historical recipe for reporting)

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-bundle-cost-rollup',
    moduleKey: 'catalog',
    route: '/catalog/items',
    questionPattern:
      'how do I see the cost roll-up for a bundle|bundle cost|combo cost breakdown|kit cost|what does this bundle cost to make|component cost total',
    approvedAnswerMarkdown: `## Viewing the Cost Roll-Up for a Bundle

1. Go to **Catalog** → open the combo/bundle item
2. The **Components** section lists each component item with its quantity
3. Each component's current cost is pulled from its inventory record
4. The total component cost = sum of (component cost × quantity) across all components

### Cost Sources
- Each component's cost comes from its inventory item's **current cost** field
- Current cost is updated by receiving receipts (weighted average, standard, or last cost depending on costing method)

### Tips
- If a component's cost seems wrong, check its most recent receiving receipt or movement history
- Compare the total component cost to the combo's selling price to verify your margin
- Components with zero cost may not have been received yet — post a receiving receipt to establish cost

**Permission required:** \`catalog.read\``,
  },
  {
    slug: 'inv-howto-serial-numbers',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I track serial numbers during receiving and sale|serial number tracking|serial number on receipt|enter serial numbers|serialized inventory',
    approvedAnswerMarkdown: `## Tracking Serial Numbers During Receiving

OppsEra captures serial numbers on receiving receipt lines.

### During Receiving
1. Go to **Inventory** → **Receiving** → open or create a draft receipt
2. Add the item to the receipt
3. In the receipt line, enter the **Serial Numbers** (the field accepts multiple serial numbers as a list)
4. Post the receipt — serial numbers are stored with the receipt line

### Current Limitations
- Serial numbers are **captured on receipt** but are not currently tracked through to sale or individual unit lifecycle
- There is no serial number lookup that shows "which customer bought serial #XYZ"
- Serial-level inventory (tracking individual serial numbers as separate stock units) is not yet available

### What's Recorded
Each receipt line stores:
- Serial numbers (as a list)
- Lot number (if applicable)
- Expiration date (if applicable)

### Tips
- Use serial numbers on high-value items (electronics, equipment) for warranty and return reference
- The receipt detail page shows all serial numbers received on each line

**Note:** Full serial number lifecycle tracking (receive → stock → sale → warranty) is on the product roadmap.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-block-expired',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I block expired items from being sold|prevent selling expired products|expired item block|stop sale of expired items|expiration enforcement',
    approvedAnswerMarkdown: `## Blocking Expired Items from Sale

OppsEra captures expiration dates on receiving receipt lines but does **not** currently enforce sale blocking based on expiration.

### What's Available Today
- **Receiving** — you can enter an **Expiration Date** on each receipt line when posting a receipt
- **Visibility** — expiration dates are stored and visible on the receipt detail

### What's Not Built Yet
- Automatic POS blocking when an item's expiration date passes
- FEFO (First Expired, First Out) pick logic
- Alerts when items approach expiration

### Recommended Workaround
1. Manually review expiration dates on a regular schedule
2. When items expire, use **Shrink** to remove them from on-hand:
   - Open the item → **Stock** → **Shrink**
   - Enter quantity and reason: "Expired — [date]"
3. For critical items, set a calendar reminder to check expirations

**Note:** Automated expiration enforcement and near-expiry alerts are planned for a future release.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-expiring-soon-report',
    moduleKey: 'reporting',
    route: '/catalog/items',
    questionPattern:
      'how do I run a report of items expiring in the next 30 days|expiring items report|near expiry report|items about to expire|expiration report|soon to expire',
    approvedAnswerMarkdown: `## Items Expiring in the Next 30 Days

A dedicated expiration report is **not yet available** in OppsEra.

### What You Can Do Today
1. **Check individual items** — go to **Inventory** → **Receiving** → open recent receipts to see expiration dates on receipt lines
2. **Manual tracking** — maintain a spreadsheet of items with expiration dates from your receipts, sorted by date

### Why It's Not Automatic Yet
Expiration dates are captured per receipt line (batch/lot level), but there's no aggregated view that rolls up "all unexpired stock by expiration date" across all receipts.

### Workaround for Perishables
- Set up a regular review schedule (weekly for perishables)
- When doing your review, check the most recent receipts for items approaching their expiration
- Shrink out expired items promptly with reason "Expired"

**Note:** An expiration dashboard with configurable alert windows (7-day, 30-day, 90-day) is planned for a future release.`,
  },
  {
    slug: 'inv-howto-transfer-in-transit',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I transfer stock in transit and mark it received later|inter-location transfer|transfer between locations|send stock to another store|stock in transit|transfer inventory between sites',
    approvedAnswerMarkdown: `## Transferring Stock Between Locations

OppsEra supports inter-location transfers via the transfer command.

### How It Works
The transfer creates a paired movement:
- **Transfer Out** at the source location (reduces on-hand)
- **Transfer In** at the destination location (increases on-hand)

### Via the API
\`POST /api/v1/inventory/transfer\` with:
- \`inventoryItemId\` — the item to transfer
- \`fromLocationId\` — source location
- \`toLocationId\` — destination location
- \`quantity\` — units to transfer
- \`reason\` — e.g. "Restock downtown location"

### Current Limitations
- Transfers are **immediate** — both the out and in movements are created in the same transaction
- There is no "in transit" status where stock has left the source but not yet arrived at the destination
- There is no transfer UI page — transfers are currently processed via the API

### Workaround for In-Transit Tracking
1. **Shrink** at the source location with reason "In transit to [destination]"
2. When the stock arrives, **Adjust** at the destination location with reason "Received transfer from [source]"
3. This gives you a time gap between out and in, simulating transit

**Note:** A transfer management UI with draft → shipped → received workflow is planned for a future release.

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-cancel-transfer',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I cancel a transfer that was sent to the wrong location|reverse transfer|undo transfer|wrong location transfer|cancel inventory transfer|fix wrong transfer',
    approvedAnswerMarkdown: `## Canceling a Transfer Sent to the Wrong Location

Transfers in OppsEra are immediate and cannot be "canceled" after posting. However, you can reverse the effect:

### Steps to Reverse
1. **Transfer back** from the wrong destination to the correct source:
   - Process a new transfer from the wrong location back to the original location
   - Reason: "Reversal — transfer sent to wrong location"
2. **Transfer again** to the correct destination:
   - Process a new transfer from the source to the correct location
   - Reason: "Corrected transfer — originally sent to [wrong location]"

### Alternative: Use Adjustments
If the transfer API isn't convenient:
1. At the **wrong destination**: **Shrink** the quantity with reason "Reversal — wrong transfer destination"
2. At the **correct destination**: **Adjust** to add the quantity with reason "Corrected transfer from [source]"

### Tips
- Check both locations' movement history to confirm quantities are correct after the reversal
- Always include descriptive reasons for the audit trail

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-change-standard-cost',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I change standard cost without changing quantity|update standard cost|change item cost|adjust cost only|set new standard cost|standard cost update',
    approvedAnswerMarkdown: `## Changing Standard Cost Without Changing Quantity

For items using the **standard** costing method, you can update the cost directly.

### Steps
1. Go to **Catalog** → open the item → **Edit**
2. Update the **Cost** field to the new standard cost
3. Save

### What Happens
- The item's **current cost** updates to the new value
- On-hand quantity is **not affected**
- Future inventory movements use the new standard cost
- Historical movements retain their original cost (the audit trail is preserved)

### When to Update Standard Cost
- Annual cost review
- Vendor price change that you want to reflect immediately (without waiting for a receipt)
- Beginning of a new fiscal period

### Tips
- For **weighted average** items, cost updates automatically when receipts are posted — you don't manually set it
- If you need a one-time cost correction without changing the standard, use a zero-quantity adjustment with a cost note

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-switch-costing-method',
    moduleKey: 'inventory',
    route: '/catalog/items',
    questionPattern:
      'how do I switch an item from weighted average to standard cost|change costing method|switch costing method|FIFO to weighted average|change inventory valuation method',
    approvedAnswerMarkdown: `## Switching an Item's Costing Method

1. Go to **Catalog** → open the item → **Edit**
2. Change the **Costing Method** to the desired method:
   - **Weighted Average** — cost blends with each receipt (most common)
   - **Standard** — fixed cost until manually changed
   - **FIFO** — uses the last receipt cost (simplified FIFO)
3. If switching to **Standard**, set the **Standard Cost** value
4. Save

### Important Considerations
- **Historical movements** retain their original cost — the change only affects future movements
- **Current cost** may need a manual update after switching:
  - Switching to standard: set the standard cost explicitly
  - Switching to weighted average: the next receipt will begin blending from the current cost
- **No retroactive recalculation** — OppsEra does not recompute prior movement costs when you change methods

### Recommendation
Switch costing methods at the start of a fiscal period and document the change with a note or reason in an adjustment movement.

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-bulk-vendor-price-update',
    moduleKey: 'inventory',
    route: '/inventory/vendors',
    questionPattern:
      'how do I import a vendor catalog price update in bulk|bulk vendor price update|vendor cost import|update vendor prices in bulk|vendor price list import|mass update vendor costs',
    approvedAnswerMarkdown: `## Bulk Vendor Catalog Price Update

OppsEra does not currently have a dedicated vendor price list import feature. Here are your options:

### Option 1: Update via Receiving
When you post a receipt with the new prices, each line's vendor catalog entry (**Last Cost**) updates automatically. This is the most common way vendor costs get updated.

### Option 2: Manual Update per Item
1. Go to **Vendors** → open the vendor → **Catalog** tab
2. Update the **Vendor Cost** on each item
3. Save each change

### Option 3: Catalog CSV Import
1. Prepare a CSV with updated cost values (matching SKU or barcode)
2. Go to **Catalog** → **Import**
3. Use the import wizard to analyze, validate, and execute the update
4. The wizard supports updating existing items (matched by SKU) including cost fields

### Tips
- The catalog import wizard shows a preview before executing — review updated rows to confirm costs are correct
- After a bulk cost update, review your selling prices to maintain target margins

**Note:** A dedicated vendor price list import (separate from the catalog import) is planned for a future release.

**Permission required:** \`catalog.manage\`, \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-bulk-reorder-points',
    moduleKey: 'inventory',
    route: '/catalog',
    questionPattern:
      'how do I bulk-update reorder points for many items|mass update reorder points|change reorder points in bulk|bulk reorder settings|update par levels in bulk',
    approvedAnswerMarkdown: `## Bulk-Updating Reorder Points

OppsEra does not currently have a bulk-edit UI for reorder points. Here are your options:

### Option 1: Update Per Item
1. Go to **Catalog** → open each item → **Edit**
2. Update the **Reorder Point** and/or **Par Level**
3. Save

### Option 2: Catalog CSV Import
1. Export your catalog items or prepare a CSV with SKU and updated reorder point values
2. Go to **Catalog** → **Import**
3. Map the reorder point column during the import wizard
4. Execute the update — existing items matched by SKU will have their reorder points updated

### Prioritization Tips
- Use the **Stock Alerts** page (**Inventory** → **Stock Alerts**) to see which items are already at or below their reorder point
- Focus on high-velocity items first — they benefit most from accurate reorder points
- Review reorder points seasonally, as demand patterns change

**Permission required:** \`catalog.manage\`, \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-audit-reorder-changes',
    moduleKey: 'catalog',
    route: '/catalog/items',
    questionPattern:
      'how do I see which user changed reorder settings|audit reorder point changes|who changed par level|track reorder point edits|reorder settings change log',
    approvedAnswerMarkdown: `## Viewing Who Changed Reorder Settings

OppsEra tracks field-level changes on catalog items via the **Change Log**.

### Steps
1. Go to **Catalog** → open the item
2. Click **Change History** (or view the change log section)

The change log shows:
- **Date/Time** of the change
- **Changed By** — the user who made the edit
- **Action** — e.g. "update"
- **Field Changes** — old value → new value for each modified field

### What's Tracked
Changes to reorder point, par level, reorder quantity, cost, price, name, SKU, barcode, and all other catalog item fields are recorded with before/after values.

### Tips
- Use this to verify who adjusted reorder points and when
- The change log is append-only — entries cannot be deleted or modified

**Permission required:** \`catalog.read\``,
  },
  {
    slug: 'inv-howto-multi-vendor-item',
    moduleKey: 'inventory',
    route: '/inventory/vendors',
    questionPattern:
      'how do I link one catalog item to multiple vendors|multiple suppliers for one item|add second vendor|multi-vendor item|alternate vendor|additional supplier',
    approvedAnswerMarkdown: `## Linking One Item to Multiple Vendors

Each inventory item can be linked to multiple vendors, each with their own pricing and terms.

### Steps
1. Go to **Vendors** → open the first vendor → **Catalog** tab
2. Click **Add Item** → select the catalog item → set vendor SKU, cost, lead time, pack size
3. Repeat for the second vendor: open the second vendor → **Catalog** tab → add the same item

### Managing Multiple Vendors
- Each vendor-item link stores its own: **Vendor SKU**, **Vendor Cost**, **Lead Time**, **Pack Size**, **Min Order Qty**
- Mark one as **Preferred** — this vendor appears in reorder suggestions and auto-fills receiving defaults
- **Last Cost** updates independently per vendor when you post receipts from that vendor

### During Receiving
When you create a receipt from a specific vendor, the item search auto-fills that vendor's SKU and cost. If you receive from the alternate vendor instead, their pricing is used.

### Tips
- Use vendor comparison (check each vendor's cost) when deciding where to place your next order
- The preferred vendor can be changed at any time — it doesn't affect historical receipts

**Permission required:** \`inventory.manage\``,
  },
  {
    slug: 'inv-howto-seasonal-items',
    moduleKey: 'catalog',
    route: '/catalog',
    questionPattern:
      'how do I create seasonal items and hide them when out of season|seasonal menu items|hide items temporarily|seasonal inventory|show hide items by season|deactivate seasonal items',
    approvedAnswerMarkdown: `## Managing Seasonal Items

OppsEra doesn't have a "seasonal" flag, but you can use **Archive/Unarchive** to control visibility.

### Hiding Items for Off-Season
1. Go to **Catalog** → find the seasonal item
2. Click **Archive** (or **Deactivate**)
3. Enter reason: "Seasonal — off-season [year]"

Archived items:
- **Disappear** from the POS catalog
- **Disappear** from active catalog lists
- **Remain** in the system with all history intact
- Can be **unarchived** when the season returns

### Bringing Items Back
1. Go to **Catalog** → filter to show archived/inactive items
2. Find the seasonal item → click **Unarchive** (or **Reactivate**)
3. The item reappears in the POS and active catalog immediately

### Tips
- Set the **Reorder Point** to zero before archiving so you don't get false alerts during off-season
- When unarchiving, check the cost and price — vendor costs may have changed since last season
- Post a new receiving receipt to re-establish current cost and on-hand quantity for the new season

**Permission required:** \`catalog.manage\``,
  },
  {
    slug: 'inv-howto-item-margin',
    moduleKey: 'catalog',
    route: '/catalog/items',
    questionPattern:
      'how do I see the margin on an item using current cost and selling price|item profit margin|item markup|margin calculation|cost vs selling price|item profitability',
    approvedAnswerMarkdown: `## Viewing an Item's Margin

1. Go to **Catalog** → open the item
2. The item detail shows:
   - **Default Price** (selling price in dollars)
   - **Cost** (current cost from inventory)
3. Calculate margin:
   - **Margin $** = Price − Cost
   - **Margin %** = (Price − Cost) ÷ Price × 100

### Example
- Selling Price: $12.00
- Current Cost: $4.50
- Margin: $7.50 (62.5%)

### Where Cost Comes From
- **Weighted Average** items: cost blends with each receipt
- **Standard Cost** items: cost is the manually set standard
- **FIFO** items: cost is the last receipt cost

### Tips
- If cost shows $0.00, the item may not have been received yet — post a receipt to establish cost
- For combo/bundle items, the cost is the sum of component costs × quantities
- Check margins after receiving at new vendor prices to ensure your pricing still meets targets

### Location-Specific Pricing
If you have **location price overrides**, the margin may differ by location. Check the item's **Location Prices** section.

**Permission required:** \`catalog.read\``,
  },
  {
    slug: 'inv-howto-reorder-list-by-location',
    moduleKey: 'inventory',
    route: '/inventory/receiving',
    questionPattern:
      'how do I build a reorder list for only the downtown location|reorder suggestions by location|location-specific reorder|reorder for one store|location reorder list|replenishment by location',
    approvedAnswerMarkdown: `## Building a Reorder List for a Specific Location

### Using Reorder Suggestions
The reorder suggestions endpoint returns items at or below their reorder point, scoped to the current location.

1. Switch to the target location using the **location selector** in the top navigation
2. Go to **Inventory** → **Stock Alerts** to see items below reorder threshold
3. The system shows items where on-hand ≤ reorder point, along with:
   - Current on-hand quantity
   - Reorder point
   - Preferred vendor name and cost
   - Suggested order quantity (reorder quantity or par level − on-hand)

### Via API
\`GET /api/v1/inventory/receiving/reorder-suggestions\` returns the reorder list scoped to the location in your session context.

### Tips
- Each location has its own on-hand quantities, so reorder suggestions differ by location
- Set **reorder points** per item based on each location's sales velocity
- Use the **par level** field for locations that restock to a fixed target (suggested order qty = par level − on-hand)
- Review and create receiving receipts from the reorder list to replenish stock

**Permission required:** \`inventory.read\``,
  },
];

export async function seedTrainingDataBatch5(tenantId: string | null) {
  const rows = TRAINING_CARDS_BATCH5.map((c) => ({
    tenantId,
    slug: c.slug,
    moduleKey: c.moduleKey,
    route: c.route,
    questionPattern: c.questionPattern,
    approvedAnswerMarkdown: c.approvedAnswerMarkdown,
    status: 'draft' as const,
    version: 1,
  }));

  const result = await db
    .insert(aiSupportAnswerCards)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: aiSupportAnswerCards.id });

  return {
    answerCardsInserted: result.length,
    message: result.length < rows.length
      ? `${rows.length - result.length} cards already existed (skipped).`
      : 'All cards inserted successfully.',
  };
}
