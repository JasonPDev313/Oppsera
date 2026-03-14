# AI Assistant — Evaluation Benchmark Set (Session 11.5)

50 benchmark questions organized by category. Each question defines the expected answer mode, confidence band, source tier, and key answer traits that must be present in a high-quality response.

**Answer Modes**: `explain` | `guide` | `diagnose` | `escalate`
**Confidence Bands**: `high` | `medium` | `low`
**Source Tiers**: `t2` (answer card) | `t3` (answer memory) | `t4` (route manifest) | `t5` (release notes/KB) | `t6` (general SaaS knowledge)

---

## Category 1 — "What does this page/button do?" (15 questions)

### Q01
- **Question**: What does the Dashboard page show?
- **Route**: `/dashboard`
- **Module**: (none / global)
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Mentions summary metrics, KPIs, or recent activity across the tenant
  - Mentions that the dashboard is the home/landing page after login
  - Does not claim specific widget names without evidence from a manifest

---

### Q02
- **Question**: What is the "New Sale" button on the POS Retail screen?
- **Route**: `/pos/retail`
- **Module**: `pos`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that clicking it starts a new transaction or order
  - Notes it opens an empty cart or order form
  - Does not claim the button is disabled or requires a permission unless evidence says so

---

### Q03
- **Question**: What does the "Fire" button do on the F&B POS screen?
- **Route**: `/pos/fnb`
- **Module**: `fnb`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that Fire sends selected course items to the kitchen display (KDS)
  - Mentions the button is relevant to course/table management
  - Notes it is separate from the "Send" or "Close Tab" action

---

### Q04
- **Question**: What does the Orders list page show?
- **Route**: `/orders`
- **Module**: `orders`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes a paginated list of orders with status, total, and date
  - Mentions filtering or searching by status or date range
  - Notes that clicking a row navigates to the order detail

---

### Q05
- **Question**: What is the "Void" button on the order detail page?
- **Route**: `/orders/[id]`
- **Module**: `orders`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that Void cancels the entire order and reverses any charges
  - Distinguishes void from refund (void is pre-settlement, refund is post-settlement)
  - Notes it requires elevated permission or confirmation

---

### Q06
- **Question**: What does the Catalog page do?
- **Route**: `/catalog`
- **Module**: `catalog`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes catalog as the product/service listing management page
  - Mentions that items here are what staff can sell or add to orders
  - Notes the page has add, edit, and archive/deactivate actions

---

### Q07
- **Question**: What does the Inventory page track?
- **Route**: `/inventory`
- **Module**: `inventory`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that inventory tracks stock levels for products
  - Mentions receiving stock, adjustments, and low-stock alerts or counts
  - Notes the relationship between inventory items and catalog items

---

### Q08
- **Question**: What does the Customers list page show?
- **Route**: `/customers`
- **Module**: `customers`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes a searchable list of customer profiles
  - Mentions fields like name, email, phone, or membership status
  - Notes that clicking a customer opens the customer detail view

---

### Q09
- **Question**: What information is on the Customer detail page?
- **Route**: `/customers/[id]`
- **Module**: `customers`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes contact info, purchase/order history, and notes/tags sections
  - Mentions membership or loyalty data if available on the page
  - Notes edit capability or that some fields may be read-only depending on role

---

### Q010
- **Question**: What is the General Ledger page in Accounting?
- **Route**: `/accounting/gl`
- **Module**: `accounting`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains the GL as a record of all financial transactions organized by account
  - Mentions debits, credits, and account codes or chart of accounts
  - Notes that only authorized roles can post or adjust GL entries

---

### Q011
- **Question**: What does the Journal Entry form do?
- **Route**: `/accounting/journal-entries/new`
- **Module**: `accounting`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes manual journal entry creation with debit/credit lines
  - Mentions the memo, date, and reference number fields
  - Notes that the entry must balance (debits = credits) to post

---

### Q012
- **Question**: What does the Reports page offer?
- **Route**: `/reports`
- **Module**: `reporting`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes a library or list of available reports (sales, inventory, etc.)
  - Mentions date range filters and export options
  - Notes that some reports may be role-restricted

---

### Q013
- **Question**: What can I configure on the Settings page?
- **Route**: `/settings/general`
- **Module**: (global/settings)
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes general settings like business name, timezone, currency, and locale
  - Mentions that changes here affect the entire tenant
  - Notes that only Owners or Managers typically have access to this page

---

### Q014
- **Question**: What does the Membership page manage?
- **Route**: `/membership`
- **Module**: `membership`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes membership plans, tiers, or programs that customers can enroll in
  - Mentions benefits, pricing, or renewal terms associated with memberships
  - Notes the ability to assign or remove memberships from customer profiles

---

