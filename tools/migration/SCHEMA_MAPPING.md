# Phase 1: Schema Mapping & Gap Analysis

## Overview

Migration from legacy MSSQL (`GF_*` prefixed, ~290 tables) to new Postgres 16 multi-tenant system (~243 tables).

**Source**: CSV/JSON exports from MSSQL
**Target**: Postgres 16 with RLS, Drizzle ORM
**Strategy**: Per-tenant gradual cutover
**Volume**: Medium (100K–1M orders)
**Retention**: All historical data

---

## Disposition Summary

| Category | Count | Action |
|----------|-------|--------|
| SKIP | 90 | Integration config, test data, country/state lookups — not migrated |
| ALREADY COVERED | 57 | Mapped to existing new tables (customers, orders, catalog, etc.) |
| NEW TABLES | ~190 | Created in migrations 0021–0043 |
| ALTER TABLE | ~47 columns | Added to existing tables via migrations |

---

## Domain-Level Table Mapping

### ALREADY COVERED (57 tables → existing new tables)

| Legacy Table | New Table | Key Transforms |
|---|---|---|
| GF_Customer | customers | Money→cents, bit→bool, datetime→timestamptz |
| GF_Golfer | customers | Unified with GF_Customer |
| GF_Order | orders | Money→cents, status mapping |
| GF_OrderDetails | order_lines | Money→cents, qty as numeric |
| GF_OrderLineItem | order_lines | Merged with OrderDetails |
| GF_PaymentMethod | tenders | PaymentType→tender_type enum |
| GF_Tax | tax_rates | Rate as numeric |
| GF_TaxGroup | tax_groups | Direct mapping |
| GF_Category | catalog_categories | Hierarchy preserved |
| GF_MenuItems | catalog_items | Type mapping (food→fnb, retail→retail) |
| GF_CourseFoodItemDetail | catalog_items | Location-specific pricing |
| GF_Vendor | inventory_vendors | Direct mapping |
| GF_PurchaseOrders | inventory_purchase_orders | Money→cents |
| GF_AdminUsers | users | Pin fields added via ALTER |
| GF_Roles | roles | Permission string mapping |
| GF_Settings | tenant_settings | Key-value pairs |
| GF_ClassTypeClub | membership_plans | Complex: billing, privileges, pricing |
| GF_CustomerClassType | customer_memberships | Status lifecycle mapping |

### NEW DOMAIN TABLES (by migration)

| Migration | Domain | Tables | Source Legacy Tables |
|---|---|---|---|
| 0021 | Management Co + Departments | 9 | GF_ManagementCompany, GF_Department, GF_AccountingSource, etc. |
| 0022 | API + AI + Portal | 6 | GF_ApiKey, GF_ClubMemberPortalSections, GF_MobileApps, etc. |
| 0023 | Communications | 6 | GF_EmailTemplates, GF_MassMessages, GF_Post, etc. |
| 0024 | Floor Plans + Venues | 5 | GF_FloorPlans, GF_Venue, GF_VenueType, etc. |
| 0025 | Courses | 8+ | GF_CourseInfo, GF_CourseBuilder, GF_CourseBlockUserList, etc. |
| 0026 | Discounts | 7 | GF_Discount, GF_PromoCode, GF_RACKRate, etc. |
| 0027 | Customer Gaps | 6+ALTER | GF_Address, GF_CustomerLocker, GF_CustomerBagRack, etc. |
| 0028 | Role Gaps + Late Fees | 2+ALTER | GF_RoleDepartment, GF_LateFee |
| 0029 | Terminals | 10 | GF_Terminal, GF_TerminalLocation, GF_Printer, etc. |
| 0030 | Inventory Gaps | 4+ALTER | GF_InventoryCombo, GF_PurchaseInvoice, etc. |
| 0031 | Employees | 5+ALTER | GF_EmployeeTimeLogEntry, GF_PayrollConfiguration, etc. |
| 0032 | Membership Gaps | 10+ALTER | GF_MembershipGroup, GF_ClassTypeBillingSchedule, etc. |
| 0033 | Loyalty + Punch Cards | 11 | GF_LoyaltyLedger, GF_PunchCard, etc. |
| 0034 | Order Gaps + Payment Gaps | 15+ALTER | GF_OrderSeat, GF_OrderTips, GF_CustomPaymentType, etc. |
| 0035 | Vouchers + Minimum Spend | 10 | GF_CreditVoucher, GF_MinimumSpendRule, etc. |
| 0036 | Reservations | 7 | GF_ReservationResourceType, GF_ReservationResource, etc. |
| 0037 | Tee Times (config) | 15 | GF_TeeSeason, GF_TeeType, GF_TeePricingPlan, etc. |
| 0038 | Tee Times (bookings) | 15 | GF_TeeBooking → tee_times, GF_TeeBookingGroupMember → tee_time_players, etc. |
| 0039 | Events (core) | 14 | GF_CourseEvents, GF_EventActivities, etc. |
| 0040 | Events (golf) | 13 | GF_EventGolfers, GF_GolfLeagueProfile, etc. |
| 0041 | Misc | 12 | GF_Charity, GF_Tasks, GF_GamePlayRound, etc. |
| 0042 | Field Additions | ALTERs | Cross-cutting column additions |

---

## Column-Level Transform Rules

### Universal Transforms

