# SECTION 3 — ALL 60 QUESTIONS ORGANIZED INTO BUCKETS

---

## ERP QUESTIONS (1–20)

### Q1: How do I create a new customer or vendor?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `create_customer_vendor` |
| **Sub-Intent** | — |
| **Original** | How do I create a new customer or vendor? |
| **Normalized** | How to create a new customer or vendor record |
| **Action Type** | `ask_clarifying_question` → `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `customers` (customer) / `inventory` (vendor) |
| **Route** | `/customers` or `/vendors` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`customers.manage`) |
| **Notes** | Must clarify: customer or vendor? These are different modules with different UIs. Customers → `/customers` with full CRM. Vendors → inventory module vendor management. Disambiguate first. |

---

### Q2: How do I edit an invoice after it has been posted?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `edit_posted_invoice` |
| **Sub-Intent** | — |
| **Original** | How do I edit an invoice after it has been posted? |
| **Normalized** | How to modify a posted invoice |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `ar` |
| **Route** | `/customers/billing` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`ar.manage`) |
| **Notes** | Posted invoices generally cannot be edited directly — the correct approach is to issue a credit memo or void and reissue. The bot should explain this pattern rather than trying to show an "edit" button. |

---

### Q3: Why is this invoice showing as unpaid when payment was entered?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `troubleshooting_error` |
| **Intent** | `invoice_payment_mismatch` |
| **Sub-Intent** | — |
| **Original** | Why is this invoice showing as unpaid when payment was entered? |
| **Normalized** | Invoice shows unpaid despite payment being recorded |
| **Action Type** | `check_live_status` |
| **Escalation Risk** | Medium |
| **Module Key** | `ar` |
| **Route** | `/customers/billing` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: no |
| **Notes** | Common causes: payment applied to wrong invoice, payment in draft/pending state, partial payment not covering full amount, GL posting adapter failure (non-throwing — check posting status). Bot should guide user to check the AR ledger and payment status. |

---

### Q4: How do I issue a refund or credit memo?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `issue_credit_memo` |
| **Sub-Intent** | — |
| **Original** | How do I issue a refund or credit memo? |
| **Normalized** | How to issue a credit memo or refund in AR |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `ar` |
| **Route** | `/customers/billing` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`ar.manage`) |
| **Notes** | Different from POS refund. This is AR/accounting-level credit memo. Bot should clarify if user means POS return (→ Q24) or accounting credit memo. |

---

### Q5: How do I reconcile my bank account?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `bank_reconciliation` |
| **Sub-Intent** | — |
| **Original** | How do I reconcile my bank account? |
| **Normalized** | How to perform bank account reconciliation |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `accounting` |
| **Route** | `/accounting/bank-reconciliation` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: yes (`banking.reconcile`) |
| **Notes** | Multi-step workflow: start session → match transactions → review unmatched → complete reconciliation. Complex enough to warrant a KB article with screenshots. Also has settlement matching and CSV import path. |

---

### Q6: How do I fix a journal entry posted to the wrong account?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `fix_wrong_journal_entry` |
| **Sub-Intent** | — |
| **Original** | How do I fix a journal entry posted to the wrong account? |
| **Normalized** | How to correct a journal entry posted to the wrong GL account |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | High |
| **Module Key** | `accounting` |
| **Route** | `/accounting/journals` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: yes (`accounting.manage`) |
| **Notes** | Cannot edit a posted journal entry. Correct approach: void the original entry, then post a new correcting entry. Requires `accounting.manage` permission. High-risk — affects financial statements. Consider escalate_to_finance for users without accounting background. |

---

### Q7: How do I run a profit and loss report by location or department?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `reporting_analytics` |
| **Intent** | `run_pl_report` |
| **Sub-Intent** | `by_location_department` |
| **Original** | How do I run a profit and loss report by location or department? |
| **Normalized** | How to run a P&L report filtered by location or department |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `accounting` |
| **Route** | `/accounting/statements/profit-loss` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes (`financials.view`) |
| **Notes** | Direct answer: Navigate to Accounting → Statements → Profit & Loss. Use the location and department filters at the top. Also available: consolidated P&L across all locations at Accounting → Reports → Consolidated P&L. |

---

### Q8: How do I close the month or accounting period?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `close_accounting_period` |
| **Sub-Intent** | — |
| **Original** | How do I close the month or accounting period? |
| **Normalized** | How to close an accounting period or month-end |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | High |
| **Module Key** | `accounting` |
| **Route** | `/accounting/period-close` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: yes (`period.close`) |
| **Notes** | Complex orchestrated workflow with checklist. Close orchestrator runs pre-close checks. Irreversible — once closed, entries cannot be posted to that period. Must complete all locations before closing. Strongly recommend KB article + guided workflow. |

---

### Q9: Why are my inventory quantities not matching what is on hand?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `troubleshooting_error` |
| **Intent** | `inventory_count_mismatch` |
| **Sub-Intent** | — |
| **Original** | Why are my inventory quantities not matching what is on hand? |
| **Normalized** | Inventory system quantities don't match physical on-hand counts |
| **Action Type** | `check_live_status` |
| **Escalation Risk** | Medium |
| **Module Key** | `inventory` |
| **Route** | `/inventory/receiving` or `/retail-inventory` or `/fnb-inventory` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: no |
| **Notes** | Common causes: unreceived deliveries, unrecorded shrink, transfers not posted, POS inventory tracking not enabled on items, 86'd items still showing quantity. Guide user to check movements history and reconciliation tools. |

---

### Q10: How do I transfer inventory between locations?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `transfer_inventory` |
| **Sub-Intent** | — |
| **Original** | How do I transfer inventory between locations? |
| **Normalized** | How to transfer inventory stock between locations |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `inventory` |
| **Route** | `/inventory/receiving` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes (`inventory.manage`) |
| **Notes** | Straightforward workflow. Source location creates transfer → destination location receives. Both locations see the movement in their inventory history. |

---

### Q11: How do I receive a purchase order?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `receive_inventory` |
| **Sub-Intent** | `full_receipt` |
| **Original** | How do I receive a purchase order? |
| **Normalized** | How to receive inventory from a purchase order |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `inventory` |
| **Route** | `/inventory/receiving` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes (`inventory.manage`) |
| **Notes** | OppsEra uses "inventory receipts" rather than formal POs. The bot should explain: go to Inventory → Receiving → New Receipt → select vendor → add line items → quantities → post receipt. If user specifically asks about formal PO workflows, clarify that the system uses receipt-based receiving. |

---

### Q12: How do I partially receive a purchase order?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `receive_inventory` |
| **Sub-Intent** | `partial_receipt` |
| **Original** | How do I partially receive a purchase order? |
| **Normalized** | How to partially receive inventory from a purchase order |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `inventory` |
| **Route** | `/inventory/receiving` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes (`inventory.manage`) |
| **Notes** | Same workflow as full receipt — just enter the actual quantities received (less than ordered). The receipt can be posted with partial quantities. Remaining quantities can be received on a subsequent receipt. |

---

### Q13: How do I cancel or void a purchase order?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `void_receipt` |
| **Sub-Intent** | — |
| **Original** | How do I cancel or void a purchase order? |
| **Normalized** | How to cancel or void an inventory receipt |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `inventory` |
| **Route** | `/inventory/receiving` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: yes (`inventory.manage`) |
| **Notes** | If not yet posted: delete the draft receipt. If already posted: void the receipt (reverses inventory movements). Voiding a posted receipt may affect GL if landed cost was allocated. Clarify receipt state before guiding. |

---

### Q14: How do I set user permissions or restrict employee access?

| Field | Value |
|-------|-------|
| **Product Area** | `cross_cutting` |
| **Bucket** | `permissions_access` |
| **Intent** | `manage_user_permissions` |
| **Sub-Intent** | — |
| **Original** | How do I set user permissions or restrict employee access? |
| **Normalized** | How to configure user permissions and restrict access |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `settings` |
| **Route** | `/settings` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`users.manage`) |
| **Notes** | OppsEra uses 6 predefined roles (Owner, Manager, Supervisor, Cashier, Server, Staff) with fixed permission sets. No custom roles. Guide user to Settings → Users → assign role. Explain that 11 high-risk POS operations also require manager PIN override. |

---

### Q15: How do I add a new location, department, or cost center?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `account_configuration` |
| **Intent** | `add_location_department` |
| **Sub-Intent** | — |
| **Original** | How do I add a new location, department, or cost center? |
| **Normalized** | How to add a new location, department, or cost center |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `settings` |
| **Route** | `/settings/general` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`settings.update`) |
| **Notes** | Configuration change with downstream effects — new location needs GL mappings, tax config, inventory setup. Bot should mention the follow-up configuration steps needed after adding a location. |

---

### Q16: Why is payroll data not syncing correctly?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `integrations_sync` |
| **Intent** | `payroll_sync_issue` |
| **Sub-Intent** | — |
| **Original** | Why is payroll data not syncing correctly? |
| **Normalized** | Payroll data sync is not working correctly |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | High |
| **Module Key** | — |
| **Route** | — |
| **Context Flags** | account: yes, location: no, hardware: no, permission: no |
| **Notes** | **OppsEra does not have a payroll module.** Tip management, commissions, and expense reimbursements exist but no payroll processing. The bot must clearly state this and ask what the user is actually trying to do — they may mean tip payouts, commission reports, or export data for an external payroll provider. |

---

### Q17: How do I export data to Excel or CSV?

| Field | Value |
|-------|-------|
| **Product Area** | `cross_cutting` |
| **Bucket** | `reporting_analytics` |
| **Intent** | `export_data_csv` |
| **Sub-Intent** | — |
| **Original** | How do I export data to Excel or CSV? |
| **Normalized** | How to export data to Excel or CSV format |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `reporting` |
| **Route** | — |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`reports.export`) |
| **Notes** | CSV export is available on most report pages — look for the export/download button. Requires `reports.export` permission. The bot should ask which specific data the user wants to export to direct them to the right report page. |

---

### Q18: Why is my sales tax calculation wrong?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `troubleshooting_error` |
| **Intent** | `tax_calculation_error` |
| **Sub-Intent** | — |
| **Original** | Why is my sales tax calculation wrong? |
| **Normalized** | Sales tax is calculating incorrectly |
| **Action Type** | `check_configuration` |
| **Escalation Risk** | High |
| **Module Key** | `accounting` |
| **Route** | `/accounting/tax` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: no |
| **Notes** | Common causes: wrong tax rate configured on item, inclusive vs exclusive tax mode mismatch, tax group not assigned to item, location-specific tax rate not set. Tax rates are manually configured — no automated lookup (Avalara/TaxJar). Bot should guide to Accounting → Tax to review rates. **High escalation risk** because tax errors have legal/compliance implications. |

---

### Q19: How do I connect the ERP to QuickBooks, Stripe, or another integration?

| Field | Value |
|-------|-------|
| **Product Area** | `erp` |
| **Bucket** | `integrations_sync` |
| **Intent** | `connect_external_integration` |
| **Sub-Intent** | — |
| **Original** | How do I connect the ERP to QuickBooks, Stripe, or another integration? |
| **Normalized** | How to connect to QuickBooks, Stripe, or other external systems |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | — |
| **Route** | — |
| **Context Flags** | account: yes, location: no, hardware: no, permission: no |
| **Notes** | **OppsEra does not integrate with QuickBooks or Stripe for ERP/accounting.** The accounting module is fully self-contained. Payment processing uses CardPointe (card-present terminals). PMS uses Stripe for deposit authorization. The bot must clearly state which integrations exist and which don't, rather than guessing. |

---

### Q20: Where do I find audit history or see who changed a record?

| Field | Value |
|-------|-------|
| **Product Area** | `cross_cutting` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `view_audit_history` |
| **Sub-Intent** | — |
| **Original** | Where do I find audit history or see who changed a record? |
| **Normalized** | How to view audit history and change logs |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `accounting` |
| **Route** | `/accounting/audit` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`audit.view`) |
| **Notes** | Multiple audit sources: platform audit log at Accounting → Audit, customer-specific audit trail on customer detail page, GL tender audit trail, tag audit log. Bot should ask which type of record the user wants to audit to direct them correctly. |

---

## POS QUESTIONS (21–40)

### Q21: How do I ring up a sale?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `ring_up_sale` |
| **Sub-Intent** | — |
| **Original** | How do I ring up a sale? |
| **Normalized** | How to ring up a sale on the POS |
| **Action Type** | `ask_clarifying_question` → `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`orders.create`) |
| **Notes** | Must clarify: retail POS or F&B POS? Retail: tap items from grid/quick menu → cart builds → tender. F&B: open tab at table → add items by course → send to kitchen → present check → tender. Very different workflows. |

