# SECTION 5 — IMPROVEMENT RECOMMENDATIONS

---

## 1. How to Improve This Initial Training Set

### Add Real User Data
- Mine your **existing support tickets/emails** for actual user phrasing. The 60 questions are reasonable guesses, but real users phrase things differently.
- Once the chatbot is live, use the **thumbs-down feedback** and **low-confidence responses** to identify gaps.
- The `ai_assistant_threads` table already tracks `answer_confidence` and `source_tier_used` — use this data to find intents that need better answer cards.

### Add Negative Examples
- For feature-gap intents (payroll, QuickBooks, Google Calendar sync), add clear "we don't have this" answers. Users will ask about features that don't exist — the bot should handle this gracefully instead of hallucinating.
- Feature gap intents identified: payroll, time clock, promo codes, custom RBAC roles, QuickBooks/Xero, two-way calendar sync, live OTA channels, automated tax rate lookup (Avalara/TaxJar), formal PO workflows.

### Add Context-Dependent Variants
- Many intents need different answers depending on product area (PMS vs Spa vs F&B). Currently handled with "clarify first" but you could create **product-area-specific answer cards** that the retrieval engine picks based on the user's current route.
- The `route` field on answer cards already supports this — create separate cards for `/pms/reservations` vs `/spa/appointments` vs `/host`.

### Add Error-Message-Specific Cards
- Users often paste exact error messages. Create cards keyed to specific error strings (e.g., "insufficient funds", "terminal timeout", "room unavailable").

---

## 2. Intents That Need More Phrase Variation

| Intent | Why | Priority |
|--------|-----|----------|
| `ring_up_sale` | Extremely common, huge variation in phrasing | Critical |
| `void_item_or_transaction` | Users say "cancel", "delete", "remove", "undo" interchangeably | Critical |
| `card_payment_declined` | Panic phrasing, typos, abbreviations | High |
| `receipt_printer_not_printing` | Hardware complaints are frantic and imprecise | High |
| `kds_order_not_sent` | Users describe symptoms differently ("kitchen didn't get it", "nothing on the screen") | High |
| `time_slot_unavailable` | Vague phrasing ("it won't let me book", "says unavailable") | High |
| `split_check` | "split", "separate", "divide", "two cards" — many synonyms | Medium |
| `tax_calculation_error` | "tax wrong", "charged too much tax", "no tax showing" | Medium |
| `close_register` | "cash out", "Z report", "end of day", "close the till" | Medium |
| `confirmation_not_received` | "never got email", "no text", "confirmation missing" | Medium |

---

## 3. Intents That Are Too Broad and Should Be Split

### `create_reservation` → Split into 3
- `create_hotel_reservation` (PMS)
- `create_spa_appointment` (Spa)
- `create_dining_reservation` (Host Stand)

These have completely different workflows, permissions, and UIs.

### `modify_cancel_reservation` → Split into 4
- `modify_hotel_reservation`
- `cancel_hotel_reservation`
- `reschedule_spa_appointment`
- `cancel_spa_appointment`

Cancellation has fee implications in spa that don't exist in PMS the same way.

### `manage_waitlist` → Split into 3
- `manage_dining_waitlist` (Host Stand — real-time, SMS)
- `manage_hotel_waitlist` (PMS — date-flexible, scoring engine)
- `manage_spa_waitlist` (Spa — rebooking engine)

### `block_off_resources` → Split by resource type
- `block_room_out_of_order` (PMS)
- `set_provider_time_off` (Spa)
- `close_table` (Host Stand)

### `tax_calculation_error` vs `pos_tax_calculation_error`
Currently two intents (Q18 and Q35) with significant overlap. Consider merging into one with a sub-intent for context (ERP vs POS).

---

## 4. Intents Requiring Real-Time Product/Context Lookup

These intents **cannot be answered well without checking the user's account state**:

| Intent | What Needs to Be Checked |
|--------|------------------------|
| `invoice_payment_mismatch` | AR ledger, payment status, allocation |
| `inventory_count_mismatch` | Inventory movements, item tracking flag |
| `tax_calculation_error` | Item tax group, location tax rate, tax-exempt flags |
| `card_payment_declined` | Gateway response code from last transaction |
| `card_terminal_offline` | Terminal heartbeat status, HSN configuration |
| `kds_order_not_sent` | KDS send tracking, station configuration, dispatch attempts |
| `inventory_not_updating_after_sales` | Item `isTrackInventory` flag |
| `time_slot_unavailable` | Availability engine query, rate restrictions, room/resource status |
| `confirmation_not_received` | Message log delivery status |
| `double_booking` | Reservation overlap check, restriction override log |