### Q015
- **Question**: What does the Marketing page do?
- **Route**: `/marketing`
- **Module**: `marketing`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes campaign creation, audience targeting, or promotional tools
  - Mentions email, SMS, or push notification channels
  - Notes that campaigns can be tied to customer segments or membership tiers

---

## Category 2 — "How do I...?" (10 questions)

### Q016
- **Question**: How do I process a refund on an order?
- **Route**: `/orders/[id]`
- **Module**: `orders`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Provides numbered steps starting from the order detail page
  - Mentions locating the Refund button or action and entering a refund amount or selecting items
  - Notes confirmation step and that refunds require appropriate permission

---

### Q017
- **Question**: How do I close a batch at end of day?
- **Route**: `/pos/retail`
- **Module**: `pos`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains navigating to the batch or shift close action (e.g., End of Day or Close Batch)
  - Mentions reviewing totals and confirming the batch close
  - Notes that closing a batch finalizes payments for that session

---

### Q018
- **Question**: How do I transfer a tab to another table in F&B?
- **Route**: `/pos/fnb`
- **Module**: `fnb`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes selecting the active tab or table and using a Transfer or Move option
  - Mentions selecting the destination table from a floor plan or list
  - Notes that the tab's items move to the new table intact

---

### Q019
- **Question**: How do I receive new inventory stock?
- **Route**: `/inventory`
- **Module**: `inventory`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains navigating to the Receive Stock or Purchase Order receive flow
  - Describes entering quantities and confirming receipt
  - Notes that on-hand quantities update automatically after confirmation

---

### Q020
- **Question**: How do I post a manual journal entry?
- **Route**: `/accounting/journal-entries/new`
- **Module**: `accounting`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Provides steps: open journal entry form, add debit and credit lines, enter memo and date
  - Notes that the entry must balance before posting is allowed
  - Mentions that a confirmation or approval may be required depending on role

---

### Q021
- **Question**: How do I create a new catalog item?
- **Route**: `/catalog/new`
- **Module**: `catalog`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Describes filling in item name, price, category, and optional SKU or barcode
  - Mentions saving or publishing the item to make it available in POS
  - Notes that price is stored in dollars (catalog uses NUMERIC)

---

### Q022
- **Question**: How do I add a new customer?
- **Route**: `/customers/new`
- **Module**: `customers`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains the form fields: name, email, phone, and optional address or notes
  - Mentions saving the customer record
  - Notes that the customer becomes searchable in POS and reports after creation

---

### Q023
- **Question**: How do I run an end-of-day sales report?
- **Route**: `/reports`
- **Module**: `reporting`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains selecting the Sales or End of Day report from the reports list
  - Describes setting the date range to today and clicking Run or Generate
  - Mentions export options (PDF, CSV) if available

---

### Q024
- **Question**: How do I set up a discount for a product?
- **Route**: `/catalog`
- **Module**: `catalog`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains locating the item and editing its pricing or discount settings
  - Describes entering a fixed or percentage discount amount
  - Notes that discounts may have start/end dates or minimum purchase requirements

---

### Q025
- **Question**: How do I void an order?
- **Route**: `/orders/[id]`
- **Module**: `orders`
- **Expected Mode**: `guide`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains navigating to the order detail and clicking the Void button
  - Notes that a confirmation prompt appears before voiding
  - Mentions that voiding is only available before settlement and requires elevated permission

---

## Category 3 — "Why is this disabled/stuck/different?" (10 questions)

### Q026
- **Question**: Why is the Refund button greyed out on this order?
- **Route**: `/orders/[id]`
- **Module**: `orders`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains likely causes: order not yet settled, or user lacks `orders.refund` permission
  - Mentions checking role assignment or order status
  - Does not claim a single definitive cause without context — acknowledges multiple possibilities

---

### Q027
- **Question**: Why does it say the batch is already closed when I try to close it?
- **Route**: `/pos/retail`
- **Module**: `pos`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that another user or an automated process already closed the batch for the session
  - Mentions checking the batch/shift history to confirm closure
  - Notes that a new batch/shift must be opened to continue transacting

---

### Q028
- **Question**: Why am I getting a "No open shift" error when I try to process a sale?
- **Route**: `/pos/retail`
- **Module**: `pos`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that a shift must be opened before transactions can be processed
  - Describes how to open a shift (Start Shift or Open Shift action)
  - Notes that shifts track who is operating the register and for which period

---

### Q029
- **Question**: Why can't I see the Accounting menu item?
- **Route**: `/dashboard`
- **Module**: (global)
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains likely causes: accounting module not enabled for this tenant, or role lacks accounting permission
  - Mentions that Owners and Managers typically have access while Cashiers and Servers may not
  - Notes the user should contact their manager or admin if they believe they should have access

---