---

### Q22: How do I apply a discount or promo code?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `apply_discount` |
| **Sub-Intent** | — |
| **Original** | How do I apply a discount or promo code? |
| **Normalized** | How to apply a discount or promotional code at POS |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`discounts.apply`) |
| **Notes** | Two levels: line-item discount (select item → discount button → percentage or dollar amount) and order-level discount (Discount button on order → percentage or fixed with reason). Quick buttons for 5/10/15/20%. May require manager PIN for large discounts. No promo code system — discounts are manual. |

---

### Q23: How do I void an item or an entire transaction?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `void_item_or_transaction` |
| **Sub-Intent** | — |
| **Original** | How do I void an item or an entire transaction? |
| **Normalized** | How to void a line item or entire order on POS |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`orders.void`, manager PIN) |
| **Notes** | Void item: select item → void button → reason required. Void entire order: order actions → void → reason required. Both require `orders.void` permission and manager PIN override. Voided items appear struck through. F&B voids also update KDS. |

---

### Q24: How do I issue a refund or return?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `process_pos_refund` |
| **Sub-Intent** | — |
| **Original** | How do I issue a refund or return? |
| **Normalized** | How to process a refund or return at POS |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `orders` |
| **Route** | `/orders` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`returns.create`) |
| **Notes** | Return wizard: Orders → find original order (by order number or customer search) → Return button → select items and quantities → select reason → confirm. Creates a return order that reverses the payment. Requires `returns.create` permission. Different from ERP credit memo (Q4). |