**Recommendation:** Build a **context-aware retrieval layer** that, for these intents, queries the relevant system state before answering. The existing `ai_assistant_context_snapshots` table captures route and visible actions — extend it to include relevant entity IDs (order number, reservation ID) so the orchestrator can look up live data.

---

## 5. Intents That Should Be Excluded from Chatbot / Routed to Human

| Intent | Why Route to Human |
|--------|-------------------|
| `fix_wrong_journal_entry` | GL corrections affect financial statements — need accounting expertise |
| `close_accounting_period` | Irreversible, high-impact operation — should have human oversight |
| `double_booking` | Likely a system bug — needs engineering investigation |
| `payroll_sync_issue` | Feature doesn't exist — conversation may need product/sales involvement |
| `card_terminal_offline` | After basic diagnostics, needs hands-on hardware troubleshooting |
| Deposit refund disputes | Money-related disputes need human judgment |
| Tax miscalculation (confirmed bug) | If config is correct but tax is still wrong, needs engineering |

**Don't exclude entirely** — let the bot do initial triage and diagnostics, THEN escalate with context. A bot that says "I've checked X, Y, Z and the issue persists — escalating to support with these details" is much more valuable than one that immediately says "please contact support."

---

## 6. Additional Questions to Add Next

### High-Priority Additions (Common Support Questions Not in the 60)

**POS:**
- How do I add a tip after the transaction is closed?
- How do I set up a gift card / sell a gift card?
- How do I apply a service charge?
- How do I process a house account payment?
- How do I hold/suspend an order and recall it later?
- How do I set up the quick menu grid?
- How do I use a barcode scanner?
- What does the manager PIN override mean?

**ERP/Accounting:**
- How do I create a budget?
- How do I record depreciation on fixed assets?
- How do I set up GL mappings for a new payment type?
- How do I handle a chargeback?
- How do I run the aged receivables report?
- How do I set up recurring journal entries?

**PMS:**
- How do I check out a guest?
- How do I post a charge to a guest's folio?
- How do I set up housekeeping assignments?
- How do I manage group bookings?
- How do I set up a corporate rate?
- How do I use the booking engine for online reservations?

**Spa:**
- How do I set up provider availability/schedule?
- How do I manage spa packages?
- How do I track provider commissions?
- How do I handle a walk-in appointment?

**Customers/CRM:**
- How do I merge duplicate customer records?
- How do I set up customer tags or segments?
- How do I view a customer's spending history?
- How do I set up a billing/house account?
- How do I import customers from CSV?

**Membership:**
- How do I set up a membership plan?
- How do I enroll a member?
- How do I cancel a membership?

### Suggested Next Batch Size
Add **40 more questions** to reach 100 total — this gives you good coverage across all modules. Prioritize based on actual support ticket frequency if available.

---

# SECTION 6 — PHRASE EXPANSION

For each of the 60 intents, here are 5–10 realistic alternate phrasings covering: short/frantic, natural spoken, vague, admin/operator, and typo-tolerant styles.

---

## Q1: `create_customer_vendor`
1. "add a customer"
2. "how do i create a new customer in the system"
3. "where do i go to add a vendor"
4. "new vendor setup"
5. "i need to add a new person to the system"
6. "create custmer" *(typo)*
7. "set up a new supplier"
8. "adding a new contact to the database"
9. "customer creation"
10. "where's the add customer button"

## Q2: `edit_posted_invoice`
1. "edit invoice"
2. "change invoice after posting"
3. "the invoice is wrong and it's already posted"
4. "how to fix a posted invoice"
5. "can i modify an invoice that's been sent"
6. "invoice has wrong amount need to change it"
7. "edit posted inv"
8. "update a finalized invoice"
9. "change amount on invoice after posting"
10. "invoice correction"

