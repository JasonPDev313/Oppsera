# OppsEra Permission Matrix

Single authoritative reference for all system permissions. Source of truth: `packages/shared/src/permissions/permission-matrix.ts`.

## System Roles

| Role | Description |
|------|-------------|
| **owner** | Full access (wildcard `*`). Can perform all actions. |
| **manager** | Daily operations management. Most write permissions. |
| **supervisor** | Floor supervision, approvals, moderate write access. |
| **cashier** | POS terminal operations. Limited to orders, tenders, and cash drawer. |
| **server** | F&B service operations. Tabs, orders, payments. |
| **staff** | Basic read-only staff. Minimal access. |

## Flags

- **Manager PIN** — requires a manager-level user to enter their PIN before the action executes. Used for high-risk POS operations (voids, comps, refunds, price overrides).
- **Audit** — the action is logged to the `audit_log` table with actor, entity, timestamp, and change details. Required for all financial mutations.

## Platform Core

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `settings.view` | View system settings | owner, manager, supervisor | | |
| `settings.update` | Modify system settings | owner, manager | | Y |
| `users.view` | View user list and profiles | owner, manager, supervisor | | |
| `users.manage` | Create, edit, and manage users and role assignments | owner, manager | | Y |

## Catalog

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `catalog.view` | View items, categories, taxes, and pricing | owner, manager, supervisor, cashier, server, staff | | |
| `catalog.manage` | Create, edit, and archive items, categories, and taxes | owner, manager | | Y |

## Orders / POS

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `orders.view` | View orders and order history | owner, manager, supervisor, cashier, server | | |
| `orders.create` | Create new orders in POS | owner, manager, supervisor, cashier, server | | |
| `orders.manage` | Modify existing orders (update lines, add charges) | owner, manager, supervisor, cashier | | Y |
| `orders.void` | Void an entire order | owner, manager | Y | Y |
| `returns.create` | Create return orders and process refunds | owner, manager, supervisor | Y | Y |
| `price.override` | Override item prices during sale | owner, manager, supervisor | Y | Y |
| `discounts.apply` | Apply discounts to orders | owner, manager, supervisor, cashier | | Y |
| `charges.manage` | Add or remove service charges | owner, manager, supervisor | | Y |
| `shift.manage` | Open and close drawer sessions | owner, manager, supervisor, cashier | | Y |
| `cash.drawer` | Record paid-in, paid-out, and no-sale events | owner, manager, supervisor, cashier | | Y |
| `cash.drop` | Record cash drops to safe | owner, manager, supervisor, cashier | | Y |

## Payments / Tenders

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `tenders.view` | View payment/tender records | owner, manager, supervisor, cashier, server | | |
| `tenders.create` | Record payments (cash, card, etc.) | owner, manager, supervisor, cashier, server | | Y |
| `tenders.adjust` | Adjust tip amounts on tenders | owner, manager, supervisor, cashier, server | | Y |
| `tenders.refund` | Reverse tenders and issue refunds | owner, manager | Y | Y |

## Inventory

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `inventory.view` | View stock levels, movements, and receiving history | owner, manager, supervisor, cashier, staff | | |
| `inventory.manage` | Receive, adjust, transfer stock; manage vendors and POs | owner, manager, supervisor | | Y |

## Customers

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `customers.view` | View customer profiles and search | owner, manager, supervisor, cashier, server, staff | | |
| `customers.manage` | Create, edit, merge customers; manage contacts and service flags | owner, manager, supervisor | | Y |
| `billing.view` | View billing accounts, statements, and AR transactions | owner, manager, supervisor | | |
| `billing.manage` | Manage billing accounts, post charges, process payments | owner, manager | | Y |

## Reporting

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `reports.view` | View standard reports and dashboards | owner, manager, supervisor | | |
| `reports.export` | Export reports to CSV | owner, manager | | |
| `reports.custom.view` | View saved custom reports and dashboards | owner, manager, supervisor | | |
| `reports.custom.manage` | Create, edit, and delete custom reports and dashboards | owner, manager | | |

## Accounting / GL

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `accounting.view` | View chart of accounts, journal entries, reports, statements | owner, manager | | |
| `accounting.manage` | Post journal entries, manage accounts, configure settings | owner, manager | | Y |
| `accounting.mappings.manage` | Configure GL account mappings | owner, manager | | Y |
| `accounting.period.close` | Close an accounting period (irreversible) | owner | Y | Y |
| `cogs.manage` | Calculate and post periodic COGS entries | owner, manager | | Y |

## Accounts Payable

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `ap.view` | View bills, payment history, vendor ledger, and aging reports | owner, manager | | |
| `ap.manage` | Create, post, and void bills and payments | owner, manager | | Y |

## Accounts Receivable

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `ar.view` | View invoices, receipts, customer ledger, and aging reports | owner, manager | | |
| `ar.manage` | Create, post, and void invoices and receipts | owner, manager | | Y |

## Room Layouts

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `room_layouts.view` | View floor plans and room configurations | owner, manager, supervisor, cashier, server, staff | | |
| `room_layouts.manage` | Edit floor plans, publish versions, manage templates | owner, manager, supervisor | | Y |

## AI Insights / Semantic

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `semantic.view` | View available metrics and dimensions | owner, manager, supervisor | | |
| `semantic.query` | Run AI-powered queries and chat | owner, manager, supervisor | | |
| `semantic.manage` | Create and edit custom lenses | owner, manager | | |
| `semantic.admin` | View semantic metrics, invalidate cache | owner | | |