---

### Q25: Why is my receipt printer not printing?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `hardware_devices` |
| **Intent** | `receipt_printer_not_printing` |
| **Sub-Intent** | — |
| **Original** | Why is my receipt printer not printing? |
| **Normalized** | Receipt printer is not printing |
| **Action Type** | `check_configuration` → `escalate_to_hardware_support` |
| **Escalation Risk** | High |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: yes, permission: no |
| **Notes** | OppsEra prints via hidden iframe to the browser's default printer (80mm thermal). Common causes: printer not set as default in OS, printer offline/disconnected, paper jam/out, browser print dialog blocked. Basic diagnostics: 1) Check printer power/connection, 2) Try OS test print, 3) Check browser allows popup/print. If basic checks fail, escalate. |

---

### Q26: Why is the cash drawer not opening?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `hardware_devices` |
| **Intent** | `cash_drawer_not_opening` |
| **Sub-Intent** | — |
| **Original** | Why is the cash drawer not opening? |
| **Normalized** | Cash drawer is not opening |
| **Action Type** | `check_configuration` → `escalate_to_hardware_support` |
| **Escalation Risk** | High |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: yes, permission: no |
| **Notes** | Cash drawers typically open via the receipt printer's kick command. If printer isn't working, drawer won't open either. Check: 1) Is printer connected and working? 2) Is the drawer connected to the printer's RJ-11 port? 3) Is the drawer locked with the key? For "No Sale" opens: use the No Sale drawer event button (requires `cash.drawer` permission). |