## Q3: `invoice_payment_mismatch`
1. "invoice still unpaid"
2. "i paid this but it still shows open"
3. "payment not showing on invoice"
4. "why doesn't my payment show"
5. "invoice says outstanding but we got the money"
6. "payment recorded but invoice still says due"
7. "invoice not clearing after payment"
8. "we received payment but AR shows balance"
9. "invoice balance wrong"
10. "why is this not marked paid"

## Q4: `issue_credit_memo`
1. "credit memo"
2. "how to issue a credit"
3. "give customer credit"
4. "create a credit note"
5. "need to refund customer account"
6. "credit their account"
7. "issue refund on invoice"
8. "how to do a credit memo in AR"
9. "reverse an invoice charge"
10. "customer overpaid need to credit"

## Q5: `bank_reconciliation`
1. "bank rec"
2. "reconcile the bank"
3. "how do i do bank reconciliation"
4. "match bank transactions"
5. "bank statement reconciliation"
6. "balance my bank account"
7. "reconcile bank statement to system"
8. "bank recon"
9. "where do i reconcile"
10. "match our deposits to the bank"

## Q6: `fix_wrong_journal_entry`
1. "wrong account on JE"
2. "posted to wrong GL account"
3. "journal entry is wrong"
4. "fix a JE"
5. "how to reverse a journal entry"
6. "journal posted to wrong code"
7. "correct a journal entry"
8. "move a journal entry to different account"
9. "undo a journal entry"
10. "GL entry on wrong account"

## Q7: `run_pl_report`
1. "P&L"
2. "profit and loss"
3. "run income statement"
4. "P&L by location"
5. "how to see profit and loss"
6. "income statement by department"
7. "financial report by location"
8. "where's the P&L"
9. "PnL report"
10. "show me profit loss for each location"

## Q8: `close_accounting_period`
1. "close the month"
2. "month end"
3. "period close"
4. "how to close the books"
5. "close accounting period"
6. "end of month close process"
7. "month end closing"
8. "close the period"
9. "lock the month"
10. "finalize the month"

## Q9: `inventory_count_mismatch`
1. "inventory is wrong"
2. "counts don't match"
3. "physical count doesn't match system"
4. "stock is off"
5. "why is my inventory count wrong"
6. "system says we have 50 but we only have 30"
7. "inventory discrepancy"
8. "on-hand doesn't match"
9. "where did the inventory go"
10. "stock count is off"

## Q10: `transfer_inventory`
1. "move inventory"
2. "transfer stock"
3. "send stock to other location"
4. "how to transfer between stores"
5. "inter-store transfer"
6. "move product to another location"
7. "inventory transfer"
8. "relocate stock"

## Q11: `receive_inventory` (full)
1. "receive PO"
2. "log delivery"
3. "we got a shipment"
4. "receive goods"
5. "how to receive in inventory"
6. "delivery came in how to enter"
7. "receive shipment"
8. "receiving"
9. "log incoming stock"

## Q12: `receive_inventory` (partial)
1. "partial delivery"
2. "only got some of the order"
3. "short shipment"
4. "receive some items"
5. "didn't get everything how to receive"
6. "partial receipt"
7. "incomplete delivery"
8. "received less than ordered"

## Q13: `void_receipt`
1. "cancel PO"
2. "void receipt"
3. "undo receiving"
4. "cancel a receipt"
5. "reverse a receipt"
6. "delete purchase order"
7. "we entered the wrong receipt"
8. "undo a delivery entry"

## Q14: `manage_user_permissions`
1. "user permissions"
2. "restrict access"
3. "change employee role"
4. "set up permissions"
5. "how to limit what someone can do"
6. "RBAC"
7. "permission settings"
8. "employee can see too much how to restrict"
9. "give someone manager access"
10. "who has access to what"

## Q15: `add_location_department`
1. "add location"
2. "new store"
3. "create a department"
4. "add a new branch"
5. "set up new location"
6. "how to add a cost center"
7. "create new site"
8. "add another location to the system"

## Q16: `payroll_sync_issue`
1. "payroll not working"
2. "payroll data wrong"
3. "where's payroll"
4. "payroll integration broken"
5. "sync payroll"
6. "payroll not syncing"
7. "export for payroll"
8. "payroll connection"

## Q17: `export_data_csv`
1. "export to excel"
2. "download CSV"
3. "get data out"
4. "save as spreadsheet"
5. "how to download report"
6. "export data"
7. "export to file"
8. "pull data into excel"
9. "where's the export button"