| Legacy Type | New Type | Transform |
|---|---|---|
| `bigint` (ID) | `text` (ULID) | `idMap.getOrCreate(table, id)` |
| `bigint` (FK) | `text` | `idMap.resolve(refTable, id)` |
| `decimal` (money) | `integer` (cents) | `Math.round(parseFloat(val) * 100)` |
| `bit` | `boolean` | `val === 1 \|\| val === '1' \|\| val === true` |
| `datetime` | `timestamptz` | `new Date(val).toISOString()` |
| `nvarchar`/`varchar` | `text` | Trim, null-coalesce |
| `ntext` | `text` | Strip HTML if needed, trim |
| `IsDeleted=1` | (skip row) | Filter out during ETL |

### Key ID Reference Mappings

| Legacy FK Column | Legacy Table | New FK Column | New Table |
|---|---|---|---|
| ClubId | (context) | tenant_id | tenants |
| CourseId/CourseID | GF_Courses | course_id or location_id | courses or locations |
| CustomerId | GF_Customer | customer_id | customers |
| GolferId | GF_Golfer | customer_id | customers (unified) |
| AdminUserId | GF_AdminUsers | user_id | users |
| OrderId | GF_Order | order_id | orders |
| PaymentMethodId | GF_PaymentMethod | tender_id | tenders |
| ClassTypeId | GF_ClassTypeClub | membership_plan_id | membership_plans |
| CourseMembershipId | GF_CustomerClassType | membership_id | customer_memberships |
| DepartmentId | GF_Department | department_id | departments |
| CategoryId | GF_Category | category_id | catalog_categories |
| CourseFoodItemDetailId | GF_CourseFoodItemDetail | catalog_item_id | catalog_items |
| EventId | GF_CourseEvents | event_id | events |
| VenueId | GF_Venue | venue_id | venues |
| TerminalId | GF_Terminal | terminal_id | terminals |
| TerminalLocationId | GF_TerminalLocation | terminal_location_id | terminal_locations |
| TeeBookingId | GF_TeeBooking | tee_time_id | tee_times |
| RackRateId | GF_RACKRate | rack_rate_id | rack_rates |
| CreditVoucherId | GF_CreditVoucher | voucher_id | vouchers |

### Field Additions to Existing Tables

| Table | New Columns | Source |
|---|---|---|
| customers | prefix, suffix, nickname, home_phone, ghin_number, projected_rounds | GF_Customer + GF_CustomerUSGAProfile |
| orders | hole_number, tab_name, table_number, service_charge_exempt, primary_order_id, promo_code_id, search_tags, event_id | GF_Order |
| order_lines | cost_price_cents, seat_number, meal_course_id, combo_parent_line_id | GF_OrderDetails |
| users | phone, pos_pin, override_pin, employee_color, external_payroll_id, profile_image_url, last_login_at | GF_AdminUsers |
| locations | phone, email, website_url, logo_url, description, social_links | GF_CourseInfo |
| membership_plans | tax_group_id, process_fee_rate, process_fee_amount_cents, enable_online_sale, tee_sheet_color, terms_and_conditions, cancellation_policy, prorate_on_sale, max_assignments, expiration_strategy, eligible_for_loyalty, eligible_for_awards, awards_percentage, display_sequence, account_type | GF_ClassTypeClub |
| late_fee_policies | fee_amount_cents, threshold_amount_cents, minimum_fee_cents | GF_LateFee |

---

## Gap Analysis

### Consolidations (multiple old → single new)

| New Table | Consolidated From |
|---|---|
| customers | GF_Customer + GF_Golfer |
| customer_facility_assignments | GF_CustomerBagRack + GF_CustomerLocker + GF_GolferChangingLocation |
| customer_service_flags | GF_CustomerMembershipFlag + GF_BlockUserList |
| tee_sheet_notes | GF_TeeSheetNote + GF_StarterSheetNote |
| portal_section_configs | GF_ClubCustomerPortalSections + GF_ClubMemberPortalSections + GF_ClubMobileAppSections + GF_MemberPortalSections + GF_MobileAppSections |
| role_department_access | GF_RoleDepartment + GF_RoleSubDepartment |
| customer_communications | GF_CommunicationsEmail + GF_Messages |
| email_templates | GF_EmailTemplates + GF_Templates + GF_CourseEmailTemplates |

### Denormalization Splits (single old → multiple new)

| Legacy Table | New Tables | Reason |
|---|---|---|
| GF_CourseInfo | courses + course_holes | 18 hole columns normalized into rows |
| GF_PaymentMethod | tenders + tender metadata | Cash/check/custom split by type |

### Status/Enum Mappings

| Domain | Legacy Values | New Values |
|---|---|---|
| Orders | Active/Closed/Voided/Deleted | open/placed/paid/voided/deleted |
| Payments | Captured/Voided/Pending | captured/voided/pending |
| Memberships | A/I/E/C/P | active/inactive/expired/canceled/paused |
| Tee Times | CheckedIn/NoShow/Pending | checked_in/no_show/pending |
| Vouchers | Active/Redeemed/Expired | active/partial/redeemed/expired/refunded |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Money precision loss | Financial discrepancies | Round to nearest cent; validate penny-level accuracy |
| Orphan FKs | Missing parent rows | Resolve in dependency order; quarantine orphans |
| Duplicate customers | Inflated customer count | Deduplicate by email within tenant |
| DateTime timezone | Wrong timestamps | Assume legacy is local time; convert to UTC |
| NULL vs empty string | Data inconsistency | Normalize all empty/null variants to SQL NULL |
| Soft-deleted rows | Phantom data | Filter IsDeleted=1 during ETL |
| ClubId vs CourseId | Wrong tenant/location | ClubId→tenant_id, CourseId→location_id (context-dependent) |