---

### Q27: How do I split a check or payment between multiple people?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `split_check` |
| **Sub-Intent** | — |
| **Original** | How do I split a check or payment between multiple people? |
| **Normalized** | How to split a check or payment between multiple guests |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `orders` |
| **Route** | `/pos/fnb` or `/pos/retail` |
| **Context Flags** | account: no, location: no, hardware: no, permission: no |
| **Notes** | Two approaches: 1) **Split tender** — one check, multiple payments (cash + card, two cards). Use Split Tender on payment screen. 2) **Split check** (F&B) — drag items between checks (by seat, even split, or custom amount). Split button on tab. 3) **Equal split** — divide total evenly among N guests. |

---

### Q28: How do I reopen a closed ticket?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `reopen_closed_ticket` |
| **Sub-Intent** | — |
| **Original** | How do I reopen a closed ticket? |
| **Normalized** | How to reopen a closed or completed order/ticket |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `orders` |
| **Route** | `/orders` or `/pos/fnb` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`orders.manage`) |
| **Notes** | Reopen command available on order detail and F&B tab. Requires `orders.manage` permission. Reverses the closed/paid state. Use cases: forgot to add items, need to apply a correction. Note: if the shift/batch is already closed, reopening may have accounting implications. |

---

### Q29: How do I transfer a tab or ticket to another register or server?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `transfer_tab` |
| **Sub-Intent** | — |
| **Original** | How do I transfer a tab or ticket to another register or server? |
| **Normalized** | How to transfer a tab or ticket to another server or register |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `fnb` |
| **Route** | `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`pos_fnb.tabs.transfer`) |
| **Notes** | F&B: transfer button on tab → select destination server or table. Retail: transfer from SavedTabsPanel or TransferTabPanel. Bulk transfer available from Manage Tabs panel for shift changes. |

---

### Q30: Why did the card payment decline?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `billing_payments` |
| **Intent** | `card_payment_declined` |
| **Sub-Intent** | — |
| **Original** | Why did the card payment decline? |
| **Normalized** | Card payment was declined at POS |
| **Action Type** | `check_live_status` |
| **Escalation Risk** | Medium |
| **Module Key** | `payments` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: no |
| **Notes** | Check the gateway response code from CardPointe. Common reasons: insufficient funds, expired card, incorrect PIN, card restricted, suspected fraud. The POS shows the decline reason from the terminal. If the terminal itself is offline (→ Q31), that's a different issue. Bot should ask: did the terminal communicate with the card, or did it not respond at all? |

---

### Q31: Why is the credit card terminal offline?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `hardware_devices` |
| **Intent** | `card_terminal_offline` |
| **Sub-Intent** | — |
| **Original** | Why is the credit card terminal offline? |
| **Normalized** | Credit card terminal is showing offline |
| **Action Type** | `check_configuration` → `escalate_to_hardware_support` |
| **Escalation Risk** | High |
| **Module Key** | `payments` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: yes, permission: no |
| **Notes** | CardPointe Bolt terminal connects via network. Check: 1) Terminal power and network connection, 2) Terminal HSN configured in settings, 3) Network/firewall not blocking CardPointe endpoints, 4) Terminal firmware up to date. The CardPresentIndicator shows connection state (idle/waiting/processing/etc.). If basic checks fail, escalate. |

---

### Q32: How do I add a custom item or open-priced item?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `add_custom_item` |
| **Sub-Intent** | — |
| **Original** | How do I add a custom item or open-priced item? |
| **Normalized** | How to add a custom or open-priced item to a POS order |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`price.override`) |
| **Notes** | Use the MISC / custom item button on the POS. Enter a name, price, and quantity. Creates a one-time line item with a placeholder SKU. May require `price.override` permission depending on configuration. |

---

### Q33: How do I change menu items, modifiers, or pricing?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `account_configuration` |
| **Intent** | `edit_menu_items` |
| **Sub-Intent** | — |
| **Original** | How do I change menu items, modifiers, or pricing? |
| **Normalized** | How to edit menu items, modifiers, or pricing in the catalog |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `catalog` |
| **Route** | `/catalog` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`catalog.manage`) |
| **Notes** | Catalog → Items → find item → Edit. Can change name, price, modifiers, categories, tax assignment, inventory tracking. For F&B modifiers: edit modifier groups and options. For pricing: prices are in dollars in catalog (converted to cents at order time). Changes take effect immediately on POS. |

---

### Q34: How do I clock in or out from the POS?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `clock_in_out` |
| **Sub-Intent** | — |
| **Original** | How do I clock in or out from the POS? |
| **Normalized** | How to clock in or clock out from the POS |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `fnb` |
| **Route** | `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: no, permission: no |
| **Notes** | **OppsEra does not have a dedicated time-clock module.** The POS has shift management (open/close register shifts with cash counting) and server PIN login, but no clock-in/clock-out or timecard tracking. If the user needs time tracking, they would need an external system. The bot should clarify: "Do you mean opening a register shift, or tracking employee hours?" |