## F&B POS

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `pos_fnb.floor_plan.view` | View floor plan and table status | owner, manager, supervisor, cashier, server | | |
| `pos_fnb.floor_plan.manage` | Edit table assignments and sections | owner, manager, supervisor | | |
| `pos_fnb.tabs.view` | View open tabs and check details | owner, manager, supervisor, cashier, server | | |
| `pos_fnb.tabs.create` | Open new tabs | owner, manager, supervisor, cashier, server | | |
| `pos_fnb.tabs.transfer` | Transfer tabs between servers | owner, manager, supervisor | | Y |
| `pos_fnb.tabs.void` | Void entire tabs | owner, manager | Y | Y |
| `pos_fnb.tabs.manage` | Close, reopen, and manage tab lifecycle | owner, manager, supervisor, cashier, server | | Y |
| `pos_fnb.kds.view` | View kitchen display system | owner, manager, supervisor, cashier, server, staff | | |
| `pos_fnb.kds.bump` | Bump items and tickets on KDS | owner, manager, supervisor, cashier, server, staff | | |
| `pos_fnb.kds.recall` | Recall bumped items on KDS | owner, manager, supervisor | | |
| `pos_fnb.payments.create` | Process F&B payments | owner, manager, supervisor, cashier, server | | Y |
| `pos_fnb.payments.split` | Split checks | owner, manager, supervisor, cashier, server | | |
| `pos_fnb.payments.refund` | Process F&B refunds | owner, manager | Y | Y |
| `pos_fnb.payments.void` | Void F&B payments | owner, manager | Y | Y |
| `pos_fnb.tips.adjust` | Adjust tip amounts | owner, manager, supervisor, cashier, server | | Y |
| `pos_fnb.tips.finalize` | Finalize tips for period | owner, manager | | Y |
| `pos_fnb.tips.pool_manage` | Manage tip pools and distribution | owner, manager | | Y |
| `pos_fnb.tips.manage` | Declare and manage tip operations | owner, manager, supervisor | | Y |
| `pos_fnb.menu.manage` | 86/restore menu items | owner, manager, supervisor | | Y |
| `pos_fnb.menu.comp` | Comp items (posts to expense GL) | owner, manager | Y | Y |
| `pos_fnb.menu.discount` | Apply discounts to F&B items | owner, manager, supervisor | | Y |
| `pos_fnb.menu.price_override` | Override F&B item prices | owner, manager | Y | Y |
| `pos_fnb.close_batch.manage` | Start, reconcile, and post close batches | owner, manager | | Y |
| `pos_fnb.close_batch.cash_count` | Enter cash counts for close batch | owner, manager, supervisor, cashier | | Y |
| `pos_fnb.reports.view` | View F&B reports | owner, manager, supervisor | | |
| `pos_fnb.reports.export` | Export F&B reports | owner, manager | | |
| `pos_fnb.settings.manage` | Configure F&B settings | owner, manager | | Y |
| `pos_fnb.gl.view` | View F&B GL posting status and reconciliation | owner, manager | | |
| `pos_fnb.gl.manage` | Configure F&B GL posting and mappings | owner, manager | | Y |
| `pos_fnb.gl.post` | Post F&B batches to GL | owner, manager | | Y |
| `pos_fnb.gl.reverse` | Reverse F&B GL postings | owner, manager | Y | Y |
| `pos_fnb.gl.mappings` | Configure F&B GL account mappings | owner, manager | | Y |

## Property Management (PMS)

| Permission | Description | Default Roles | PIN | Audit |
|------------|-------------|---------------|-----|-------|
| `pms.property.view` | View property information | owner, manager, supervisor, staff | | |
| `pms.property.manage` | Manage property settings | owner, manager | | Y |
| `pms.rooms.view` | View rooms and room types | owner, manager, supervisor, cashier, staff | | |
| `pms.rooms.manage` | Manage rooms, room types, and out-of-order status | owner, manager, supervisor | | Y |
| `pms.reservations.view` | View reservations | owner, manager, supervisor, cashier, staff | | |
| `pms.reservations.create` | Create new reservations | owner, manager, supervisor, cashier | | Y |
| `pms.reservations.edit` | Edit existing reservations | owner, manager, supervisor | | Y |
| `pms.reservations.cancel` | Cancel reservations | owner, manager, supervisor | | Y |
| `pms.front_desk.check_in` | Check in guests | owner, manager, supervisor, cashier | | Y |
| `pms.front_desk.check_out` | Check out guests | owner, manager, supervisor, cashier | | Y |
| `pms.front_desk.no_show` | Mark reservations as no-show | owner, manager, supervisor | | Y |
| `pms.calendar.view` | View reservation calendar | owner, manager, supervisor, cashier, staff | | |
| `pms.calendar.move` | Move reservations on calendar | owner, manager, supervisor | | Y |
| `pms.calendar.resize` | Resize reservations (change dates) | owner, manager, supervisor | | Y |
| `pms.housekeeping.view` | View housekeeping tasks and room status | owner, manager, supervisor, staff | | |
| `pms.housekeeping.manage` | Manage housekeeping assignments and room status | owner, manager, supervisor, staff | | |
| `pms.guests.view` | View guest profiles | owner, manager, supervisor, cashier, staff | | |
| `pms.guests.manage` | Manage guest profiles | owner, manager, supervisor | | |
| `pms.folio.view` | View guest folios | owner, manager, supervisor, cashier | | |
| `pms.folio.post_charges` | Post charges to guest folio | owner, manager, supervisor, cashier | | Y |
| `pms.folio.post_payments` | Post payments to guest folio | owner, manager, supervisor, cashier | | Y |
| `pms.rates.view` | View rate plans | owner, manager, supervisor | | |
| `pms.rates.manage` | Manage rate plans and pricing | owner, manager | | Y |