## Q18: `tax_calculation_error`
1. "tax is wrong"
2. "sales tax incorrect"
3. "wrong tax amount"
4. "tax not calculating right"
5. "charged wrong tax"
6. "tax rate is off"
7. "we're collecting the wrong amount of tax"
8. "tax issue"
9. "sales tax problem"

## Q19: `connect_external_integration`
1. "connect QuickBooks"
2. "Stripe integration"
3. "sync with accounting software"
4. "how to connect QB"
5. "xero integration"
6. "connect to our accounting"
7. "third party integration"
8. "integrate with another system"
9. "QuickBooks sync"

## Q20: `view_audit_history`
1. "audit log"
2. "who changed this"
3. "change history"
4. "audit trail"
5. "who edited this record"
6. "see changes"
7. "track who made changes"
8. "view activity log"
9. "who did this"

## Q21: `ring_up_sale`
1. "ring up"
2. "make a sale"
3. "how to sell something"
4. "process a transaction"
5. "ring someone up"
6. "start a sale"
7. "sell an item"
8. "POS sale"
9. "how to use the register"
10. "ring it up"

## Q22: `apply_discount`
1. "discount"
2. "apply discount"
3. "how to give a discount"
4. "promo code"
5. "percent off"
6. "take 10% off"
7. "apply coupon"
8. "give them a deal"
9. "mark down"
10. "discont" *(typo)*

## Q23: `void_item_or_transaction`
1. "void"
2. "cancel the sale"
3. "delete this item"
4. "remove from order"
5. "void the whole thing"
6. "undo this transaction"
7. "take this off"
8. "cancel order"
9. "void it"
10. "how do i void"

## Q24: `process_pos_refund`
1. "refund"
2. "return"
3. "give money back"
4. "customer wants return"
5. "process a refund"
6. "return an item"
7. "take something back"
8. "how to refund"
9. "customer returning"
10. "give them their money back"

## Q25: `receipt_printer_not_printing`
1. "printer not working"
2. "can't print"
3. "receipt won't print"
4. "no receipt"
5. "printer is broken"
6. "nothing coming out of printer"
7. "printing issue"
8. "receipt problem"
9. "printer offline"
10. "receipts stopped printing"

## Q26: `cash_drawer_not_opening`
1. "drawer won't open"
2. "cash drawer stuck"
3. "register won't open"
4. "drawer not popping"
5. "till stuck"
6. "can't open cash drawer"
7. "cash register won't open"
8. "drawer issue"

## Q27: `split_check`
1. "split the bill"
2. "separate checks"
3. "split payment"
4. "two cards"
5. "divide the check"
6. "pay separately"
7. "split the tab"
8. "half and half"
9. "each pay their own"
10. "multiple payments"

## Q28: `reopen_closed_ticket`
1. "reopen order"
2. "bring back closed ticket"
3. "undo close"
4. "reopen tab"
5. "closed too early"
6. "need to add to closed order"
7. "reopen a check"
8. "re-open ticket"

## Q29: `transfer_tab`
1. "move tab"
2. "change server"
3. "transfer to another server"
4. "hand off tab"
5. "switch servers"
6. "move to different table"
7. "transfer the check"
8. "give this tab to someone else"

## Q30: `card_payment_declined`
1. "card declined"
2. "card won't work"
3. "payment failed"
4. "card rejected"
5. "declined"
6. "card not going through"
7. "payment won't process"
8. "card denied"
9. "won't take the card"
10. "card error"

## Q31: `card_terminal_offline`
1. "terminal offline"
2. "card reader not working"
3. "can't process cards"
4. "terminal disconnected"
5. "card machine offline"
6. "payment device not responding"
7. "terminal won't connect"
8. "card reader offline"

## Q32: `add_custom_item`
1. "custom item"
2. "open ring"
3. "misc item"
4. "not in the system"
5. "ring up something that's not in catalog"
6. "add an item that doesn't exist"
7. "miscellaneous charge"
8. "one-off item"

## Q33: `edit_menu_items`
1. "change the menu"
2. "update prices"
3. "edit an item"
4. "change item price"
5. "add a modifier"
6. "update catalog"
7. "menu changes"
8. "modify the menu"
9. "change modifiers"
10. "update pricing"