---

### Q35: Why are taxes not calculating correctly on this sale?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `troubleshooting_error` |
| **Intent** | `pos_tax_calculation_error` |
| **Sub-Intent** | — |
| **Original** | Why are taxes not calculating correctly on this sale? |
| **Normalized** | POS tax calculation is incorrect on a sale |
| **Action Type** | `check_configuration` |
| **Escalation Risk** | High |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: no |
| **Notes** | Same root causes as Q18 but at POS level. Additional POS-specific cause: tax-exempt toggle is on for the order. Check: 1) Is the order marked tax-exempt? 2) Is the item assigned to the correct tax group? 3) Is the tax rate correct for this location? 4) Inclusive vs exclusive mode. Tax engine uses integer cents math — rounding issues are handled by proportional allocation with last-rate remainder. |

---

### Q36: How do I close out the register at the end of the day?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `close_register` |
| **Sub-Intent** | — |
| **Original** | How do I close out the register at the end of the day? |
| **Normalized** | How to close the register or end-of-day shift close |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `orders` or `fnb` |
| **Route** | `/pos/retail` or `/pos/close` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes (`shift.manage`) |
| **Notes** | Retail POS: Close Shift button → count cash by denomination → enter counted total → review shift summary (sales, cash, cards, tips, paid in/out, drops, variance) → confirm close. F&B: Close Batch flow → server checkout → cash count → Z-report review → post batch to GL. Different workflows for retail vs F&B. |

---

### Q37: Why are inventory counts not updating after sales?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `troubleshooting_error` |
| **Intent** | `inventory_not_updating_after_sales` |
| **Sub-Intent** | — |
| **Original** | Why are inventory counts not updating after sales? |
| **Normalized** | Inventory quantities not decreasing after POS sales |
| **Action Type** | `check_configuration` |
| **Escalation Risk** | Medium |
| **Module Key** | `inventory` |
| **Route** | `/retail-inventory` or `/fnb-inventory` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: no |
| **Notes** | Most common cause: `isTrackInventory` is not enabled on the catalog item. Only items with inventory tracking turned on will decrement on sale. Check: Catalog → Item → ensure "Track Inventory" is on. Other causes: item sold from a different location than inventory is stocked at, event consumer not processing. |

---

### Q38: How do I reprint a receipt?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `reprint_receipt` |
| **Sub-Intent** | — |
| **Original** | How do I reprint a receipt? |
| **Normalized** | How to reprint a receipt for a completed order |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `orders` |
| **Route** | `/orders/[orderId]` |
| **Context Flags** | account: no, location: no, hardware: yes, permission: no |
| **Notes** | Go to Orders → find the order → open detail → Print Receipt button. Also available: email receipt to customer. For kitchen chits, use the reprint-job command from KDS management. |

---

### Q39: How do I assign or change a register for an employee?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `account_configuration` |
| **Intent** | `assign_register_employee` |
| **Sub-Intent** | — |
| **Original** | How do I assign or change a register for an employee? |
| **Normalized** | How to assign an employee to a specific register |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `orders` |
| **Route** | `/pos/retail` or `/pos/fnb` |
| **Context Flags** | account: no, location: no, hardware: no, permission: yes (`shift.manage`) |
| **Notes** | F&B uses server PIN login — each server enters their 4-digit PIN to identify themselves on a shared terminal. Retail uses shift-based register assignment — open a shift on the terminal. There's no permanent register-to-employee mapping; it's session-based. |

