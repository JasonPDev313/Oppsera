# SECTION 4A — HUMAN-READABLE TABLE

| # | Product Area | Bucket | Intent Name | Sub-Intent | User Question | Normalized Question | Action Type | Escalation Risk |
|---|-------------|--------|-------------|------------|---------------|-------------------|-------------|----------------|
| 1 | erp | how_to_workflow | create_customer_vendor | — | How do I create a new customer or vendor? | How to create a new customer or vendor record | ask_clarifying_question | Low |
| 2 | erp | transaction_corrections | edit_posted_invoice | — | How do I edit an invoice after it has been posted? | How to modify a posted invoice | guide_workflow | Medium |
| 3 | erp | troubleshooting_error | invoice_payment_mismatch | — | Why is this invoice showing as unpaid when payment was entered? | Invoice shows unpaid despite payment being recorded | check_live_status | Medium |
| 4 | erp | transaction_corrections | issue_credit_memo | — | How do I issue a refund or credit memo? | How to issue a credit memo or refund in AR | guide_workflow | Medium |
| 5 | erp | how_to_workflow | bank_reconciliation | — | How do I reconcile my bank account? | How to perform bank account reconciliation | guide_workflow | Low |
| 6 | erp | transaction_corrections | fix_wrong_journal_entry | — | How do I fix a journal entry posted to the wrong account? | How to correct a journal entry posted to the wrong GL account | guide_workflow | High |
| 7 | erp | reporting_analytics | run_pl_report | by_location_department | How do I run a profit and loss report by location or department? | How to run a P&L report filtered by location or department | answer_directly | Low |
| 8 | erp | how_to_workflow | close_accounting_period | — | How do I close the month or accounting period? | How to close an accounting period or month-end | guide_workflow | High |
| 9 | erp | troubleshooting_error | inventory_count_mismatch | — | Why are my inventory quantities not matching what is on hand? | Inventory system quantities don't match physical on-hand counts | check_live_status | Medium |
| 10 | erp | how_to_workflow | transfer_inventory | — | How do I transfer inventory between locations? | How to transfer inventory stock between locations | guide_workflow | Low |
| 11 | erp | how_to_workflow | receive_inventory | full_receipt | How do I receive a purchase order? | How to receive inventory from a purchase order | guide_workflow | Low |
| 12 | erp | how_to_workflow | receive_inventory | partial_receipt | How do I partially receive a purchase order? | How to partially receive inventory from a purchase order | guide_workflow | Low |
| 13 | erp | transaction_corrections | void_receipt | — | How do I cancel or void a purchase order? | How to cancel or void an inventory receipt | guide_workflow | Medium |
| 14 | cross_cutting | permissions_access | manage_user_permissions | — | How do I set user permissions or restrict employee access? | How to configure user permissions and restrict access | guide_workflow | Low |
| 15 | erp | account_configuration | add_location_department | — | How do I add a new location, department, or cost center? | How to add a new location, department, or cost center | guide_workflow | Low |
| 16 | erp | integrations_sync | payroll_sync_issue | — | Why is payroll data not syncing correctly? | Payroll data sync is not working correctly | answer_directly | High |
| 17 | cross_cutting | reporting_analytics | export_data_csv | — | How do I export data to Excel or CSV? | How to export data to Excel or CSV format | answer_directly | Low |
| 18 | erp | troubleshooting_error | tax_calculation_error | — | Why is my sales tax calculation wrong? | Sales tax is calculating incorrectly | check_configuration | High |
| 19 | erp | integrations_sync | connect_external_integration | — | How do I connect the ERP to QuickBooks, Stripe, or another integration? | How to connect to QuickBooks, Stripe, or other external systems | answer_directly | Low |
| 20 | cross_cutting | how_to_workflow | view_audit_history | — | Where do I find audit history or see who changed a record? | How to view audit history and change logs | answer_directly | Low |
| 21 | pos | how_to_workflow | ring_up_sale | — | How do I ring up a sale? | How to ring up a sale on the POS | ask_clarifying_question | Low |
| 22 | pos | how_to_workflow | apply_discount | — | How do I apply a discount or promo code? | How to apply a discount or promotional code at POS | guide_workflow | Low |
| 23 | pos | transaction_corrections | void_item_or_transaction | — | How do I void an item or an entire transaction? | How to void a line item or entire order on POS | guide_workflow | Medium |
| 24 | pos | transaction_corrections | process_pos_refund | — | How do I issue a refund or return? | How to process a refund or return at POS | guide_workflow | Medium |
| 25 | pos | hardware_devices | receipt_printer_not_printing | — | Why is my receipt printer not printing? | Receipt printer is not printing | check_configuration | High |
| 26 | pos | hardware_devices | cash_drawer_not_opening | — | Why is the cash drawer not opening? | Cash drawer is not opening | check_configuration | High |
| 27 | pos | how_to_workflow | split_check | — | How do I split a check or payment between multiple people? | How to split a check or payment between multiple guests | guide_workflow | Low |
| 28 | pos | transaction_corrections | reopen_closed_ticket | — | How do I reopen a closed ticket? | How to reopen a closed or completed order/ticket | guide_workflow | Medium |
| 29 | pos | how_to_workflow | transfer_tab | — | How do I transfer a tab or ticket to another register or server? | How to transfer a tab or ticket to another server or register | guide_workflow | Low |
| 30 | pos | billing_payments | card_payment_declined | — | Why did the card payment decline? | Card payment was declined at POS | check_live_status | Medium |
| 31 | pos | hardware_devices | card_terminal_offline | — | Why is the credit card terminal offline? | Credit card terminal is showing offline | check_configuration | High |
| 32 | pos | how_to_workflow | add_custom_item | — | How do I add a custom item or open-priced item? | How to add a custom or open-priced item to a POS order | answer_directly | Low |
| 33 | pos | account_configuration | edit_menu_items | — | How do I change menu items, modifiers, or pricing? | How to edit menu items, modifiers, or pricing in the catalog | guide_workflow | Low |
| 34 | pos | how_to_workflow | clock_in_out | — | How do I clock in or out from the POS? | How to clock in or clock out from the POS | answer_directly | Low |
| 35 | pos | troubleshooting_error | pos_tax_calculation_error | — | Why are taxes not calculating correctly on this sale? | POS tax calculation is incorrect on a sale | check_configuration | High |
| 36 | pos | how_to_workflow | close_register | — | How do I close out the register at the end of the day? | How to close the register or end-of-day shift close | guide_workflow | Low |
| 37 | pos | troubleshooting_error | inventory_not_updating_after_sales | — | Why are inventory counts not updating after sales? | Inventory quantities not decreasing after POS sales | check_configuration | Medium |
| 38 | pos | how_to_workflow | reprint_receipt | — | How do I reprint a receipt? | How to reprint a receipt for a completed order | answer_directly | Low |
| 39 | pos | account_configuration | assign_register_employee | — | How do I assign or change a register for an employee? | How to assign an employee to a specific register | guide_workflow | Low |
| 40 | pos | troubleshooting_error | kds_order_not_sent | — | Why didn't this order send to the kitchen display system or printer? | Order did not appear on KDS or kitchen printer | check_configuration | High |
| 41 | reservations | how_to_workflow | create_reservation | — | How do I create a new reservation? | How to create a new reservation | ask_clarifying_question | Low |
| 42 | reservations | transaction_corrections | modify_cancel_reservation | — | How do I modify or cancel a reservation? | How to modify or cancel an existing reservation | ask_clarifying_question | Medium |
| 43 | reservations | reservations_availability | time_slot_unavailable | — | Why is this time slot not available? | Time slot or date shows as unavailable for booking | check_live_status | Low |
| 44 | reservations | how_to_workflow | add_guest_to_reservation | — | How do I add a guest to an existing reservation? | How to add an additional guest to a reservation | guide_workflow | Low |
| 45 | reservations | how_to_workflow | move_reservation | — | How do I move a reservation to another time or table? | How to move a reservation to a different time, room, or table | guide_workflow | Low |
| 46 | reservations | how_to_workflow | check_in_guest | — | How do I mark a guest as checked in or arrived? | How to check in a guest or mark them as arrived | guide_workflow | Low |
| 47 | reservations | how_to_workflow | handle_no_show | — | How do I handle no-shows or late arrivals? | How to handle no-show or late arrival for a reservation | guide_workflow | Medium |
| 48 | reservations | account_configuration | block_off_resources | — | How do I block off tables, rooms, courts, tee times, or resources? | How to block off rooms, tables, or resources from availability | ask_clarifying_question | Low |
| 49 | reservations | account_configuration | configure_booking_rules | — | How do I set booking rules like minimum notice or cancellation windows? | How to configure booking rules, minimum notice, and cancellation policies | guide_workflow | Low |
| 50 | reservations | notifications_communications | confirmation_not_received | — | Why did a customer not receive their confirmation email or text? | Customer did not receive booking confirmation email or SMS | check_live_status | Medium |
| 51 | reservations | notifications_communications | resend_confirmation | — | How do I resend a reservation confirmation? | How to resend a booking or reservation confirmation | guide_workflow | Low |
| 52 | reservations | billing_payments | collect_deposit | — | How do I collect a deposit or prepayment? | How to collect a deposit or prepayment for a reservation | guide_workflow | Medium |
| 53 | reservations | billing_payments | refund_deposit | — | How do I refund a deposit? | How to refund a deposit for a cancelled reservation | guide_workflow | High |
| 54 | reservations | account_configuration | set_capacity_limits | — | How do I set capacity limits or max party size? | How to configure capacity limits or maximum party size | guide_workflow | Low |
| 55 | reservations | how_to_workflow | create_recurring_reservation | — | How do I create recurring reservations or events? | How to set up recurring reservations or appointments | guide_workflow | Low |
| 56 | reservations | how_to_workflow | manage_waitlist | — | How do I manage a waitlist? | How to manage the waitlist for reservations or dining | ask_clarifying_question | Low |
| 57 | reservations | how_to_workflow | assign_reservation_resources | — | How do I assign reservations to specific staff, tables, or resources? | How to assign a reservation to a specific provider, table, room, or resource | guide_workflow | Low |
| 58 | reservations | troubleshooting_error | double_booking | — | Why am I getting double bookings or overlapping reservations? | Double bookings or overlapping reservations are occurring | check_configuration | High |
| 59 | reservations | integrations_sync | sync_external_calendar | — | How do I sync reservations with Google Calendar or another channel? | How to sync reservations with Google Calendar or external channels | answer_directly | Low |
| 60 | reservations | reporting_analytics | reservation_reports | — | How do I run reports on bookings, cancellations, utilization, or no-shows? | How to run reports on bookings, cancellations, utilization, and no-shows | answer_directly | Low |

---

## Distribution Summary

### By Bucket

| Bucket | Count | % |
|--------|-------|---|
| how_to_workflow | 24 | 40% |
| transaction_corrections | 9 | 15% |
| troubleshooting_error | 8 | 13% |
| account_configuration | 7 | 12% |
| billing_payments | 4 | 7% |
| hardware_devices | 3 | 5% |
| reporting_analytics | 3 | 5% |
| integrations_sync | 3 | 5% |
| notifications_communications | 2 | 3% |
| reservations_availability | 1 | 2% |
| permissions_access | 1 | 2% |
| inventory_order_management | 0 | 0% |

### By Product Area

| Product Area | Count |
|-------------|-------|
| erp | 17 |
| pos | 17 |
| reservations | 20 |
| cross_cutting | 6 |

### By Action Type

| Action Type | Count |
|------------|-------|
| guide_workflow | 33 |
| answer_directly | 10 |
| ask_clarifying_question | 7 |
| check_configuration | 6 |
| check_live_status | 4 |

### By Escalation Risk

| Risk | Count |
|------|-------|
| Low | 32 |
| Medium | 16 |
| High | 12 |