## Q34: `clock_in_out`
1. "clock in"
2. "punch in"
3. "time clock"
4. "start my shift"
5. "clock out"
6. "punch out"
7. "track hours"
8. "where do I clock in"

## Q35: `pos_tax_calculation_error`
1. "tax is wrong on this sale"
2. "wrong tax at register"
3. "tax not right"
4. "overcharging tax"
5. "no tax on this item"
6. "tax too high"
7. "POS tax wrong"
8. "this sale has wrong tax"

## Q36: `close_register`
1. "close out"
2. "cash out"
3. "end of day"
4. "close the register"
5. "Z report"
6. "close shift"
7. "count the drawer"
8. "close the till"
9. "cash count"
10. "EOD close"

## Q37: `inventory_not_updating_after_sales`
1. "inventory not going down"
2. "sold it but count didn't change"
3. "stock not decreasing"
4. "inventory stuck"
5. "why didn't inventory change"
6. "sold something but inventory same"
7. "count not updating"
8. "POS not taking from inventory"

## Q38: `reprint_receipt`
1. "reprint"
2. "print receipt again"
3. "need another copy"
4. "lost receipt"
5. "receipt copy"
6. "print old receipt"
7. "customer needs receipt"
8. "duplicate receipt"

## Q39: `assign_register_employee`
1. "assign register"
2. "which register"
3. "set up my register"
4. "change register"
5. "assign me to a register"
6. "switch terminals"
7. "wrong register"

## Q40: `kds_order_not_sent`
1. "kitchen didn't get the order"
2. "KDS not showing"
3. "order didn't go to kitchen"
4. "nothing on kitchen screen"
5. "food not getting sent"
6. "KDS blank"
7. "kitchen never got it"
8. "order stuck"
9. "ticket not on KDS"
10. "kitchen display empty"

## Q41: `create_reservation`
1. "make a reservation"
2. "book a room"
3. "new booking"
4. "reserve a table"
5. "schedule appointment"
6. "book an appointment"
7. "new reservation"
8. "how to book"
9. "I need to make a reservation"
10. "reservaton" *(typo)*

## Q42: `modify_cancel_reservation`
1. "change reservation"
2. "cancel booking"
3. "modify my reservation"
4. "need to cancel"
5. "change dates"
6. "reschedule"
7. "cancel my appointment"
8. "edit booking"
9. "change my booking"
10. "cancel a reservation"

## Q43: `time_slot_unavailable`
1. "can't book this time"
2. "time not available"
3. "says unavailable"
4. "slot blocked"
5. "won't let me book"
6. "no availability"
7. "fully booked?"
8. "why can't I book here"
9. "date blocked"
10. "nothing available"

## Q44: `add_guest_to_reservation`
1. "add person"
2. "add guest"
3. "extra person"
4. "add someone to booking"
5. "another guest"
6. "increase party"
7. "add companion"
8. "more people"

## Q45: `move_reservation`
1. "move booking"
2. "change table"
3. "switch rooms"
4. "move to different time"
5. "change room"
6. "different table"
7. "change time"
8. "reassign room"

## Q46: `check_in_guest`
1. "check in"
2. "guest arrived"
3. "mark arrived"
4. "front desk check in"
5. "check someone in"
6. "they're here"
7. "guest is here"
8. "arrival check in"

## Q47: `handle_no_show`
1. "no show"
2. "didn't show up"
3. "guest never came"
4. "mark no show"
5. "no-show"
6. "they never arrived"
7. "what to do about no show"
8. "charge no show fee"

## Q48: `block_off_resources`
1. "block off"
2. "close room"
3. "out of order"
4. "block table"
5. "mark unavailable"
6. "take room offline"
7. "maintenance block"
8. "close off tables"
9. "block calendar"

## Q49: `configure_booking_rules`
1. "booking rules"
2. "set cancellation policy"
3. "minimum stay"
4. "cancellation window"
5. "advance booking"
6. "booking restrictions"
7. "set up cancellation fees"
8. "minimum notice period"

## Q50: `confirmation_not_received`
1. "no confirmation"
2. "never got email"
3. "didn't get text"
4. "confirmation missing"
5. "guest says no email"
6. "email not sent"
7. "where's the confirmation"
8. "customer didn't get anything"