---

### Q40: Why didn't this order send to the kitchen display system or printer?

| Field | Value |
|-------|-------|
| **Product Area** | `pos` |
| **Bucket** | `troubleshooting_error` |
| **Intent** | `kds_order_not_sent` |
| **Sub-Intent** | — |
| **Original** | Why didn't this order send to the kitchen display system or printer? |
| **Normalized** | Order did not appear on KDS or kitchen printer |
| **Action Type** | `check_configuration` → `check_live_status` |
| **Escalation Risk** | High |
| **Module Key** | `kds` |
| **Route** | `/pos/fnb` |
| **Context Flags** | account: yes, location: yes, hardware: yes, permission: no |
| **Notes** | Complex diagnostic. Check in order: 1) Was "Send to Kitchen" actually pressed? (items stay in draft until fired), 2) Is a KDS station configured for this location? 3) Is the KDS terminal online (heartbeat)? 4) Is the item's routing station set? (resolve-station logic: item → category → location default), 5) Check `fnb_kds_send_tracking` for dispatch status. The diagnose-kds-routing query can help. For kitchen printers: check printer routing rules. |

---

## RESERVATION QUESTIONS (41–60)

### Q41: How do I create a new reservation?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `create_reservation` |
| **Sub-Intent** | — |
| **Original** | How do I create a new reservation? |
| **Normalized** | How to create a new reservation |
| **Action Type** | `ask_clarifying_question` → `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations` or `/spa/appointments/new` or `/host` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes (`pms.reservations.create` or `spa.appointments.create`) |
| **Notes** | Must disambiguate: hotel room reservation (PMS), spa appointment, or dining reservation (host stand)? All three have different workflows, different modules, and different UIs. PMS: fill guest info, room type, dates, rate plan. Spa: select service, provider, date/time. Dining: party name, size, time, table. |

---

### Q42: How do I modify or cancel a reservation?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `transaction_corrections` |
| **Intent** | `modify_cancel_reservation` |
| **Sub-Intent** | — |
| **Original** | How do I modify or cancel a reservation? |
| **Normalized** | How to modify or cancel an existing reservation |
| **Action Type** | `ask_clarifying_question` → `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: update reservation (dates, room type, notes) or cancel (deactivates room block, closes folio). Spa: reschedule (time/provider) or cancel (triggers cancellation fee engine — tiered fees based on notice period). Both may involve deposit refund calculations. |

---

### Q43: Why is this time slot not available?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `reservations_availability` |
| **Intent** | `time_slot_unavailable` |
| **Sub-Intent** | — |
| **Original** | Why is this time slot not available? |
| **Normalized** | Time slot or date shows as unavailable for booking |
| **Action Type** | `check_live_status` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations` or `/spa/booking` |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: no |
| **Notes** | PMS causes: all rooms of that type booked, room out-of-order, rate restriction (closed-to-arrival, min-stay, max-stay, stop-sell), group block consuming inventory. Spa causes: provider unavailable (time-off, outside availability window), resource busy, customer overlap (same customer already booked), provider not eligible for that service. Bot should check the specific availability engine for the product area. |

---

### Q44: How do I add a guest to an existing reservation?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `add_guest_to_reservation` |
| **Sub-Intent** | — |
| **Original** | How do I add a guest to an existing reservation? |
| **Normalized** | How to add an additional guest to a reservation |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: update reservation to add additional guest profile (linked guests). For spa multi-service appointments: add additional service line to existing appointment. For dining: update party size on the waitlist/reservation entry from the host stand. |

---

### Q45: How do I move a reservation to another time or table?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `move_reservation` |
| **Sub-Intent** | — |
| **Original** | How do I move a reservation to another time or table? |
| **Normalized** | How to move a reservation to a different time, room, or table |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` or `fnb` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` or `/host` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: "Move" command changes assigned room (checks availability). "Resize" changes dates. Spa: "Reschedule" changes time/provider. Dining: drag on timeline or edit reservation from host stand. |

---

