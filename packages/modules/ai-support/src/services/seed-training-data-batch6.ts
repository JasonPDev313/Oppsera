import { db, aiSupportAnswerCards } from '@oppsera/db';

// ─── Batch 6: 50 Assistant-Awareness & Meta Training Answer Cards ──────────
// These cover the AI assistant's own capabilities: explaining pages, guiding
// workflows, diagnosing problems, escalation, role-aware answers, confidence,
// and onboarding/training use cases. Inserted as 'draft' for admin review.

const TRAINING_CARDS_BATCH6 = [
  // ── 1. What am I looking at on this page? ──
  {
    slug: 'meta-what-am-i-looking-at',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what am I looking at|what is this page|what does this page do|explain this page|what am I seeing|what screen is this|what page am I on',
    approvedAnswerMarkdown: `## What Am I Looking At on This Page?

The assistant can detect which page you're on by reading the current URL and matching it against OppsEra's **route manifest** — a catalog of every screen in the system.

### What You'll Get
When you ask this question, the assistant will:
1. **Identify the page** — name, module, and purpose
2. **Explain the key sections** — what each panel, table, or form does
3. **List the main actions** — buttons, filters, and controls available to you
4. **Note role restrictions** — features that may be hidden based on your permissions

### Tips
- Ask this on any page — the assistant covers POS, ERP, KDS, F&B, inventory, accounting, and more
- If the assistant can't identify the page, it will tell you and suggest navigating to a known screen
- Combine with "Can you explain this in plain English?" for a jargon-free version`,
  },

  // ── 2. Which screen should I use for this task? ──
  {
    slug: 'meta-which-screen-for-task',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'which screen should I use|where do I go for this|which page|what screen do I need|where should I go|which module|find the right page|navigate to',
    approvedAnswerMarkdown: `## Which Screen Should I Use for This Task?

The assistant can recommend the right screen based on what you're trying to do.

### How It Works
1. **Describe your goal** — e.g., "I need to add a new menu item" or "I want to see today's sales"
2. The assistant matches your intent against the **route manifest** and **action manifest**
3. You'll get:
   - The **page name** and **navigation path** (e.g., Catalog → Items → New Item)
   - A brief explanation of what the page does
   - Any prerequisites (permissions, setup steps)

### Examples
| Goal | Recommended Screen |
|---|---|
| Add a menu item | Catalog → Items |
| Check today's revenue | Reporting → Daily Summary |
| Set up a new employee | Settings → Users |
| View kitchen tickets | KDS → Station View |
| Process a refund | POS → Order History → Refund |

### If You're Not Sure
Say "I'm trying to [goal]" and the assistant will narrow it down. If multiple screens could work, you'll get a comparison.`,
  },

  // ── 3. Walk me through the setup from scratch ──
  {
    slug: 'meta-setup-from-scratch',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'walk me through setup|setup from scratch|how do I set up|initial setup|getting started|first time setup|configure from scratch|set up the system',
    approvedAnswerMarkdown: `## Can You Walk Me Through the Setup from Scratch?

Yes — the assistant can provide step-by-step setup guidance tailored to your business type.

### General Setup Sequence
1. **Business Profile** — Company name, address, tax IDs, timezone
2. **Locations** — Add each physical location (store, restaurant, course, etc.)
3. **Users & Roles** — Create staff accounts and assign roles (Owner, Manager, Cashier, etc.)
4. **Catalog** — Add departments, categories, and items (menu items, products, services)
5. **Tax Configuration** — Set up tax rates and assign them to items
6. **Payment Methods** — Configure accepted tenders (cash, credit, gift cards)
7. **POS Terminals** — Register devices for each location
8. **Modules** — Enable and configure modules for your business type (F&B, Inventory, KDS, etc.)

### Business-Type Variations
- **Restaurant**: Add F&B service areas, course types, KDS stations, modifier groups
- **Retail**: Set up inventory tracking, reorder points, barcode scanning
- **Golf**: Configure courses, tee sheets, membership tiers
- **Hybrid**: Combine the above as needed

### Tips
- Ask "What are the required steps before I can go live?" for a checklist
- You can set up one module at a time — they're independent
- The assistant will warn you if you're missing a prerequisite`,
  },

  // ── 4. What does this field affect if I change it? ──
  {
    slug: 'meta-field-impact',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what does this field affect|what happens if I change this|impact of changing|what does this setting do|will changing this break|field impact|side effects of changing',
    approvedAnswerMarkdown: `## What Does This Field Affect If I Change It?

The assistant can explain the downstream impact of changing a field or setting.

### What You'll Learn
1. **Direct effect** — what the field controls on this screen
2. **Downstream impact** — other modules, reports, or workflows affected
3. **Reversibility** — whether the change can be undone and how
4. **Timing** — whether it takes effect immediately or on the next transaction

### Common High-Impact Fields
| Field | Impact |
|---|---|
| Item price | Affects future orders, not past ones. Catalog price is in dollars; POS converts to cents. |
| Tax rate | Changes apply to new transactions. Existing orders keep their original tax. |
| User role | Immediately changes what the user can see and do. Active sessions may need re-login. |
| Location timezone | Affects report date boundaries and order timestamps. |
| Inventory tracking toggle | Enabling starts tracking from zero — you'll need to do an initial count. |

### Safety Note
The assistant will flag high-risk changes (like disabling a payment method or changing GL account mappings) and suggest testing in a controlled way first.`,
  },

  // ── 5. Why is this button disabled for me? ──
  {
    slug: 'meta-button-disabled',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'why is this button disabled|button greyed out|can\'t click this button|button not working|action not available|why can\'t I click|disabled button|greyed out',
    approvedAnswerMarkdown: `## Why Is This Button Disabled for Me?

A disabled (greyed-out) button usually means one of these:

### 1. Permission Restriction
Your role doesn't have the required permission for this action. OppsEra uses role-based access control (RBAC) with 6 roles: Owner, Manager, Supervisor, Cashier, Server, Staff.

**How to check:** Ask the assistant "What permissions do I need for this action?" or check with your manager.

### 2. Prerequisite Not Met
The action requires a prior step to be completed first. Examples:
- **"Send to KDS"** is disabled until the order has items
- **"Close Register"** is disabled until all open tabs are settled
- **"Run Payroll"** is disabled until the pay period is finalized

### 3. Status Conflict
The record is in a state that doesn't allow this action. Examples:
- A **voided** order can't be refunded
- An **archived** item can't be added to an order
- A **closed** register can't accept payments

### 4. Module Not Enabled
The feature requires a module that isn't enabled for your location or tenant.

### What to Do
- Tell the assistant which button and which page — it can diagnose the specific cause
- If it's a permission issue, your Owner or Manager can adjust your role in Settings → Users`,
  },

  // ── 6. Difference between voiding, refunding, and crediting ──
  {
    slug: 'meta-void-refund-credit-difference',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'difference between void refund credit|void vs refund|refund vs credit|voiding vs refunding|when to void|when to refund|when to credit|void refund credit explained',
    approvedAnswerMarkdown: `## What's the Difference Between Voiding, Refunding, and Crediting?

### Void
- **When:** Before the order is settled/closed (same session)
- **What happens:** The order is cancelled as if it never happened
- **Financial impact:** No charge is processed; no GL entry
- **Inventory:** Items are returned to stock immediately
- **Use case:** Customer changed their mind, wrong order entered

### Refund
- **When:** After the order is settled/closed
- **What happens:** Money is returned to the original payment method
- **Financial impact:** A negative transaction is recorded; GL entries reverse the original
- **Inventory:** Items are returned to stock (if inventory tracking is on)
- **Use case:** Customer returns a product, wrong item was charged

### Credit (Store Credit / Account Credit)
- **When:** Any time, often as an alternative to a cash refund
- **What happens:** A credit balance is added to the customer's account
- **Financial impact:** Creates a liability on the books (you owe the customer)
- **Inventory:** Items may or may not be returned depending on the situation
- **Use case:** Customer wants future credit instead of cash back, gift card balance adjustment

### Quick Decision Guide
| Situation | Action |
|---|---|
| Order not yet paid | **Void** |
| Order paid, customer wants money back | **Refund** |
| Order paid, customer wants future credit | **Credit** |
| Partial return | **Partial refund** or **credit** |`,
  },

  // ── 7. Fastest way to complete this workflow ──
  {
    slug: 'meta-fastest-workflow',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'fastest way to|quickest way|shortcut for|speed up this|most efficient way|streamline this|quick way to do this|how to do this faster',
    approvedAnswerMarkdown: `## Show Me the Fastest Way to Complete This Workflow

The assistant can optimize any workflow by suggesting:

### 1. Keyboard Shortcuts
Many POS and ERP actions have keyboard shortcuts. Ask "What shortcuts are available on this page?" for a list.

### 2. Bulk Actions
Instead of editing items one at a time:
- **Catalog**: Use bulk price update, bulk category assignment
- **Inventory**: Use bulk stock adjustment or import via CSV
- **Users**: Assign permissions by role instead of per-user
- **Answer Cards**: Use bulk status change in the admin panel

### 3. Skip Optional Steps
The assistant will tell you which fields are required vs. optional, so you can fill in only what's needed now and come back later.

### 4. Templates & Duplication
- Duplicate an existing item and modify it instead of creating from scratch
- Use category defaults to pre-fill common fields

### 5. Smart Navigation
Ask the assistant "Take me to [goal]" and it will give you the shortest navigation path.

### Tips
- Describe your end goal, not just the current step — the assistant might suggest a completely different approach
- Ask "Can you give me the short version?" for condensed instructions`,
  },

  // ── 8. Where should I start first? ──
  {
    slug: 'meta-where-to-start',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'where should I start|I\'m new here|new user|first time|getting started|beginner|onboarding|what should I do first|new to this system',
    approvedAnswerMarkdown: `## I'm New Here — Where Should I Start?

Welcome! Here's a guided path based on your role:

### If You're an Owner or Manager
1. **Dashboard** — Get an overview of your business at a glance
2. **Settings → General** — Review your business profile and locations
3. **Settings → Users** — Check that your team has the right roles
4. **Catalog** — Browse your items to understand what's set up
5. **POS** — Try creating a test order to see the sales flow
6. **Reports** — Run a daily summary to see the reporting format

### If You're a Cashier or Server
1. **POS** — This is your main screen. Learn the order flow: add items → apply modifiers → take payment
2. **Order History** — See past orders and how to look up a receipt
3. **Register** — Understand open/close register procedures

### If You're Staff
1. **Dashboard** — See what's relevant to your role
2. Ask the assistant "What can I access with my role?" to see your available features

### General Tips
- The assistant is available on every page — tap the chat icon to ask questions
- Say "Explain this page" on any screen for a guided tour
- Ask "What are the most common mistakes new users make here?" to avoid pitfalls`,
  },

  // ── 9. Required steps before going live ──
  {
    slug: 'meta-go-live-checklist',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'required steps before go live|go live checklist|what do I need before launching|pre-launch|ready to go live|launch checklist|production ready|before we open',
    approvedAnswerMarkdown: `## What Are the Required Steps Before I Can Go Live?

### Critical (Must Complete)
- [ ] **Business profile** — Name, address, tax IDs, timezone configured
- [ ] **At least one location** — With correct address and timezone
- [ ] **Owner account** — With full permissions
- [ ] **Staff accounts** — Created with appropriate roles
- [ ] **Catalog items** — At least your core products/menu items with correct prices and tax assignments
- [ ] **Tax rates** — Configured and assigned to items
- [ ] **Payment methods** — At least one tender type enabled (cash, credit card)
- [ ] **POS terminal registered** — Device set up and tested

### Strongly Recommended
- [ ] **Test transactions** — Run at least 3 test orders end-to-end (order → pay → receipt)
- [ ] **Register open/close** — Test the full cash management cycle
- [ ] **Refund test** — Process a test refund to verify the flow
- [ ] **Reports** — Run a daily summary to verify data is flowing
- [ ] **Staff training** — Each user has logged in and completed a test transaction

### Module-Specific
- **F&B**: Service areas, course types, modifier groups, KDS stations
- **Inventory**: Opening stock counts, reorder points
- **Accounting**: Chart of accounts, GL account mappings
- **Membership**: Tiers, pricing, benefits configured

### Ask the Assistant
"Am I missing anything for [module]?" to get a targeted checklist.`,
  },

  // ── 10. What does this warning message mean? ──
  {
    slug: 'meta-warning-message-meaning',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what does this warning mean|warning message|error message meaning|what does this error mean|explain this message|system message meaning|alert meaning|notification meaning',
    approvedAnswerMarkdown: `## What Does This Warning Message Actually Mean?

The assistant can translate any system message into plain language. Here's how common warning categories work:

### Validation Warnings (Yellow)
These prevent you from saving until fixed:
- **"Required field"** — You must fill in this field before saving
- **"Invalid format"** — The value doesn't match the expected pattern (e.g., email, phone)
- **"Duplicate entry"** — This value already exists and must be unique (e.g., item SKU, user email)

### Business Rule Warnings (Orange)
These warn but may allow you to proceed:
- **"Price is zero"** — You're saving an item with no price. Intentional for comp items, a mistake for others.
- **"Inventory below reorder point"** — Stock is low; consider reordering
- **"Register not balanced"** — Cash count doesn't match expected amount

### System Errors (Red)
These indicate something went wrong:
- **"Connection lost"** — The device lost internet. Actions will retry when reconnected.
- **"Permission denied"** — Your role can't perform this action
- **"Conflict"** — Someone else edited this record while you were working on it. Refresh and try again.

### How to Use the Assistant
Copy or describe the exact message, and the assistant will:
1. Explain what caused it
2. Tell you how to fix it
3. Indicate whether it's blocking or informational`,
  },

  // ── 11. Why did the assistant escalate? ──
  {
    slug: 'meta-why-escalated',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'why did the assistant escalate|why escalate|escalated instead of answering|why can\'t you answer|assistant escalation|referred to support|contact support instead',
    approvedAnswerMarkdown: `## Why Did the Assistant Escalate Instead of Answering Directly?

The assistant escalates when it determines that answering directly could be incorrect or harmful. Here's why:

### Low Confidence
The assistant grades its own confidence on every answer. If confidence is below the threshold, it escalates rather than risk giving you wrong information. This happens when:
- The question involves tenant-specific configuration the assistant can't see
- The question combines multiple modules in an unusual way
- The answer depends on data the assistant doesn't have access to

### Out of Scope
Some questions require human judgment or access:
- **Account-specific billing or subscription questions**
- **Data correction or deletion requests** (the assistant is read-only)
- **Legal, compliance, or regulatory questions**
- **Hardware or network troubleshooting**
- **Custom integration or API questions**

### Safety Guardrails
The assistant won't provide answers that could:
- Expose sensitive data (passwords, API keys, PII)
- Guide destructive actions without proper authorization
- Override business rules or security controls

### What You Can Do
- Rephrase your question with more context — sometimes specificity raises confidence
- Ask "What information do you need from me to answer this?"
- If escalated, include the assistant's suggested details in your support ticket`,
  },

  // ── 12. Explain this page in plain English ──
  {
    slug: 'meta-explain-plain-english',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'explain in plain English|simple terms|plain language|explain simply|layman\'s terms|non-technical|explain like I\'m|ELI5|dumb it down',
    approvedAnswerMarkdown: `## Can You Explain This Page in Plain English?

Yes! When you ask for a plain-English explanation, the assistant will:

### What Changes
- **No jargon** — Terms like "GL posting," "idempotent," or "RLS" are replaced with everyday language
- **Analogies** — Complex concepts are compared to familiar things
- **Shorter sentences** — Key points first, details after
- **Action-focused** — Instead of explaining what the system does technically, it tells you what *you* can do

### Example
**Technical:** "This screen displays the GL journal entries for the selected fiscal period with drill-down to source transactions."

**Plain English:** "This page shows where your money went during the time period you selected. You can click on any line to see the original sale or expense that created it."

### How to Ask
- "Explain this page in plain English"
- "What does this page do, simply?"
- "Can you explain this to someone who isn't technical?"

### Role-Adjusted Explanations
You can also ask for explanations targeted at a specific role:
- "Explain this to a front-desk user" → focuses on daily tasks
- "Explain this to an accounting manager" → focuses on financial impact
- "Explain this to a new employee" → focuses on basics`,
  },

  // ── 13. Which role usually handles this? ──
  {
    slug: 'meta-which-role-handles',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'which role handles this|who usually does this|whose job is this|which role|who is responsible|who should do this|what role for this',
    approvedAnswerMarkdown: `## Which Role Usually Handles This Function?

OppsEra has 6 roles, each with typical responsibilities:

### Role Responsibilities

| Role | Typical Functions |
|---|---|
| **Owner** | Full system access. Business settings, user management, financial reports, GL configuration. |
| **Manager** | Day-to-day operations. Staff scheduling, inventory management, reporting, refund approval. |
| **Supervisor** | Shift-level oversight. Register management, void/refund within limits, staff oversight. |
| **Cashier** | Transaction processing. POS sales, payment collection, register open/close. |
| **Server** | Order taking (F&B). Table management, order entry, course firing, tab management. |
| **Staff** | Basic access. View-only for most areas, task-specific functions as assigned. |

### How Permissions Map
Each action requires a specific permission (e.g., \`orders.refund\`, \`catalog.write\`). Roles are pre-configured with sensible defaults, but Owners can customize.

### Ask the Assistant
- "What permissions do I need for [action]?" — to check your access
- "What can a [role] do?" — to see all permissions for a role
- "Who can approve refunds at my location?" — for role-specific questions`,
  },

  // ── 14. What permissions do I need? ──
  {
    slug: 'meta-permissions-needed',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what permissions do I need|permission required|access needed|permission for this|don\'t have permission|need permission|access denied|not authorized',
    approvedAnswerMarkdown: `## What Permissions Do I Need for This Action?

### How to Check
Tell the assistant which action you're trying to perform, and it will tell you:
1. The **exact permission** required (e.g., \`orders.refund\`, \`catalog.write\`)
2. Which **roles** have this permission by default
3. Whether your current role likely has it

### Common Permission Requirements

| Action | Permission | Default Roles |
|---|---|---|
| Process a sale | \`orders.create\` | Owner, Manager, Supervisor, Cashier |
| Issue a refund | \`orders.refund\` | Owner, Manager, Supervisor |
| Void an order | \`orders.void\` | Owner, Manager, Supervisor |
| Edit catalog items | \`catalog.write\` | Owner, Manager |
| View reports | \`reporting.read\` | Owner, Manager, Supervisor |
| Manage users | \`users.write\` | Owner |
| Access accounting | \`accounting.*\` | Owner, Manager |
| Manage KDS settings | \`kds.settings\` | Owner, Manager |

### If You're Blocked
1. Note the action you tried and the error message
2. Ask your Owner or Manager to check your role in **Settings → Users**
3. They can either change your role or add a specific permission override

### Important
Permission changes take effect immediately, but you may need to refresh the page or re-login for them to apply.`,
  },

  // ── 15. Bug or configuration? ──
  {
    slug: 'meta-bug-or-config',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'is this a bug or configuration|bug or setting|something wrong or just settings|bug vs config|is this broken|is this a bug|misconfigured or broken',
    approvedAnswerMarkdown: `## How Do I Know Whether This Is a Bug or Just Configuration?

### Signs It's Configuration
- The feature works for some users but not others → **permission or role issue**
- The feature works at one location but not another → **location-specific setting**
- The behavior changed after someone edited settings → **configuration change**
- The assistant can explain what's happening and why → **working as designed**
- Other similar features work fine → **this specific feature needs setup**

### Signs It's a Bug
- The feature was working yesterday and nothing changed → **regression**
- You get a system error (red message, "something went wrong") → **application error**
- The data on screen is clearly wrong (negative quantities, impossible dates) → **data issue**
- The same action sometimes works and sometimes doesn't → **intermittent bug**
- The assistant can't explain the behavior → **unexpected state**

### What to Do
1. **Check configuration first** — Ask the assistant to explain the expected behavior
2. **Try a different browser/device** — Rules out client-side issues
3. **Ask a colleague** — If they see the same thing, it's more likely a bug
4. **Check the audit log** — See if a recent setting change caused the behavior

### When to Report
If configuration checks come back clean and the behavior is clearly wrong, include:
- What you expected vs. what happened
- Steps to reproduce
- Screenshots if possible
- The assistant's response when you asked about it`,
  },

  // ── 16. Step-by-step instead of summary ──
  {
    slug: 'meta-step-by-step',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'step by step|step-by-step|detailed instructions|walk me through|one step at a time|detailed steps|don\'t summarize|more detail',
    approvedAnswerMarkdown: `## Can You Give Me Step-by-Step Instructions Instead of a Summary?

Yes! Just ask, and the assistant will switch from a summary to a numbered walkthrough.

### How to Ask
- "Give me step-by-step instructions for [task]"
- "Walk me through this one step at a time"
- "I need the detailed version, not the summary"

### What You'll Get
1. **Numbered steps** — Each action as a separate, clear instruction
2. **Navigation paths** — Exactly where to click (e.g., "Go to Settings → Users → click 'Add User'")
3. **Expected results** — What you should see after each step
4. **Decision points** — Where you need to choose an option, with guidance on which to pick

### Tips
- If you get stuck on a specific step, say "I'm stuck on step 3" and the assistant will elaborate
- Ask "What should I see after this step?" to verify you're on track
- You can ask for step-by-step on any topic — setup, troubleshooting, daily procedures, reporting`,
  },

  // ── 17. What information do you need to troubleshoot? ──
  {
    slug: 'meta-info-needed-troubleshoot',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what information do you need|what do you need from me|what should I tell you|help you troubleshoot|what details|info for troubleshooting|how can I help you help me',
    approvedAnswerMarkdown: `## What Information Do You Need from Me to Troubleshoot This?

To give you the best answer, the assistant typically needs:

### Always Helpful
1. **Which page/screen** you're on (the assistant can often detect this automatically)
2. **What you were trying to do** — the goal, not just the symptom
3. **What happened instead** — exact error messages, unexpected behavior
4. **When it started** — "always," "since yesterday," "after I changed X"

### For Specific Issues

| Issue Type | Key Details |
|---|---|
| **Permission error** | Your role, the action you tried |
| **Missing data** | Which record, which fields are wrong/empty |
| **Wrong calculation** | Expected vs. actual number, the specific item/order |
| **KDS problem** | Station name, order number, what you see on screen |
| **Payment issue** | Payment method, amount, error message |
| **Report mismatch** | Which report, date range, what you expected |

### You Don't Need
- Technical logs or database details — the assistant handles that
- Screenshots (the assistant can't view images, but describing what you see works well)
- Your password or sensitive credentials — never share these

### Pro Tip
Start with: "I'm on [page], trying to [goal], but [symptom]." That's usually enough for the assistant to diagnose.`,
  },

  // ── 18. Did the system save my changes? ──
  {
    slug: 'meta-changes-saved',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'did it save|were my changes saved|how do I know if saved|save confirmation|did my changes go through|system saved|auto save|changes persisted',
    approvedAnswerMarkdown: `## How Can I Tell Whether the System Already Saved My Changes?

### Save Indicators
OppsEra uses several cues to confirm saves:

1. **Success toast** — A green notification appears briefly at the top or bottom of the screen confirming the action (e.g., "Item saved successfully")
2. **Page redirect** — After creating a new record, you're usually redirected to the detail or list page
3. **Updated timestamp** — The "Last updated" field on the record changes to the current time
4. **No unsaved indicator** — Some forms show a dot or asterisk when there are unsaved changes; it disappears after saving

### When Changes Are NOT Saved
- You navigated away without clicking **Save** — most forms require explicit save
- A validation error appeared (red text) — fix the error and try again
- The page showed "Connection lost" — your changes may not have reached the server
- You see a "Conflict" error — someone else edited the same record

### Auto-Save vs. Manual Save
- **Most forms**: Manual save (click the Save button)
- **POS orders**: Items are added to the order in real time (auto-save to the open order)
- **KDS actions** (bump, clear): Immediate — no save button needed

### When in Doubt
- Refresh the page — if your changes appear, they were saved
- Check the audit log (if available) for the record's change history`,
  },

  // ── 19. What to check first when something looks wrong ──
  {
    slug: 'meta-check-first-looks-wrong',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what should I check first|something looks wrong|looks off|doesn\'t look right|first thing to check|quick diagnostic|initial troubleshooting|where to start debugging',
    approvedAnswerMarkdown: `## What Should I Check First When Something "Looks Wrong"?

### Quick Diagnostic Checklist (in order)
1. **Refresh the page** — Stale data is the #1 cause of "looks wrong"
2. **Check the date/time filter** — Many screens default to "today" — are you looking at the right period?
3. **Check the location selector** — You may be viewing a different location's data
4. **Check your role** — Some data is filtered by your permissions
5. **Check for recent changes** — Ask a colleague or check the audit log for recent edits

### Common "Looks Wrong" Scenarios

| Symptom | Likely Cause |
|---|---|
| Numbers don't add up | Date filter or location mismatch |
| Data is missing | Permission filter or wrong date range |
| Feature disappeared | Role change or module was disabled |
| Prices are wrong | Catalog was updated but POS cache needs refresh |
| Report is empty | No data for the selected filters |

### When to Escalate
If you've checked all five and it still looks wrong:
1. Note what you expected vs. what you see
2. Take a screenshot or describe the screen
3. Ask the assistant — it may identify a known issue or configuration gap
4. If the assistant escalates, contact support with the details gathered`,
  },

  // ── 20. Next three things I should do ──
  {
    slug: 'meta-next-three-things',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'next three things|what should I do next|next steps|what\'s next|what comes after this|what now|suggest next actions|to-do list',
    approvedAnswerMarkdown: `## Can You Summarize the Next Three Things I Should Do?

Yes! The assistant can suggest your next actions based on:

### Context It Uses
1. **The page you're on** — what logical next steps follow from this screen
2. **Your conversation history** — what you've been working on
3. **Your role** — actions appropriate to your permission level

### How to Ask
- "What should I do next?" — general guidance based on context
- "What are the next three steps for [task]?" — specific workflow continuation
- "I just finished [action] — what now?" — sequential workflow guidance

### Example Responses
**After setting up your first location:**
1. Add staff accounts and assign roles in **Settings → Users**
2. Create your catalog items in **Catalog → Items**
3. Test a POS transaction to verify the payment flow

**After processing a refund:**
1. Verify the refund appears in **Order History** with "Refunded" status
2. Check the register balance to confirm it reflects the refund
3. If needed, note the reason in the order's comment field for your records

### Tips
- The more context you give, the better the suggestions
- Ask "Why these three?" if you want to understand the reasoning
- Say "I already did #2" to get an updated list`,
  },

  // ── 21. Which report should I run? ──
  {
    slug: 'meta-which-report',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'which report should I run|what report for this|best report for|report to answer|find the right report|reporting question|which report shows',
    approvedAnswerMarkdown: `## Which Report Should I Run for This Question?

### Common Questions → Reports

| Question | Report | Where |
|---|---|---|
| How much did we sell today? | Daily Sales Summary | Reporting → Daily Summary |
| What are our top-selling items? | Item Sales Report | Reporting → Item Sales |
| How much cash should be in the register? | Register Report | POS → Register → Close/Report |
| What's our labor cost? | Labor Report | Reporting → Labor |
| Which items are running low? | Inventory Status | Inventory → Stock Levels |
| What were our refunds this week? | Refund Report | Reporting → Refunds |
| How is this month vs. last month? | Period Comparison | Reporting → Comparison |
| What's our revenue by category? | Category Sales | Reporting → Category Sales |
| Which payment methods are customers using? | Tender Report | Reporting → Tender Summary |

### Tips
- Most reports have **date range** and **location** filters — set these first
- Ask the assistant "What does the [report name] report show?" for a detailed explanation
- If no standard report answers your question, describe what you need and the assistant will suggest the closest match or combination`,
  },

  // ── 22. Safest way to fix without breaking anything ──
  {
    slug: 'meta-safe-fix',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'safest way to fix|without breaking anything|safe to change|will this break|risk of changing|safe fix|non-destructive|careful change|low risk fix',
    approvedAnswerMarkdown: `## What's the Safest Way to Fix This Without Breaking Anything?

### General Safety Principles
1. **Understand before changing** — Ask the assistant to explain what the current setting does and what depends on it
2. **One change at a time** — Make a single change, verify it worked, then move to the next
3. **Test with a small scope** — If possible, test the change on one item/order before applying broadly
4. **Know how to undo** — Ask "Can I undo this?" before making the change
5. **Avoid peak hours** — Make configuration changes during slow periods

### Safe vs. Risky Changes

| Safe (Low Risk) | Risky (High Risk) |
|---|---|
| Editing an item name or description | Changing a price on a high-volume item |
| Adding a new user | Changing an existing user's role |
| Adding a new category | Merging or deleting categories |
| Running a report | Changing report date defaults |
| Adding a KDS station | Removing or reassigning a KDS station |

### The Assistant's Role
When you describe what you want to fix, the assistant will:
1. Confirm what the change will affect
2. Flag any downstream impacts
3. Suggest the least-risky approach
4. Recommend a verification step after the change

### When in Doubt
Ask: "If I change [this], what else will be affected?" The assistant will trace the dependencies.`,
  },

  // ── 23. Explain to a front-desk user ──
  {
    slug: 'meta-explain-front-desk',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'explain to a front desk|front desk user|receptionist|non-admin explanation|for a front desk|simple explanation for staff|basic user explanation',
    approvedAnswerMarkdown: `## Can You Explain This to a Front-Desk User Instead of an Admin?

Yes! When you ask for a front-desk explanation, the assistant adjusts:

### What Changes
- **Focus shifts to daily tasks** — How this affects check-in, check-out, payments, and customer interactions
- **Admin details are hidden** — No GL accounts, system configuration, or technical architecture
- **Action-oriented** — "Click here, then do this" instead of "this feature integrates with..."
- **Customer-facing context** — How to explain things to customers if they ask

### Example
**Admin version:** "The tender reconciliation report compares expected vs. actual drawer amounts, posting variances to GL account 1020."

**Front-desk version:** "When you close the register, the system checks if the cash in the drawer matches what it expects. If it doesn't match, enter the actual amount and a reason — your manager will review it."

### How to Ask
- "Explain this like I'm a front-desk user"
- "How would I explain this to my receptionist?"
- "Give me the cashier version"

### Other Role-Adjusted Explanations
- "Explain this to a server" → food & beverage workflow focus
- "Explain this to a manager" → oversight and reporting focus
- "Explain this to an accounting manager" → financial and GL focus`,
  },

  // ── 24. Explain to an accounting manager ──
  {
    slug: 'meta-explain-accounting',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'explain to accounting|accounting manager|financial perspective|bookkeeper|GL impact|accounting explanation|finance team|controller explanation',
    approvedAnswerMarkdown: `## Can You Explain This to an Accounting Manager Instead of a Cashier?

Yes! When you ask for an accounting-focused explanation, the assistant adjusts:

### What Changes
- **Focus shifts to financial impact** — GL entries, account mappings, period effects
- **Operational details are minimized** — Less about button clicks, more about what flows to the books
- **Terminology matches accounting** — Debits/credits, journal entries, accruals, reconciliation
- **Compliance context** — Tax implications, audit trail, reporting period effects

### Example
**Cashier version:** "When you refund an order, the customer gets their money back and the items go back to inventory."

**Accounting version:** "A refund reverses the original GL journal entry — debiting the revenue account and crediting the payment liability. If the original transaction crossed a period boundary, the reversal posts to the current period. Inventory is adjusted at original cost via a contra-COGS entry. The refund appears in the tender reconciliation report and is included in settlement batches."

### How to Ask
- "Explain this from an accounting perspective"
- "What's the GL impact of this?"
- "How does this affect the books?"
- "Explain this for the finance team"`,
  },

  // ── 25. What follow-up question should I ask? ──
  {
    slug: 'meta-follow-up-question',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'follow-up question|what should I ask next|what else should I ask|suggested questions|next question|what to ask|dig deeper',
    approvedAnswerMarkdown: `## What Follow-Up Question Should I Ask Next?

The assistant includes suggested follow-up questions at the end of most answers. These are chosen based on:

### How Follow-Ups Are Selected
1. **Logical next step** — What you'd naturally need to know after the current answer
2. **Common gaps** — Questions that people in similar situations usually miss
3. **Deeper detail** — Options to drill into specific parts of the answer
4. **Related topics** — Adjacent features or workflows that might be relevant

### Examples
After asking "How do I process a refund?", suggested follow-ups might be:
- "What permissions do I need to process a refund?"
- "How does a refund affect the register balance?"
- "Can I do a partial refund?"
- "What's the difference between a refund and a void?"

### Tips
- You don't have to use the suggested follow-ups — ask anything
- If no follow-ups are shown, try: "What else should I know about this?"
- Asking "What would a manager check here that a staff user would miss?" often surfaces important details
- Follow-up questions use the context from your conversation, so answers build on each other`,
  },

  // ── 26. Who last changed this? ──
  {
    slug: 'meta-who-changed-this',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'who last changed this|who edited this|last modified by|change history|audit log|who updated this|who modified this|recent changes to this record',
    approvedAnswerMarkdown: `## Where Can I See Who Last Changed This?

### Audit Trail
OppsEra records changes to important records in the audit log. To check:

1. **On the record itself** — Look for "Last updated" timestamp and "Updated by" fields
2. **Audit log** — Available in **Settings → Audit Log** for Owners and Managers
3. **Ask the assistant** — "Who last changed [record type] [identifier]?" and the assistant will check if audit data is available

### What's Tracked
- User who made the change
- Timestamp of the change
- What was changed (field-level for some records)
- Previous and new values (where available)

### What's Not Tracked
- Viewed-only access (reading a page doesn't create an audit entry)
- System-generated changes (e.g., automatic inventory adjustments) show as "system"
- Bulk imports show the user who triggered the import, not individual record changes

### Common Use Cases
| Question | Where to Look |
|---|---|
| Who changed this item's price? | Catalog → Item detail → History tab |
| Who voided this order? | Order History → Order detail → audit section |
| Who changed this user's role? | Settings → Audit Log → filter by Users |
| Who edited the tax rate? | Settings → Audit Log → filter by Tax |`,
  },

  // ── 27. Different answers in different parts of the system ──
  {
    slug: 'meta-different-answers-different-places',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'different answers|different numbers|data doesn\'t match|inconsistent data|discrepancy between|numbers don\'t match|conflicting information|mismatch between screens',
    approvedAnswerMarkdown: `## Why Am I Seeing Different Answers in Different Parts of the System?

### Common Reasons for Discrepancies

1. **Different time windows** — One report shows "today" while another shows "last 24 hours." Check the date/time filters on both screens.

2. **Different locations** — One screen may be filtered to a single location while another shows all locations. Check the location selector.

3. **Dollars vs. cents** — Catalog and accounting use dollars (e.g., $12.99). Orders and payments use cents internally (1299). Displays should convert, but raw data may differ.

4. **Real-time vs. batch** — POS data updates in real time. Reports and accounting summaries may update on a schedule (e.g., GL postings batch periodically).

5. **Tax-inclusive vs. exclusive** — Some screens show prices before tax, others after. Check whether the displayed total includes tax.

6. **Pending vs. settled** — Payment screens may show authorized (pending) amounts, while reports show settled (final) amounts. These can differ due to tips, adjustments, or voids.

### How to Investigate
1. Note the exact numbers from both screens
2. Check the filters (date, location, status) on each
3. Ask the assistant: "Why does [Screen A] show X but [Screen B] shows Y?"
4. The assistant will explain the calculation methodology for each screen

### When It's a Real Problem
If the filters match and the numbers still differ, it may indicate a sync issue. Contact support with both values and screenshots.`,
  },

  // ── 28. What varies by location or role? ──
  {
    slug: 'meta-varies-by-location-role',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'varies by location|depends on role|location specific|role specific|different per location|different by role|location dependent|role dependent',
    approvedAnswerMarkdown: `## What Parts of This Answer Depend on My Location or Role?

### Location-Dependent Features
These can differ by location:
- **Tax rates** — Different jurisdictions have different tax rules
- **Catalog availability** — Items can be enabled/disabled per location
- **KDS stations** — Each location has its own station configuration
- **Register settings** — Cash management rules may vary
- **Operating hours** — Affect report boundaries and availability
- **Payment methods** — Some tenders may only be accepted at certain locations

### Role-Dependent Features
These change based on your role:
- **Menu visibility** — Some navigation items are hidden for lower roles
- **Action availability** — Buttons are disabled if you lack permission
- **Data scope** — Some roles see all locations, others only their assigned location
- **Report access** — Financial reports may be restricted to Manager and above
- **Settings access** — Configuration screens are typically Owner/Manager only

### How the Assistant Handles This
- The assistant flags when an answer **may vary** by saying "this may vary by account" or "depending on your configuration"
- Ask "Does this apply to my location?" for location-specific verification
- Ask "Can my role do this?" for permission-specific verification

### Important
The assistant provides general guidance based on default configurations. Your specific tenant may have customized roles or location settings.`,
  },

  // ── 29. What varies by tenant configuration? ──
  {
    slug: 'meta-varies-by-tenant',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'varies by tenant|tenant configuration|account specific|my account|tenant specific|configuration dependent|custom setup|tenant settings',
    approvedAnswerMarkdown: `## Can You Tell Me What Varies by Tenant Configuration Here?

### What Is Tenant-Specific
Each OppsEra tenant (business account) can customize:

1. **Enabled Modules** — Which modules are active (F&B, KDS, Inventory, Spa, Golf, etc.)
2. **Role Permissions** — Custom permission overrides beyond the default role templates
3. **Catalog Structure** — Departments, categories, items, prices, and tax assignments
4. **Location Setup** — Number of locations, timezone, address, features per location
5. **Payment Configuration** — Which tenders are accepted, merchant services setup
6. **Tax Rules** — Tax rates, tax-inclusive pricing, tax exemptions
7. **Business Type** — Restaurant, retail, golf, hybrid — affects which features are prominent
8. **Branding** — Business name, receipt headers, logo

### What Is Universal (Same for All Tenants)
- The RBAC role hierarchy (6 roles, same structure)
- The module architecture and available features
- The POS workflow (order → payment → settlement)
- Report formats and calculation methods
- System-wide security and data isolation (RLS)

### Why the Assistant Says "May Vary"
When the assistant includes this caveat, it means the answer is correct for the default configuration but your business might have customized the behavior. The assistant can't always see your specific tenant settings, so it flags this to be transparent.`,
  },

  // ── 30. Confidence level on this answer ──
  {
    slug: 'meta-confidence-level',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'confidence level|how confident|how sure|accuracy of this answer|reliability|trust this answer|is this accurate|how certain',
    approvedAnswerMarkdown: `## What's the Confidence Level on This Answer?

### How Confidence Works
The assistant self-grades every answer with a confidence level:

| Level | Meaning |
|---|---|
| **High** | Answer is grounded in documented behavior, code, or approved answer cards. Very likely correct. |
| **Medium** | Answer is based on general system knowledge but may not account for your specific configuration. Probably correct. |
| **Low** | Answer is an educated guess or involves areas the assistant has limited knowledge about. Verify before acting. |
| **Escalated** | Confidence is too low to provide a useful answer. The assistant recommends contacting support. |

### What Affects Confidence
- **Source tier** — Answers from approved answer cards (T3) or code documentation (T1/T2) are highest confidence
- **Specificity** — General questions get higher confidence; account-specific questions get lower
- **Complexity** — Simple, single-topic questions score higher than multi-module questions
- **Recency** — The assistant flags if its knowledge might be outdated

### How to Raise Confidence
- Provide more context (which page, which module, what you're seeing)
- Ask about one thing at a time instead of combining topics
- Rephrase vague questions to be specific

### Transparency
You can always ask "How confident are you in this answer?" and the assistant will tell you. If the answer affects important business decisions, verify with your manager or support team.`,
  },

  // ── 31. When to stop troubleshooting and contact support ──
  {
    slug: 'meta-when-contact-support',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'when to contact support|stop troubleshooting|give up|need human help|contact support|call support|support ticket|need real help|escalate to human',
    approvedAnswerMarkdown: `## When Should I Stop Troubleshooting and Contact Support?

### Contact Support When:
1. **The assistant escalated** — It already determined this needs human attention
2. **You've tried 3+ things and nothing worked** — Diminishing returns on self-troubleshooting
3. **Data looks corrupted** — Numbers that are clearly wrong, records that shouldn't exist
4. **System error persists** — Red error messages that don't resolve after refresh and retry
5. **It's affecting customers** — Any issue that blocks sales, payments, or check-ins
6. **Security concern** — Unexpected access, unknown users, suspicious activity
7. **It's time-sensitive** — If you're troubleshooting during peak hours, get help fast

### Don't Spend More Than 10 Minutes If:
- The issue is blocking revenue (POS can't process payments)
- Multiple users are affected
- The error is a system/server error (not a user error)

### What to Include in a Support Ticket
1. **What you were trying to do**
2. **What happened instead** (exact error message if any)
3. **Steps to reproduce** (what to click to see the issue)
4. **What you already tried** (so support doesn't repeat your steps)
5. **Your location and role** (helps narrow down the issue)
6. **When it started** (helps identify if it's related to a recent change)
7. **The assistant's response** (if you asked the assistant first, include what it said)`,
  },

  // ── 32. Details for a support ticket ──
  {
    slug: 'meta-support-ticket-details',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what to include in support ticket|support ticket details|report a problem|file a ticket|bug report details|issue report|how to report',
    approvedAnswerMarkdown: `## What Details Should I Include in a Support Ticket for This Issue?

### Required Information
1. **Summary** — One sentence describing the problem
2. **Steps to reproduce** — Numbered steps someone else can follow to see the issue
3. **Expected behavior** — What should have happened
4. **Actual behavior** — What actually happened (include exact error messages)
5. **Page/URL** — Which screen you were on

### Helpful Context
6. **Your role** — Owner, Manager, Cashier, etc.
7. **Location** — Which location was selected
8. **Timestamp** — When it happened (include timezone)
9. **Frequency** — Always, sometimes, or one-time
10. **Other users affected** — Is it just you or others too?
11. **Browser/device** — Chrome, Safari, iPad, etc.
12. **What you already tried** — Refresh, different browser, asked the assistant

### Template
> **Issue:** [One-sentence summary]
> **Page:** [URL or screen name]
> **Steps:** 1. ... 2. ... 3. ...
> **Expected:** [What should happen]
> **Actual:** [What happened instead]
> **Error message:** [Exact text if any]
> **Frequency:** [Always / Sometimes / Once]
> **Role:** [Your role] | **Location:** [Location name]
> **Already tried:** [What you attempted]

### Pro Tip
If you asked the assistant before filing the ticket, mention its response. This tells support what's already been ruled out.`,
  },

  // ── 33. Difference between two modules ──
  {
    slug: 'meta-module-difference',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'difference between modules|compare modules|module vs module|how are these modules different|what\'s the difference between|which module for|module comparison',
    approvedAnswerMarkdown: `## Can You Help Me Understand the Difference Between These Two Modules?

Yes! Tell the assistant which two modules you're comparing, and it will explain:

### What You'll Get
1. **Purpose** — What each module is designed for
2. **Key features** — Main capabilities of each
3. **Overlap** — Where they share functionality (if any)
4. **Data flow** — How they interact or share data via events
5. **When to use which** — Practical guidance on which module to use for specific tasks

### Common Comparisons

| Comparison | Key Difference |
|---|---|
| **Orders vs. POS** | Orders is the data/backend module; POS is the user-facing sales interface |
| **Catalog vs. Inventory** | Catalog manages what you sell (items, prices); Inventory manages how much you have (stock levels) |
| **AP vs. AR** | Accounts Payable = what you owe vendors; Accounts Receivable = what customers owe you |
| **F&B vs. KDS** | F&B manages the dining service flow (tables, courses); KDS manages the kitchen display and ticket routing |
| **Reporting vs. Accounting** | Reporting shows operational metrics; Accounting shows financial journal entries and GL |

### How to Ask
- "What's the difference between [Module A] and [Module B]?"
- "Should I use [Module A] or [Module B] for [task]?"
- "How do [Module A] and [Module B] work together?"`,
  },

  // ── 34. Can the assistant solve this, or does it need a human? ──
  {
    slug: 'meta-assistant-vs-human',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'can the assistant solve|does this need a human|assistant limitations|what can the assistant do|assistant capabilities|can you fix this|can AI handle this',
    approvedAnswerMarkdown: `## Is This Something the Assistant Can Solve, or Does It Need a Human?

### The Assistant CAN:
- **Explain** any page, feature, field, or workflow
- **Guide** you step-by-step through any supported workflow
- **Diagnose** common issues by asking targeted questions
- **Recommend** which screen, report, or action to use
- **Translate** technical messages into plain language
- **Compare** modules, features, or approaches
- **Train** by walking new users through procedures

### The Assistant CANNOT:
- **Make changes** to your data (it's read-only — no editing, creating, or deleting records)
- **Access external systems** (email, payment processor, hardware)
- **View images or screenshots** (describe what you see instead)
- **Override permissions** or security controls
- **Guarantee accuracy** for account-specific configurations it can't see
- **Handle billing, legal, or compliance** questions

### Grey Area (Assistant Tries, May Escalate)
- Complex multi-module troubleshooting
- Questions about very specific tenant configurations
- Edge cases not covered in training data
- Questions requiring real-time data the assistant can't query

### Rule of Thumb
If the question is "how?" or "what?" → the assistant can likely help.
If the question is "please do this for me" → a human is needed.`,
  },

  // ── 35. What does the assistant know from my current screen? ──
  {
    slug: 'meta-assistant-screen-context',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what does the assistant know|what can you see|what context do you have|what do you know about my screen|screen context|page context|current screen info',
    approvedAnswerMarkdown: `## What Does the Assistant Know from the Screen I'm On Right Now?

### What the Assistant Can See
1. **Your current URL/route** — Which page you're on (e.g., /pos, /catalog/items, /kds)
2. **Route manifest data** — Pre-built descriptions of every page's purpose, features, and actions
3. **Module context** — Which module the page belongs to and its capabilities
4. **Your role** — Your permission level (affects what guidance is given)
5. **Conversation history** — Everything you've discussed in this chat session

### What the Assistant CANNOT See
- **Your screen content** — It can't read the actual data displayed (item names, order totals, error messages on screen)
- **Form field values** — It doesn't know what you've typed into fields
- **UI state** — Whether dropdowns are open, checkboxes are checked, or modals are showing
- **Other browser tabs** — Only the current page context

### How to Bridge the Gap
Since the assistant can't see your screen, help it by sharing:
- Error messages (copy-paste the text)
- Field names you're asking about
- What buttons or options you see
- Specific values that look wrong

### Pro Tip
Start questions with context: "I'm on the Catalog Items page and I see an item with price $0.00 — is that normal?" This gives the assistant maximum context to work with.`,
  },

  // ── 36. Guide me using visible buttons ──
  {
    slug: 'meta-guide-visible-buttons',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'guide me using buttons|visible buttons|what buttons are on this page|walk me through the buttons|use the buttons|click-by-click|which button|button guide',
    approvedAnswerMarkdown: `## Can You Guide Me Using the Visible Buttons on This Page?

Yes! The assistant knows the standard button layout for each page through the route and action manifests.

### How It Works
1. Tell the assistant which page you're on (it usually detects this automatically)
2. The assistant will describe the **standard buttons and actions** available on that page
3. It will guide you through which buttons to click in which order

### Common Page Layouts

**POS Screen:**
- Item grid (tap to add) → Cart panel → **Checkout** → Payment type → **Complete Sale**
- **Hold** (save for later), **Void** (cancel), **Discount** (apply to item/order)

**Catalog Item Editor:**
- Field form → **Save** (create/update), **Delete** (remove), **Duplicate** (copy)

**KDS Station:**
- Ticket cards → **Bump** (mark done), **Recall** (bring back), **Priority** (flag urgent)

**Order History:**
- Order list → Click to view → **Refund**, **Reprint Receipt**, **View Details**

### If Buttons Don't Match
If the buttons the assistant describes don't match what you see, it may be because:
- Your role hides certain buttons (permission-based)
- The record is in a state that disables certain actions
- A module-specific feature is not enabled at your location

Tell the assistant what buttons you *do* see, and it will adjust its guidance.`,
  },

  // ── 37. Why can't you answer if I'm looking right at the screen? ──
  {
    slug: 'meta-why-cant-answer-looking-at-screen',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'why can\'t you answer|I\'m looking right at it|it\'s right there|can\'t you see|why don\'t you know|you should be able to see|frustrating|obvious answer',
    approvedAnswerMarkdown: `## Why Can't You Answer This If I'm Looking Right at the Screen?

This is a fair frustration. Here's why it happens:

### The Core Limitation
The assistant **cannot see your screen**. It knows which page you're on (via the URL), but it can't see:
- The actual data displayed (names, numbers, values)
- Error messages or notifications on screen
- The state of forms, checkboxes, or toggles
- What you're pointing at or highlighting

### Why This Design
- **Privacy** — Screen capture would expose sensitive business data
- **Performance** — Processing screenshots would slow responses significantly
- **Security** — The assistant operates on a read-only, text-based channel

### How to Work Around It
Instead of "look at this," try:
1. **Describe what you see** — "I see an error that says [exact text]"
2. **Name the element** — "The 'Save' button is greyed out"
3. **Share the value** — "The total shows $0.00 but I expected $45.99"
4. **State the context** — "I'm on the order detail page for order #1234"

### We Know It's Not Ideal
The team is aware this is a friction point. The assistant compensates by having deep knowledge of every page's layout, features, and common states — so with a bit of context from you, it can usually figure out what's happening.`,
  },

  // ── 38. Common mistakes new users make ──
  {
    slug: 'meta-common-mistakes',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'common mistakes|mistakes new users make|common errors|things people get wrong|pitfalls|avoid mistakes|rookie mistakes|new user errors',
    approvedAnswerMarkdown: `## What Are the Most Common Mistakes New Users Make Here?

### Top 10 New User Mistakes

1. **Forgetting to save** — Navigating away from a form without clicking Save. Changes are lost.

2. **Wrong location selected** — Working in Location A's data while thinking you're in Location B. Always check the location selector.

3. **Confusing void and refund** — Voiding before settlement (free), refunding after (processes a return). Using the wrong one creates accounting headaches.

4. **Not refreshing stale data** — Looking at yesterday's numbers and panicking. Refresh the page or check the date filter.

5. **Ignoring validation errors** — Red text means the save didn't work. Read the message and fix the field.

6. **Entering prices incorrectly** — Catalog prices are in dollars ($12.99), not cents. Entering 1299 creates a $1,299.00 item.

7. **Not closing the register** — Leaving the register open overnight throws off cash management reports.

8. **Changing settings during peak hours** — Catalog or tax changes take effect immediately on new orders. Do this during off-hours.

9. **Creating duplicate items** — Search the catalog before adding a new item. Duplicates cause inventory and reporting confusion.

10. **Not reading error messages** — System messages usually tell you exactly what's wrong. Read them before asking for help.

### Ask the Assistant
"What should I watch out for on this page?" — for page-specific pitfall warnings.`,
  },

  // ── 39. Short version and detailed version ──
  {
    slug: 'meta-short-vs-detailed',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'short version|detailed version|brief answer|long answer|summary vs detail|quick answer|full explanation|both versions|tldr',
    approvedAnswerMarkdown: `## Can You Give Me the Short Version and the Detailed Version?

Yes! You can control the level of detail in the assistant's responses.

### How to Ask

**For the short version:**
- "Give me the short version"
- "TL;DR"
- "Quick answer"
- "One sentence"

**For the detailed version:**
- "Give me the detailed version"
- "Explain in full"
- "Step by step"
- "I want all the details"

**For both:**
- "Give me the short version and the detailed version"
- "Quick summary, then the full explanation"

### Example

**Short:** "To refund an order, go to Order History → find the order → click Refund → confirm."

**Detailed:** [Full step-by-step with prerequisites, permission requirements, GL impact, partial refund options, and edge cases]

### Default Behavior
The assistant defaults to a **medium-length** response — enough detail to be useful without overwhelming. It then offers follow-up questions for more depth.

### Tips
- Start with the short version, then ask for details on the parts you don't understand
- Say "Explain just step 3 in more detail" to drill into a specific part
- The assistant remembers your preference within a conversation — if you ask for detailed once, it stays detailed`,
  },

  // ── 40. What changed after I updated this setting? ──
  {
    slug: 'meta-what-changed-after-update',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what changed after|after I updated|effect of my change|did that work|what happened after|result of changing|impact of update|after saving',
    approvedAnswerMarkdown: `## What Changed After I Updated This Setting?

### How to Verify a Change Took Effect

1. **Check the "Updated at" timestamp** — It should show the current time
2. **Refresh the page** — Then verify the field shows your new value
3. **Test the behavior** — Try the action affected by the setting and see if it behaves differently

### Common Settings and Their Effects

| Setting | When It Takes Effect | How to Verify |
|---|---|---|
| Item price | Next order (existing orders unaffected) | Add the item to a new POS order |
| Tax rate | Next transaction | Process a test sale |
| User role/permissions | Immediately (may need re-login) | Have the user try the affected action |
| KDS routing rules | Next order sent to KDS | Send a test order |
| Register settings | Next register open | Close and reopen the register |
| Location timezone | Immediately for new data | Check a new transaction's timestamp |
| Module enable/disable | After page refresh | Check if the module appears in navigation |

### If Nothing Changed
- Did you click **Save**? (Check for a success toast)
- Are you looking at the right location?
- Does the change apply to new data only (not retroactive)?
- Is there a cache? Try a hard refresh (Ctrl+Shift+R)

### Ask the Assistant
"I just changed [setting] to [value] — what should be different now?" for a specific impact analysis.`,
  },

  // ── 41. Why does the answer say "may vary by account"? ──
  {
    slug: 'meta-may-vary-by-account',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'may vary by account|varies by account|why the caveat|why not specific|generic answer|not specific enough|why uncertain|why hedging',
    approvedAnswerMarkdown: `## Why Does This Answer Say It "May Vary by Account"?

### The Short Version
The assistant provides answers based on OppsEra's **default behavior and documentation**. When your specific tenant has customizable settings that could change the answer, it flags this so you don't rely on a generic answer that might not match your setup.

### Specifically, These Things Can Vary:
- **Enabled modules** — Your tenant might not have all modules active
- **Custom permissions** — Your Owner may have modified the default role permissions
- **Tax configuration** — Tax rules are jurisdiction-specific
- **Catalog structure** — Departments, categories, and item organization are fully custom
- **Location settings** — Each location can have different configurations
- **Business type** — Restaurant vs. retail vs. golf vs. hybrid changes feature availability

### Why the Assistant Can't Just Check
- The assistant operates on general knowledge, not a live query of your tenant settings
- Reading your specific configuration for every answer would be slow and could raise privacy concerns
- Many answers are 90% correct for all tenants — the caveat covers the 10%

### What to Do
- If the answer is critical, verify by checking the relevant settings page
- Ask "Does this apply to my specific setup?" — the assistant will tell you what to check
- Your Owner or Manager can confirm account-specific configurations`,
  },

  // ── 42. Suggest likely root causes in order ──
  {
    slug: 'meta-root-causes-ranked',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'root causes|likely causes|possible reasons|why is this happening|diagnose|troubleshoot|probable cause|rank the causes|most likely reason',
    approvedAnswerMarkdown: `## Can You Suggest the Likely Root Causes in Order?

Yes! When you describe a problem, the assistant will rank possible causes from most to least likely.

### How Root Cause Ranking Works
The assistant considers:
1. **Frequency** — How often this cause appears for similar symptoms
2. **Context** — Your current page, role, and conversation history
3. **Simplicity** — Simple causes (wrong filter, stale data) are checked before complex ones
4. **Reversibility** — Causes you can easily verify and fix are listed first

### Example: "Sales report shows $0 for today"
1. **Most likely:** Date filter is set to a different day → Check the date picker
2. **Likely:** Location filter is set to a different location → Check location selector
3. **Possible:** No orders have been processed today → Check Order History
4. **Unlikely:** Register was never opened → Check Register status
5. **Rare:** Data sync issue → Refresh page, if still $0 contact support

### How to Use This
- Start from the top and work down — each cause takes seconds to check
- Tell the assistant "It's not #1 or #2" and it will elaborate on the remaining options
- If none of the suggested causes apply, the assistant may escalate to support

### Tips
- The more specific your symptom description, the more accurate the ranking
- Include when it started, who's affected, and what (if anything) changed recently`,
  },

  // ── 43. Training issue vs. product issue ──
  {
    slug: 'meta-training-vs-product-issue',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'training issue or product issue|user error or bug|my fault or system fault|training problem|product problem|operator error|is it me or the system',
    approvedAnswerMarkdown: `## Can You Tell Me Whether This Is a Training Issue or a Product Issue?

### Signs It's a Training Issue
- The system is behaving as designed, but the user expected something different
- The same action works when a more experienced user tries it
- The issue resolves when the correct steps are followed
- The assistant can explain the expected workflow and it matches what the system does

### Signs It's a Product Issue
- The system does something unexpected that no workflow explains
- It worked before and stopped working without any configuration changes
- The assistant can't explain the behavior (unexpected state)
- Multiple experienced users encounter the same problem
- Error messages appear that aren't related to user actions

### How to Distinguish
Ask the assistant:
1. "What are the correct steps for [this task]?" — Follow them exactly
2. "Is what I'm seeing expected behavior?" — The assistant will tell you
3. "Has anyone else reported this?" — The assistant may know about known issues

### What to Do

**If training issue:**
- Ask the assistant for step-by-step instructions
- Practice with a test transaction
- Ask "What are the most common mistakes here?" to avoid repeating

**If product issue:**
- Document the exact steps, expected result, and actual result
- File a support ticket with the details
- Include the assistant's response that confirmed it's not user error`,
  },

  // ── 44. What would a manager check that staff would miss? ──
  {
    slug: 'meta-manager-vs-staff-check',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'what would a manager check|manager perspective|manager vs staff|supervisor level|management view|oversight|what am I missing|higher level check',
    approvedAnswerMarkdown: `## What Would a Manager Check Here That a Staff User Would Miss?

### Manager-Level Checks

**Financial Oversight:**
- Register variance reports (is the drawer balanced?)
- Void and refund patterns (unusual frequency = potential issue)
- Discount usage (who's applying discounts and how often?)
- Daily revenue vs. expected (based on traffic and history)

**Operational Oversight:**
- Staff activity (who's logged in, who's processing orders)
- Unresolved issues (open holds, abandoned orders, pending refunds)
- Inventory alerts (low stock items that could affect service)
- KDS performance (ticket times, bottlenecks, recall frequency)

**Data Quality:**
- Items with $0 price (intentional comp or mistake?)
- Orphaned records (orders without payments, payments without orders)
- Audit log anomalies (unusual actions, off-hours activity)

**Cross-Module View:**
Staff typically sees one module at a time. Managers should check:
- POS ↔ Inventory alignment (sales vs. stock movements)
- Orders ↔ Payments reconciliation
- Catalog ↔ POS (price consistency)

### How to Use This
Ask the assistant: "Give me the manager-level check for [area]" to get oversight-specific guidance relevant to your role and the current screen.`,
  },

  // ── 45. Translate system message to action plan ──
  {
    slug: 'meta-translate-to-action-plan',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'translate this message|action plan|what should I do about this|turn this into steps|system message to action|what does this mean for me|make this actionable',
    approvedAnswerMarkdown: `## Can You Translate This System Message into a Simple Action Plan?

Yes! Give the assistant the exact text of any system message, and it will return:

### What You'll Get
1. **Plain-English translation** — What the message means in simple terms
2. **Severity** — Is this blocking, a warning, or just informational?
3. **Action plan** — Numbered steps to resolve or respond
4. **Urgency** — Do you need to act now or can it wait?

### Example

**System message:** "Register variance detected: expected $542.30, actual $537.80. Variance: -$4.50."

**Translation:** The cash in your register is $4.50 short compared to what the system expected based on today's transactions.

**Action plan:**
1. Double-count the cash in the drawer
2. Check for any unclosed transactions or held orders
3. Look for a missing cash payment (customer paid cash but it wasn't recorded)
4. If the variance is real, note the reason when closing the register
5. Your manager will see this in the variance report

**Urgency:** Handle at register close. Not blocking — you can continue processing sales.

### How to Ask
- Copy the exact message and paste it to the assistant
- Or describe it: "I got a yellow warning that says something about register variance"
- Ask "What should I do about this?" for the action plan`,
  },

  // ── 46. Page explanation vs. workflow guide ──
  {
    slug: 'meta-explanation-vs-workflow',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'page explanation vs workflow|difference between explanation and guide|explain vs guide|when to explain vs walk through|explanation or walkthrough',
    approvedAnswerMarkdown: `## What's the Difference Between a Page Explanation and a Workflow Guide?

### Page Explanation
**What it is:** A description of a single screen — what it shows, what you can do, and how it fits into the system.

**When to use:** "What is this page?" "What do these fields mean?" "What can I do here?"

**What you get:**
- Page purpose and module
- Section-by-section breakdown
- Available actions and buttons
- Role-based visibility notes

### Workflow Guide
**What it is:** A step-by-step walkthrough of a multi-page process — the complete journey from start to finish.

**When to use:** "How do I process a refund?" "Walk me through setting up KDS." "How do I close the register?"

**What you get:**
- Numbered steps across multiple pages
- Navigation instructions (where to click to get to the next step)
- Decision points and branches
- Prerequisites and follow-up actions

### When to Ask for Which

| Situation | Ask For |
|---|---|
| "I don't understand this screen" | Page explanation |
| "I need to accomplish [goal]" | Workflow guide |
| "What does this button do?" | Page explanation |
| "How do I do [multi-step task]?" | Workflow guide |
| "I'm new to this page" | Page explanation first, then workflow |

### Combining Both
You can ask: "Explain this page, then walk me through [task]" to get both in sequence.`,
  },

  // ── 47. Onboard a new employee using the assistant ──
  {
    slug: 'meta-onboard-new-employee',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'onboard new employee|train new hire|new employee training|onboarding guide|set up new staff|new team member|orientation|new employee setup',
    approvedAnswerMarkdown: `## How Should I Onboard a New Employee Using the Assistant?

### Step 1: Account Setup (Manager/Owner)
1. Create the user account in **Settings → Users**
2. Assign the appropriate role (Cashier, Server, Staff, etc.)
3. Assign to the correct location(s)
4. Share login credentials securely

### Step 2: Guided Tour (New Employee)
Have the new employee ask the assistant these questions on their first day:

1. **"I'm new here — where should I start?"** → Personalized starting guide based on role
2. **"Explain this page"** → On each page they'll use daily
3. **"What are the most common mistakes new users make here?"** → Preventive training
4. **"Walk me through [primary workflow]"** → Hands-on practice

### Step 3: Role-Specific Training Path

**Cashier:**
1. POS → "Walk me through a basic sale"
2. POS → "How do I apply a discount?"
3. POS → "How do I handle a refund?"
4. Register → "Walk me through opening and closing the register"

**Server (F&B):**
1. POS → "How do I open a tab?"
2. POS → "How do I fire a course?"
3. POS → "How do I split a check?"

**Staff:**
1. Dashboard → "What can I access with my role?"
2. Relevant module → "Explain this page"

### Step 4: Verification
Have the employee process 2–3 test transactions while the assistant guides them. Then let them try independently, knowing the assistant is always available.`,
  },

  // ── 48. Train staff on daily opening procedures ──
  {
    slug: 'meta-train-opening-procedures',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'opening procedures|daily opening|morning setup|start of day|open the store|open for business|opening checklist|morning routine|opening tasks',
    approvedAnswerMarkdown: `## Can the Assistant Help Me Train Staff on Daily Opening Procedures?

Yes! Here's the standard opening procedure the assistant can walk any staff member through:

### Daily Opening Checklist

**1. Login & Location Check**
- Log in with your credentials
- Verify the correct **location** is selected in the top bar
- Check the **date and time** are correct (timezone issues affect reports)

**2. Open Register**
- Navigate to **POS → Register**
- Click **Open Register**
- Count the starting cash (float) and enter the amount
- Confirm the opening balance

**3. Verify System Status**
- Check for any **system notifications** or alerts on the dashboard
- Review any **held orders** from the previous day
- Check **inventory alerts** for low-stock items (if applicable)

**4. Module-Specific Opening**
- **F&B:** Verify service areas are set up, KDS stations are online
- **Retail:** Check any pending receiving orders
- **Golf:** Verify tee sheet is loaded for the day

**5. Test Transaction (Optional but Recommended)**
- Process a $0.01 test sale and void it to confirm POS is working
- Verify receipt printer is connected (if applicable)

### How to Use with the Assistant
Tell new staff: "Ask the assistant 'Walk me through the opening procedure' on your first morning. It will guide you step by step."`,
  },

  // ── 49. Train staff on daily closing procedures ──
  {
    slug: 'meta-train-closing-procedures',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'closing procedures|daily closing|end of day|close the store|closing checklist|end of shift|closing tasks|nightly close|close out',
    approvedAnswerMarkdown: `## Can the Assistant Help Me Train Staff on Daily Closing Procedures?

Yes! Here's the standard closing procedure:

### Daily Closing Checklist

**1. Settle Open Transactions**
- Check for **open orders** or **held tabs** — settle or void them
- Process any remaining **pending payments**
- Verify no **unresolved** POS items remain

**2. Close Register**
- Navigate to **POS → Register**
- Click **Close Register**
- Count all cash in the drawer
- Enter the actual cash amount
- Review the **register summary** (expected vs. actual)
- Note any **variance** and add a reason if required
- Confirm and close

**3. Review Daily Summary**
- Check **Reporting → Daily Summary** for the day's totals
- Verify the numbers look reasonable (compare to a typical day)
- Note any anomalies for the manager

**4. Module-Specific Closing**
- **F&B:** Clear any remaining KDS tickets, review ticket times
- **Inventory:** Note any items that ran out during the day
- **Golf:** Close the tee sheet, review no-shows

**5. System Closeout**
- Log out of the POS
- Do NOT leave the register screen open overnight
- Lock the device if it's a shared terminal

### Register Variance Guide
| Variance | Action |
|---|---|
| Under $1 | Normal rounding — note and proceed |
| $1–$5 | Check for missed cash transactions |
| Over $5 | Notify manager before closing |

### How to Use with the Assistant
Tell staff: "Ask the assistant 'Walk me through closing' at the end of your shift until you have it memorized."`,
  },

  // ── 50. Best questions to ask the assistant ──
  {
    slug: 'meta-best-questions-to-ask',
    moduleKey: 'assistant',
    route: null,
    questionPattern:
      'best questions to ask|how to get best results|what questions work best|how to use the assistant|assistant tips|get better answers|what to ask|assistant best practices',
    approvedAnswerMarkdown: `## What Kinds of Questions Should I Ask the Assistant to Get the Best Results?

### High-Quality Question Patterns

**Page Understanding:**
- "What am I looking at on this page?"
- "Explain this page in plain English"
- "What can I do from here?"

**Task Guidance:**
- "Walk me through [specific task] step by step"
- "What's the fastest way to [goal]?"
- "What should I do next?"

**Troubleshooting:**
- "I'm on [page], trying to [goal], but [symptom]"
- "Why is [button/feature] disabled?"
- "What should I check first when [problem]?"

**Learning:**
- "What would a manager check here?"
- "What are the most common mistakes on this page?"
- "What's the difference between [A] and [B]?"

### Questions That Get Better Answers
- **Be specific:** "How do I refund order #1234?" beats "How do refunds work?"
- **Include context:** "I'm on the catalog page and..." beats "How do I edit an item?"
- **State your role:** "As a cashier, how do I..." helps the assistant tailor the answer
- **Describe the symptom:** "The total shows $0" beats "Something is wrong"

### Questions to Avoid
- **Vague:** "Help" (what do you need help with?)
- **Screenshot-dependent:** "What's this?" (the assistant can't see images — describe it)
- **Action requests:** "Delete this order for me" (the assistant is read-only)
- **Non-system:** "What's the weather?" (off-topic for the business assistant)

### Pro Tip
If the first answer isn't detailed enough, ask "Can you give me the detailed version?" or "What else should I know about this?"`,
  },
  {
    slug: 'pos-fnb-move-items-between-seats',
    moduleKey: 'fnb',
    route: '/pos/fnb',
    questionPattern:
      'move item to another seat|change seat on item|reassign item to different seat|move items between seats|switch seat number|move food to another seat|change seat assignment|drag item to seat|move drink to different seat',
    approvedAnswerMarkdown: `## Moving Items Between Seats

Currently there is **no direct way** to reassign an item from one seat to another after it has been added to the tab.

### Workaround for Unsent Items
If the item has **not been sent to the kitchen yet** (still in draft):
1. **Delete the item** from the current seat
2. **Select the correct seat** using the Seat Rail on the left side of the tab
3. **Re-add the item** from the menu — it will be assigned to the newly selected seat

### Workaround for Sent Items
If the item has **already been sent**:
1. **Void the item** on the original seat (requires \`pos_fnb.tabs.void\` permission)
2. **Select the correct seat** in the Seat Rail
3. **Re-add the item** — it will fire to the kitchen again under the new seat

### For Payment Splitting Purposes
If you just need items on **separate checks** (not actually changing the seat number):
1. Open the tab and tap **Split**
2. Choose **By Item** or **Custom** mode
3. **Drag items** between checks as needed
4. Each check can be paid independently

> **Tip:** To avoid needing to move items later, always confirm the correct seat is selected in the Seat Rail **before** adding items. The active seat is highlighted in the rail on the left.`,
  },
];

export async function seedTrainingDataBatch6(tenantId: string | null) {
  const rows = TRAINING_CARDS_BATCH6.map((c) => ({
    ...c,
    tenantId,
    status: 'draft' as const,
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