## Q51: `resend_confirmation`
1. "resend email"
2. "send again"
3. "resend confirmation"
4. "re-send booking email"
5. "send another confirmation"
6. "email it again"
7. "resend the text"

## Q52: `collect_deposit`
1. "take a deposit"
2. "collect deposit"
3. "require payment upfront"
4. "advance payment"
5. "charge a deposit"
6. "prepayment"
7. "hold a card"
8. "take deposit"

## Q53: `refund_deposit`
1. "return deposit"
2. "give deposit back"
3. "deposit refund"
4. "refund their deposit"
5. "cancel and refund"
6. "get deposit back"
7. "return the deposit"

## Q54: `set_capacity_limits`
1. "set max capacity"
2. "limit bookings"
3. "max guests"
4. "party size limit"
5. "room capacity"
6. "how many seats"
7. "set max occupancy"

## Q55: `create_recurring_reservation`
1. "recurring booking"
2. "weekly appointment"
3. "standing reservation"
4. "repeat booking"
5. "schedule recurring"
6. "regular appointment"
7. "book every week"
8. "series of appointments"

## Q56: `manage_waitlist`
1. "waitlist"
2. "waiting list"
3. "add to waitlist"
4. "manage the wait"
5. "how does waitlist work"
6. "wait list"
7. "queue management"
8. "waitlist setup"

## Q57: `assign_reservation_resources`
1. "assign room"
2. "pick a provider"
3. "which table"
4. "assign to staff"
5. "choose a room"
6. "select provider"
7. "assign to specific person"

## Q58: `double_booking`
1. "double booked"
2. "two reservations same time"
3. "overlap"
4. "booked twice"
5. "overbooking"
6. "conflicting bookings"
7. "same slot booked twice"
8. "booking collision"

## Q59: `sync_external_calendar`
1. "Google Calendar"
2. "sync calendar"
3. "calendar integration"
4. "Outlook sync"
5. "export to calendar"
6. "iCal"
7. "connect calendar"
8. "Google Calendar sync"

## Q60: `reservation_reports`
1. "booking report"
2. "how many reservations"
3. "occupancy report"
4. "cancellation report"
5. "no show report"
6. "reservation analytics"
7. "utilization report"
8. "booking stats"

---

## Phrase Expansion Strategy for Scale

### Recommended Approach
1. **Start with 5–10 phrases per intent** (done above)
2. **After launch**, mine real user messages from `ai_assistant_messages` to discover natural phrasing patterns
3. **Group by intent**, add discovered phrases to the `questionPattern` pipe-separated list
4. **Synonym expansion**: Build a synonym map for key terms:
   - void / cancel / delete / remove / undo
   - refund / return / give money back / credit
   - reservation / booking / appointment
   - receipt / ticket / check / tab / bill
   - register / terminal / POS / till / drawer
5. **Typo tolerance**: The semantic search (T5–T7 in the retrieval pipeline) handles typos naturally via embeddings. Exact-match `questionPattern` should include common misspellings for high-frequency intents.

### Intent Confidence Thresholds (Recommended)

| Confidence | Action |
|-----------|--------|
| ≥ 0.90 | Answer directly from answer card (T2) |
| 0.70–0.89 | Answer with lower confidence indicator |
| 0.40–0.69 | Answer but flag for review, suggest "Was this helpful?" |
| 0.25–0.39 | Show best-guess answer + "I'm not sure about this" |
| < 0.25 | "I don't have a confident answer. Let me connect you with support." |

### Escalation Triggers (Recommended)

Auto-escalate when:
1. User expresses frustration (sentiment detection): "this is broken", "nothing works"
2. Same user asks 3+ questions in one thread without thumbs-up
3. Question involves money and the bot's confidence is < 0.70
4. Question involves hardware and basic diagnostics didn't resolve
5. User explicitly asks for a human: "talk to someone", "real person", "agent"
6. Question involves GL corrections, period close, or financial reversals

### Disambiguation Patterns (Recommended)

When a question is ambiguous across product areas, ask:
> "I'd be happy to help! Are you asking about:
> 1. **Hotel rooms** (PMS)
> 2. **Spa appointments**
> 3. **Dining / table service**
>
> This will help me give you the right steps."

Apply this pattern to: create_reservation, modify_cancel_reservation, manage_waitlist, block_off_resources, check_in_guest, assign_reservation_resources, collect_deposit, refund_deposit.