### Q46: How do I mark a guest as checked in or arrived?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `check_in_guest` |
| **Sub-Intent** | — |
| **Original** | How do I mark a guest as checked in or arrived? |
| **Normalized** | How to check in a guest or mark them as arrived |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` or `/host` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`pms.front_desk.check_in` or `spa.appointments.manage`) |
| **Notes** | PMS: reservation detail → Check In button. Auto-assigns room if not pre-assigned. Triggers nightly charge posting. Spa: appointment detail → Check In button. Dining: host stand → mark arrival / seat from waitlist. Guest self-check-in QR code also available for dining. |

---

### Q47: How do I handle no-shows or late arrivals?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `handle_no_show` |
| **Sub-Intent** | — |
| **Original** | How do I handle no-shows or late arrivals? |
| **Normalized** | How to handle no-show or late arrival for a reservation |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: No-Show command on reservation (validates check-in date has passed). Can also run automatically via nightly auto-no-show job with configurable grace period. Spa: No-Show command triggers no-show fee engine (configurable, defaults to 100% of service price). Fee may be offset against deposit. Both create events for reporting. |

---

### Q48: How do I block off tables, rooms, courts, tee times, or resources?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `account_configuration` |
| **Intent** | `block_off_resources` |
| **Sub-Intent** | — |
| **Original** | How do I block off tables, rooms, courts, tee times, or resources? |
| **Normalized** | How to block off rooms, tables, or resources from availability |
| **Action Type** | `ask_clarifying_question` → `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | varies |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes |
| **Notes** | PMS rooms: set room to Out of Order (blocks from availability), or create a maintenance/house-use room block. Spa resources: set provider time-off (date range with reason). Spa rooms/equipment: managed via resource availability. F&B tables: managed from floor plan editor. Note: golf tee times exist but are hidden (non-compete). |

---

### Q49: How do I set booking rules like minimum notice or cancellation windows?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `account_configuration` |
| **Intent** | `configure_booking_rules` |
| **Sub-Intent** | — |
| **Original** | How do I set booking rules like minimum notice or cancellation windows? |
| **Normalized** | How to configure booking rules, minimum notice, and cancellation policies |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/rate-plans` or `/spa/settings` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: rate restrictions (min-stay, max-stay, closed-to-arrival, closed-to-departure) configured per rate plan. Cancellation handled by deposit policy. Spa: cancellation window (hours before appointment), tiered cancellation fees, no-show fee, first-cancellation grace, VIP exemption — all in Spa Settings. F&B host: waitlist config at `/host/waitlist-config` (max party size, time windows, auto-quotes). |

---

### Q50: Why did a customer not receive their confirmation email or text?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `notifications_communications` |
| **Intent** | `confirmation_not_received` |
| **Sub-Intent** | — |
| **Original** | Why did a customer not receive their confirmation email or text? |
| **Normalized** | Customer did not receive booking confirmation email or SMS |
| **Action Type** | `check_live_status` |
| **Escalation Risk** | Medium |
| **Module Key** | `pms` or `spa` |
| **Route** | — |
| **Context Flags** | account: yes, location: no, hardware: no, permission: no |
| **Notes** | Check: 1) Is the customer's email/phone correct on the profile? 2) Check message log for delivery status. 3) Email may be in spam/junk. 4) SMS requires Twilio to be configured. Spa emails are non-fatal (logged but never block booking), so a send failure wouldn't have been visible. PMS uses message templates — check if a template exists for this event type. |

---

### Q51: How do I resend a reservation confirmation?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `notifications_communications` |
| **Intent** | `resend_confirmation` |
| **Sub-Intent** | — |
| **Original** | How do I resend a reservation confirmation? |
| **Normalized** | How to resend a booking or reservation confirmation |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: send-reservation-message command (email or SMS via templates). Spa: resend from appointment detail (triggers booking confirmation email template). Both log the communication for audit. |

---

### Q52: How do I collect a deposit or prepayment?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `billing_payments` |
| **Intent** | `collect_deposit` |
| **Sub-Intent** | — |
| **Original** | How do I collect a deposit or prepayment? |
| **Normalized** | How to collect a deposit or prepayment for a reservation |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Medium |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: deposit policy configured per property (first_night, percentage, or fixed_amount). Authorize-deposit creates a Stripe PaymentIntent hold. Capture-deposit captures it. Spa: deposit calculated from spa settings (percentage or flat), auto-waived for walk-ins and VIP members. Deposit is collected at booking time via the booking flow. |

---

### Q53: How do I refund a deposit?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `billing_payments` |
| **Intent** | `refund_deposit` |
| **Sub-Intent** | — |
| **Original** | How do I refund a deposit? |
| **Normalized** | How to refund a deposit for a cancelled reservation |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | High |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reservations/[id]` or `/spa/appointments/[id]` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes |
| **Notes** | PMS: refund-payment command processes Stripe refund for captured deposits. Spa: refundable amount = deposit minus cancellation fee (tiered by notice period). Auto-calculated by cancellation engine. For PMS, cancellation may or may not warrant a full refund depending on deposit policy. **Escalate to finance** for disputed refund amounts. |

---