### Q030
- **Question**: Why is the KDS not showing any incoming orders?
- **Route**: `/kds`
- **Module**: `kds`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains possible causes: KDS station not configured for this location, orders not being fired/sent from POS, or station filter set incorrectly
  - Mentions checking the station configuration and location assignment
  - Notes the difference between "Send" (to kitchen) and "Fire" (release to cook) if applicable

---

### Q031
- **Question**: Why is my inventory count different from what the system shows?
- **Route**: `/inventory`
- **Module**: `inventory`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains possible reasons: sales not yet synced, pending receive, manual adjustment not saved, or count performed at different location
  - Mentions running an inventory audit or checking adjustment history
  - Notes that in-flight orders that haven't closed may not yet be deducted

---

### Q032
- **Question**: Why is the "Post Journal Entry" button disabled?
- **Route**: `/accounting/journal-entries/new`
- **Module**: `accounting`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that the most common cause is an unbalanced entry (debits do not equal credits)
  - Notes that required fields (date, memo, at least one debit and one credit line) must be filled
  - Mentions permission requirement: only Managers or Owners can post manual journal entries

---

### Q033
- **Question**: Why is an order stuck in "Pending" status?
- **Route**: `/orders/[id]`
- **Module**: `orders`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that Pending means payment has not been captured or confirmed yet
  - Notes causes: payment provider timeout, network failure, or terminal disconnect
  - Recommends checking payment status and retrying or voiding the order if payment failed

---

### Q034
- **Question**: Why does the order total not match the payment amount?
- **Route**: `/orders/[id]`
- **Module**: `orders`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that partial payments, split payments, or tip adjustments can cause apparent mismatches
  - Notes that discounts or comps applied after initial payment capture could cause a difference
  - Recommends reviewing the payment breakdown tab or payment history on the order

---

### Q035
- **Question**: Why is GL posting not happening automatically for my orders?
- **Route**: `/accounting/gl`
- **Module**: `accounting`
- **Expected Mode**: `diagnose`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - Explains that GL posting depends on the accounting module being active and GL adapters being configured
  - Mentions that GL adapters are designed to never throw — a misconfiguration silently skips posting
  - Notes the user should check the GL posting log or contact an admin to verify adapter setup

---

## Category 4 — "Who can access this?" (5 questions)

### Q036
- **Question**: Who can process a refund?
- **Route**: `/orders/[id]`
- **Module**: `orders`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - States that refunds require the `orders.refund` permission (or equivalent)
  - Notes that Owners and Managers have this by default; Supervisors may depending on config; Cashiers typically do not
  - Advises that permission assignments can be customized by the Owner

---

### Q037
- **Question**: Who can see the Reports page?
- **Route**: `/reports`
- **Module**: `reporting`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - States that Owners and Managers can access all reports by default
  - Notes Supervisors may have access to operational reports but not financial reports
  - Explains that Cashiers and Servers typically do not have access to the Reports module

---

### Q038
- **Question**: Who can modify catalog items?
- **Route**: `/catalog`
- **Module**: `catalog`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - States that catalog modification requires `catalog.write` or equivalent permission
  - Notes that Owners and Managers have this permission; Supervisors may in some configs; Cashiers do not
  - Explains that read-only catalog access (for POS) does not require write permission

---

### Q039
- **Question**: Who can post manual journal entries?
- **Route**: `/accounting/journal-entries/new`
- **Module**: `accounting`
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - States that manual journal entries require `accounting.write` or `accounting.*` permission
  - Notes this is typically restricted to Owners and Managers (not Supervisors, Cashiers, or Servers)
  - Warns that unrestricted manual journal access poses financial integrity risk

---

### Q040
- **Question**: Who can manage users and roles?
- **Route**: `/settings/users`
- **Module**: (global/settings)
- **Expected Mode**: `explain`
- **Expected Confidence**: `medium`
- **Expected Source Tier**: `t4`
- **Key Answer Traits**:
  - States that user management is restricted to Owners by default (full RBAC control)
  - Notes that Managers may have limited user management (e.g., invite staff, but not change roles)
  - Explains that the 6 RBAC roles are: Owner, Manager, Supervisor, Cashier, Server, Staff

---

## Category 5 — "What changed recently?" (5 questions)

### Q041
- **Question**: What new features were added to the KDS recently?
- **Route**: `/kds`
- **Module**: `kds`
- **Expected Mode**: `explain`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t5`
- **Key Answer Traits**:
  - Acknowledges that release notes or changelogs are the authoritative source for this question
  - May mention multi-location KDS hardening, tab item management, or dispatch tracking if sourced from release notes
  - Does not fabricate specific feature names without evidence; escalates or caveats uncertainty

---

### Q042
- **Question**: Was there a rename of any field in the F&B module lately?
- **Route**: `/pos/fnb`
- **Module**: `fnb`
- **Expected Mode**: `explain`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t5`
- **Key Answer Traits**:
  - Honestly states that field rename history requires access to release notes or changelog
  - Notes the KDS terminology change from `resolved_at` to `cleared_at` if release notes are available as a source
  - Recommends checking the release notes or contacting an admin if the rename affects workflow