### Q54: How do I set capacity limits or max party size?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `account_configuration` |
| **Intent** | `set_capacity_limits` |
| **Sub-Intent** | — |
| **Original** | How do I set capacity limits or max party size? |
| **Normalized** | How to configure capacity limits or maximum party size |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` or `fnb` |
| **Route** | varies |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes |
| **Notes** | PMS: room types have max occupancy; count-available-rooms query enforces. Spa: resources have capacity; provider schedules limit concurrent appointments. F&B: max party size in waitlist config; table capacity in floor plan. Dining cover balance tracks total capacity. Each system handles capacity differently. |

---

### Q55: How do I create recurring reservations or events?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `create_recurring_reservation` |
| **Sub-Intent** | — |
| **Original** | How do I create recurring reservations or events? |
| **Normalized** | How to set up recurring reservations or appointments |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `spa` |
| **Route** | `/spa/appointments/new` |
| **Context Flags** | account: yes, location: no, hardware: no, permission: yes (`spa.appointments.create`) |
| **Notes** | Spa has a dedicated create-recurring-appointment command. PMS does not have native recurring reservations — group bookings serve a similar purpose for block bookings. F&B does not have recurring dining reservations. If the user needs PMS recurring, they would create individual reservations or use group blocks. |

---

### Q56: How do I manage a waitlist?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `manage_waitlist` |
| **Sub-Intent** | — |
| **Original** | How do I manage a waitlist? |
| **Normalized** | How to manage the waitlist for reservations or dining |
| **Action Type** | `ask_clarifying_question` → `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` or `fnb` |
| **Route** | `/host` or `/pms/waitlist` or `/spa/waitlist` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes |
| **Notes** | Three separate waitlist systems: 1) **F&B host stand** — real-time walk-in waitlist with SMS notifications, table offers, analytics. 2) **PMS** — date-flexible waitlist with scoring engine, auto-triggers on cancellation. 3) **Spa** — waitlist with rebooking engine. Must disambiguate which product area. |

---

### Q57: How do I assign reservations to specific staff, tables, or resources?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `how_to_workflow` |
| **Intent** | `assign_reservation_resources` |
| **Sub-Intent** | — |
| **Original** | How do I assign reservations to specific staff, tables, or resources? |
| **Normalized** | How to assign a reservation to a specific provider, table, room, or resource |
| **Action Type** | `guide_workflow` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` or `fnb` |
| **Route** | varies |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes |
| **Notes** | PMS: assign room on reservation (or auto-assign at check-in via room assignment engine). Spa: select provider when creating appointment (or leave unassigned for any-available). F&B: select table from floor plan when seating. All support both pre-assignment and at-service-time assignment. |

---

### Q58: Why am I getting double bookings or overlapping reservations?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `troubleshooting_error` |
| **Intent** | `double_booking` |
| **Sub-Intent** | — |
| **Original** | Why am I getting double bookings or overlapping reservations? |
| **Normalized** | Double bookings or overlapping reservations are occurring |
| **Action Type** | `check_configuration` → `escalate_to_support` |
| **Escalation Risk** | High |
| **Module Key** | `pms` or `spa` |
| **Route** | varies |
| **Context Flags** | account: yes, location: yes, hardware: no, permission: no |
| **Notes** | PMS: check-availability uses assertRoomAvailable which checks for overlapping active blocks — if doubles are occurring, likely a race condition or restriction override being used. Spa: conflict-detector checks provider_busy, resource_busy, customer_overlap — if doubles slip through, it's a concurrency issue. Both should be rare with proper concurrency controls. **Escalate** — this is likely a bug rather than a configuration issue. |

---

### Q59: How do I sync reservations with Google Calendar or another channel?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `integrations_sync` |
| **Intent** | `sync_external_calendar` |
| **Sub-Intent** | — |
| **Original** | How do I sync reservations with Google Calendar or another channel? |
| **Normalized** | How to sync reservations with Google Calendar or external channels |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | — |
| **Context Flags** | account: yes, location: no, hardware: no, permission: no |
| **Notes** | **Limited integration.** Spa booking confirmation emails include Google Calendar and Outlook Calendar deep-links (one-way add to calendar). PMS has channel manager infrastructure (create/sync channels) but actual OTA API adapters are not yet implemented. No two-way Google Calendar sync exists. Bot should clearly state what's available vs. what isn't. |

---

### Q60: How do I run reports on bookings, cancellations, utilization, or no-shows?

| Field | Value |
|-------|-------|
| **Product Area** | `reservations` |
| **Bucket** | `reporting_analytics` |
| **Intent** | `reservation_reports` |
| **Sub-Intent** | — |
| **Original** | How do I run reports on bookings, cancellations, utilization, or no-shows? |
| **Normalized** | How to run reports on bookings, cancellations, utilization, and no-shows |
| **Action Type** | `answer_directly` |
| **Escalation Risk** | Low |
| **Module Key** | `pms` or `spa` |
| **Route** | `/pms/reports` or `/spa/reports` |
| **Context Flags** | account: no, location: yes, hardware: no, permission: yes (`pms.reports.view` or `spa.reports.view`) |
| **Notes** | PMS: Managers Report (arrivals/departures/no-shows/cancellations/stayovers, occupancy%, ADR, RevPAR, 7-day forecast), no-show report, pickup report, utilization grid. Spa: reporting dashboard (completed/canceled/no-show counts, revenue breakdown, utilization rate, rebooking rate, no-show rate, provider performance). Direct them to the appropriate reports section. |