---

### Q043
- **Question**: Did the workflow for closing a tab change in a recent update?
- **Route**: `/pos/fnb`
- **Module**: `fnb`
- **Expected Mode**: `explain`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t5`
- **Key Answer Traits**:
  - Acknowledges the question refers to release history which may not be in the current evidence set
  - Describes the current tab close workflow based on available manifest data if present
  - Escalates or caveat if specific "recent change" cannot be confirmed from evidence

---

### Q044
- **Question**: Was the navigation menu reorganized recently?
- **Route**: `/dashboard`
- **Module**: (global)
- **Expected Mode**: `explain`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t5`
- **Key Answer Traits**:
  - Honestly states that navigation structure history is not answerable without release notes
  - Offers to describe the current navigation structure if the user needs orientation
  - Does not fabricate version numbers or change dates

---

### Q045
- **Question**: Is there a new module that was added recently?
- **Route**: `/dashboard`
- **Module**: (global)
- **Expected Mode**: `explain`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t5`
- **Key Answer Traits**:
  - Acknowledges that module additions appear in release notes or the admin panel
  - May enumerate known modules (accounting, AP, AR, SPA, PMS, marketing, membership, etc.) if sourced from manifest
  - Does not speculate about unreleased modules or claim a specific module is "new"

---

## Category 6 — Edge Cases (5 questions)

### Q046
- **Question**: Can I integrate OppsEra with my existing accounting software like QuickBooks?
- **Route**: `/settings/general`
- **Module**: (global)
- **Expected Mode**: `escalate`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t6`
- **Key Answer Traits**:
  - Honestly states that third-party accounting integrations are outside the scope of the AI assistant's knowledge
  - Does not fabricate a "yes" or "no" — recommends contacting the OppsEra support team or account manager
  - Notes that OppsEra has a built-in GL/accounting module but does not claim specific third-party integrations exist

---

### Q047
- **Question**: How do I handle a chargeback dispute with my payment processor?
- **Route**: `/orders/[id]`
- **Module**: `payments`
- **Expected Mode**: `escalate`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t6`
- **Key Answer Traits**:
  - Clearly states that chargeback disputes are handled through the payment processor, not within OppsEra
  - Recommends contacting the payment processor directly and gathering the order/transaction receipt from OppsEra as evidence
  - Does not attempt to describe a non-existent chargeback workflow in the software

---

### Q048
- **Question**: Can you add a custom field to the customer profile for my business?
- **Route**: `/customers`
- **Module**: `customers`
- **Expected Mode**: `escalate`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t6`
- **Key Answer Traits**:
  - States that custom field requests are a development or configuration task beyond end-user configuration
  - Does not claim custom fields can be added from the UI if no such feature exists in the manifest
  - Recommends contacting OppsEra support or an implementation consultant for customization requests

---

### Q049
- **Question**: When will the golf module be available for my account?
- **Route**: `/dashboard`
- **Module**: (global)
- **Expected Mode**: `escalate`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t6`
- **Key Answer Traits**:
  - States that roadmap and feature availability timelines are not something the AI assistant can answer
  - Does not fabricate a release date or promise availability
  - Recommends contacting the OppsEra sales or account team for module enablement questions

---

### Q050
- **Question**: Can you show me a report comparing my revenue to industry benchmarks?
- **Route**: `/reports`
- **Module**: `reporting`
- **Expected Mode**: `escalate`
- **Expected Confidence**: `low`
- **Expected Source Tier**: `t6`
- **Key Answer Traits**:
  - States clearly that industry benchmark comparisons are not a feature of OppsEra's built-in reporting
  - Does not hallucinate a benchmark report that does not exist
  - Offers to help navigate available built-in reports (sales summary, end-of-day, etc.) as an alternative

---

## Scoring Reference

| Pass Criteria | Points |
|---|---|
| All required traits matched | 2 pts (pass) |
| 1 or 2 required traits matched (out of 3) | 1 pt (partial) |
| 0 traits matched | 0 pts (fail) |
| Confidence band matches expected | +0.5 bonus |
| Source tier matches expected | +0.5 bonus |

**Perfect score per question**: 3 points (2 trait points + 2 accuracy bonuses)
**Maximum total score**: 150 points (50 questions × 3)

---

## Category Breakdown

| Category | Count | IDs |
|---|---|---|
| What does this page/button do? | 15 | Q01–Q015 |
| How do I...? | 10 | Q016–Q025 |
| Why is this disabled/stuck/different? | 10 | Q026–Q035 |
| Who can access this? | 5 | Q036–Q040 |
| What changed recently? | 5 | Q041–Q045 |
| Edge cases | 5 | Q046–Q050 |
