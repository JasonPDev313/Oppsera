/**
 * Domain Transformer Registry
 *
 * Transforms legacy MSSQL GF_* rows into new Postgres 16 rows.
 * Each transformer handles: ID generation (via IdMap), FK resolution,
 * type conversions (money->cents, bit->bool, datetime->timestamptz),
 * and column mapping.
 */
import type { IdMap } from './id-map';
import {
  moneyToCents,
  bitToBool,
  datetimeToTimestamptz,
  dateToDate,
  cleanEmail,
  cleanPhone,
  cleanStatus,
  truncate,
} from './cleaner';

// ─── Shared Helpers ──────────────────────────────────────────────

type RawRow = Record<string, unknown>;

/** Safely read a string field, returning null if empty/undefined */
function str(row: RawRow, key: string): string | null {
  const v = row[key];
  if (v == null || v === '') return null;
  return String(v);
}

/** Safely read a numeric field as a number */
function num(row: RawRow, key: string): number | null {
  const v = row[key];
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Safely read an integer field */
function int(row: RawRow, key: string): number | null {
  const n = num(row, key);
  if (n == null) return null;
  return Math.round(n);
}

/** Map legacy PaymentType int to our tender_type string */
function legacyPaymentTypeToTenderType(paymentType: unknown): string {
  const pt = Number(paymentType);
  switch (pt) {
    case 1: return 'cash';
    case 2: return 'card';
    case 3: return 'house_account';
    case 4: return 'gift_card';
    case 5: return 'store_credit';
    case 6: return 'check';
    default: return 'other';
  }
}

/** Build a displayName from first + last name */
function buildDisplayName(row: RawRow): string {
  const first = str(row, 'FirstName')?.trim();
  const last = str(row, 'LastName')?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return 'Unknown';
}

// ─── Domain Transformers ─────────────────────────────────────────

// ── 1. Customers ─────────────────────────────────────────────────

async function transformCustomer(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_Customer', row.CustomerId as number, 'customers', tenantId);
  return {
    id,
    tenant_id: tenantId,
    type: 'person',
    email: cleanEmail(row.Email),
    phone: cleanPhone(row.MobileNo),
    first_name: str(row, 'FirstName'),
    last_name: str(row, 'LastName'),
    display_name: buildDisplayName(row),
    notes: str(row, 'Notes'),
    tags: JSON.stringify([]),
    marketing_consent: bitToBool(row.MarketingConsent) ?? false,
    tax_exempt: bitToBool(row.IsTaxExempt) ?? false,
    total_visits: int(row, 'TotalVisits') ?? 0,
    total_spend: moneyToCents(row.TotalSpend) ?? 0,
    last_visit_at: datetimeToTimestamptz(row.LastVisitDate),
    date_of_birth: dateToDate(row.DateOfBirth),
    gender: str(row, 'Gender'),
    handicap_index: str(row, 'HandicapIndex'),
    prefix: str(row, 'Prefix'),
    suffix: str(row, 'Suffix'),
    nickname: str(row, 'NickName'),
    home_phone: cleanPhone(row.HomePhone),
    ghin_number: str(row, 'GHINNumber'),
    projected_rounds: int(row, 'ProjectedRounds'),
    status: 'active',
    metadata: JSON.stringify({ legacyId: row.CustomerId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 2. Orders ────────────────────────────────────────────────────

async function transformOrder(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_Order', row.OrderId as number, 'orders', tenantId);
  const locationId = await idMap.resolve('GF_CourseInfo', row.CourseId);
  const customerId = await idMap.resolve('GF_Customer', row.CustomerId);
  const terminalId = await idMap.resolve('GF_Terminal', row.TerminalId);

  return {
    id,
    tenant_id: tenantId,
    location_id: locationId,
    order_number: str(row, 'OrderNumber') ?? `LEGACY-${row.OrderId}`,
    status: cleanStatus(row.OrderStatus, 'order') ?? 'completed',
    source: 'pos',
    version: 1,
    customer_id: customerId,
    subtotal: moneyToCents(row.SubTotal) ?? 0,
    tax_total: moneyToCents(row.TaxTotal) ?? 0,
    service_charge_total: moneyToCents(row.ServiceChargeTotal) ?? 0,
    discount_total: moneyToCents(row.DiscountTotal) ?? 0,
    total: moneyToCents(row.Total) ?? 0,
    tax_exempt: bitToBool(row.IsTaxExempt) ?? false,
    notes: str(row, 'Notes'),
    business_date: dateToDate(row.BusinessDate) ?? dateToDate(row.OrderDate),
    terminal_id: terminalId,
    employee_id: str(row, 'EmployeeId'),
    placed_at: datetimeToTimestamptz(row.OrderDate),
    paid_at: datetimeToTimestamptz(row.PaidDate),
    voided_at: datetimeToTimestamptz(row.VoidDate),
    void_reason: str(row, 'VoidReason'),
    hole_number: int(row, 'HoleNumber'),
    tab_name: str(row, 'TabName'),
    table_number: str(row, 'TableNumber'),
    metadata: JSON.stringify({ legacyId: row.OrderId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
    created_by: str(row, 'CreatedBy') ?? 'migration',
    updated_by: str(row, 'LastModifiedBy') ?? 'migration',
  };
}

async function transformOrderDetail(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_OrderDetails', row.OrderDetailId as number, 'order_lines', tenantId);
  const orderId = await idMap.resolve('GF_Order', row.OrderId);
  const locationId = await idMap.resolve('GF_CourseInfo', row.CourseId);
  const catalogItemId = await idMap.resolve('GF_MenuItems', row.MenuItemId) ?? str(row, 'MenuItemId') ?? 'UNKNOWN';

  if (!orderId) return null; // skip orphaned lines

  return {
    id,
    tenant_id: tenantId,
    location_id: locationId,
    order_id: orderId,
    sort_order: int(row, 'SortOrder') ?? 0,
    catalog_item_id: catalogItemId,
    catalog_item_name: str(row, 'ItemName') ?? 'Unknown Item',
    catalog_item_sku: str(row, 'SKU'),
    item_type: str(row, 'ItemType') ?? 'retail',
    qty: str(row, 'Quantity') ?? '1',
    unit_price: moneyToCents(row.UnitPrice) ?? 0,
    line_subtotal: moneyToCents(row.SubTotal) ?? 0,
    line_tax: moneyToCents(row.TaxAmount) ?? 0,
    line_total: moneyToCents(row.Total) ?? 0,
    cost_price: moneyToCents(row.CostPrice),
    notes: str(row, 'Notes'),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
  };
}

async function transformOrderLineItem(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_OrderLineItem', row.OrderLineItemId as number, 'order_lines', tenantId);
  const orderId = await idMap.resolve('GF_Order', row.OrderId);
  const locationId = await idMap.resolve('GF_CourseInfo', row.CourseId);
  const catalogItemId = await idMap.resolve('GF_MenuItems', row.MenuItemId) ?? str(row, 'MenuItemId') ?? 'UNKNOWN';

  if (!orderId) return null;

  return {
    id,
    tenant_id: tenantId,
    location_id: locationId,
    order_id: orderId,
    sort_order: int(row, 'DisplayOrder') ?? 0,
    catalog_item_id: catalogItemId,
    catalog_item_name: str(row, 'ItemName') ?? 'Unknown Item',
    catalog_item_sku: str(row, 'SKU'),
    item_type: str(row, 'ItemType') ?? 'retail',
    qty: str(row, 'Quantity') ?? '1',
    unit_price: moneyToCents(row.UnitPrice) ?? 0,
    line_subtotal: moneyToCents(row.SubTotal) ?? 0,
    line_tax: moneyToCents(row.TaxAmount) ?? 0,
    line_total: moneyToCents(row.TotalAmount) ?? 0,
    cost_price: moneyToCents(row.CostPrice),
    notes: str(row, 'Notes'),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
  };
}

// ── 3. Catalog ───────────────────────────────────────────────────

async function transformMenuItem(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_MenuItems', row.MenuItemId as number, 'catalog_items', tenantId);
  const categoryId = await idMap.resolve('GF_Category', row.CategoryId);

  return {
    id,
    tenant_id: tenantId,
    category_id: categoryId,
    sku: str(row, 'SKU'),
    barcode: str(row, 'Barcode'),
    name: str(row, 'ItemName') ?? str(row, 'Title') ?? 'Unnamed Item',
    description: str(row, 'Description'),
    item_type: str(row, 'ItemType') ?? 'retail',
    default_price: str(row, 'UnitPrice') ?? '0.00',
    cost: str(row, 'CostPrice'),
    is_trackable: bitToBool(row.IsTrackable) ?? false,
    is_active: bitToBool(row.IsActive) ?? true,
    metadata: JSON.stringify({ legacyId: row.MenuItemId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformCourseFoodItem(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_CourseFoodItemDetail', row.CourseFoodItemDetailId as number, 'catalog_items', tenantId);
  const categoryId = await idMap.resolve('GF_Category', row.CategoryId);

  return {
    id,
    tenant_id: tenantId,
    category_id: categoryId,
    sku: str(row, 'SKU'),
    barcode: str(row, 'Barcode'),
    name: str(row, 'ItemName') ?? 'Unnamed Item',
    description: str(row, 'Description'),
    item_type: 'food',
    default_price: str(row, 'UnitPrice') ?? '0.00',
    cost: str(row, 'CostPrice'),
    is_trackable: bitToBool(row.IsTrackable) ?? false,
    is_active: bitToBool(row.IsActive) ?? true,
    metadata: JSON.stringify({ legacyId: row.CourseFoodItemDetailId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformCategory(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_Category', row.CategoryId as number, 'catalog_categories', tenantId);
  const parentId = await idMap.resolve('GF_Category', row.ParentCategoryId);

  return {
    id,
    tenant_id: tenantId,
    parent_id: parentId,
    name: str(row, 'CategoryName') ?? str(row, 'Title') ?? 'Unnamed Category',
    sort_order: int(row, 'DisplayOrder') ?? 0,
    is_active: bitToBool(row.IsActive) ?? true,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 4. Payments ──────────────────────────────────────────────────

async function transformPaymentMethod(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_PaymentMethod', row.PaymentMethodId as number, 'tenders', tenantId);
  const orderId = await idMap.resolve('GF_Order', row.OrderId);
  const locationId = await idMap.resolve('GF_CourseInfo', row.CourseId);

  if (!orderId) return null; // skip tenders for missing orders

  return {
    id,
    tenant_id: tenantId,
    location_id: locationId,
    order_id: orderId,
    tender_type: legacyPaymentTypeToTenderType(row.PaymentType),
    tender_sequence: int(row, 'Sequence') ?? 1,
    amount: moneyToCents(row.Amount) ?? 0,
    tip_amount: moneyToCents(row.TipAmount) ?? 0,
    change_given: moneyToCents(row.ChangeGiven) ?? 0,
    amount_given: moneyToCents(row.AmountGiven) ?? 0,
    currency: 'USD',
    status: 'captured',
    business_date: dateToDate(row.BusinessDate) ?? dateToDate(row.PaymentDate),
    source: 'pos',
    card_last4: str(row, 'CardLast4'),
    card_brand: str(row, 'CardBrand'),
    employee_id: str(row, 'EmployeeId') ?? 'migration',
    terminal_id: str(row, 'TerminalId') ?? 'migration',
    metadata: JSON.stringify({ legacyId: row.PaymentMethodId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    created_by: str(row, 'CreatedBy') ?? 'migration',
  };
}

// ── 5. Inventory ─────────────────────────────────────────────────

async function transformInventoryItem(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_InventoryItem', row.InventoryItemId as number, 'inventory_items', tenantId);
  const locationId = await idMap.resolve('GF_CourseInfo', row.CourseId);
  const catalogItemId = await idMap.resolve('GF_MenuItems', row.MenuItemId) ?? str(row, 'MenuItemId') ?? 'UNKNOWN';

  return {
    id,
    tenant_id: tenantId,
    location_id: locationId,
    catalog_item_id: catalogItemId,
    sku: str(row, 'SKU'),
    name: str(row, 'ItemName') ?? 'Unnamed Item',
    item_type: str(row, 'ItemType') ?? 'retail',
    status: 'active',
    track_inventory: bitToBool(row.TrackInventory) ?? true,
    base_unit: str(row, 'UnitOfMeasure') ?? 'each',
    purchase_unit: str(row, 'PurchaseUnit') ?? 'each',
    purchase_to_base_ratio: str(row, 'PurchaseToBaseRatio') ?? '1',
    costing_method: 'fifo',
    standard_cost: str(row, 'StandardCost'),
    reorder_point: str(row, 'ReorderPoint'),
    reorder_quantity: str(row, 'ReorderQuantity'),
    par_level: str(row, 'ParLevel'),
    allow_negative: bitToBool(row.AllowNegative) ?? false,
    metadata: JSON.stringify({ legacyId: row.InventoryItemId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformPurchaseOrder(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_PurchaseOrder', row.PurchaseOrderId as number, 'inventory_movements', tenantId);
  const locationId = await idMap.resolve('GF_CourseInfo', row.CourseId);
  const inventoryItemId = await idMap.resolve('GF_InventoryItem', row.InventoryItemId);

  if (!inventoryItemId) return null;

  return {
    id,
    tenant_id: tenantId,
    location_id: locationId,
    inventory_item_id: inventoryItemId,
    movement_type: 'receive',
    quantity_delta: str(row, 'Quantity') ?? '0',
    unit_cost: str(row, 'UnitCost'),
    extended_cost: str(row, 'ExtendedCost'),
    reference_type: 'purchase_order',
    reference_id: String(row.PurchaseOrderId),
    reason: str(row, 'Notes'),
    source: 'manual',
    business_date: dateToDate(row.ReceivedDate) ?? dateToDate(row.OrderDate),
    metadata: JSON.stringify({ legacyId: row.PurchaseOrderId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    created_by: str(row, 'CreatedBy') ?? 'migration',
  };
}

// ── 6. Memberships ───────────────────────────────────────────────

async function transformClassTypeClub(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_ClassTypeClub', row.ClassTypeClubId as number, 'membership_plans', tenantId);

  return {
    id,
    tenant_id: tenantId,
    name: str(row, 'Title') ?? str(row, 'ClassName') ?? 'Unnamed Plan',
    description: str(row, 'Description'),
    billing_interval: 'monthly',
    price_cents: moneyToCents(row.Price) ?? 0,
    billing_enabled: bitToBool(row.BillingEnabled) ?? true,
    privileges: JSON.stringify([]),
    is_active: bitToBool(row.IsActive) ?? true,
    enable_online_sale: bitToBool(row.EnableOnlineSale) ?? false,
    tee_sheet_color: str(row, 'TeeSheetColor'),
    terms_and_conditions: str(row, 'TermsAndConditions'),
    cancellation_policy: str(row, 'CancellationPolicy'),
    prorate_on_sale: bitToBool(row.ProrateOnSale) ?? false,
    max_assignments: int(row, 'MaxAssignments'),
    display_sequence: int(row, 'DisplaySequence') ?? 0,
    account_type: str(row, 'AccountType'),
    metadata: JSON.stringify({ legacyId: row.ClassTypeClubId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformCustomerClassType(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_CustomerClassType', row.CustomerClassTypeId as number, 'customer_memberships', tenantId);
  const customerId = await idMap.resolve('GF_Customer', row.CustomerId);
  const planId = await idMap.resolve('GF_ClassTypeClub', row.ClassTypeClubId);

  if (!customerId || !planId) return null;

  return {
    id,
    tenant_id: tenantId,
    customer_id: customerId,
    plan_id: planId,
    billing_account_id: str(row, 'BillingAccountId') ?? 'PENDING',
    status: cleanStatus(row.Status, 'membership') ?? 'active',
    start_date: dateToDate(row.StartDate) ?? new Date().toISOString().slice(0, 10),
    end_date: dateToDate(row.EndDate),
    renewal_date: dateToDate(row.RenewalDate),
    cancel_reason: str(row, 'CancelReason'),
    metadata: JSON.stringify({ legacyId: row.CustomerClassTypeId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 7. Tee Times ─────────────────────────────────────────────────

async function transformTeeBooking(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_TeeBooking', row.TeeBookingId as number, 'tee_bookings', tenantId);
  const courseId = await idMap.resolve('GF_CourseInfo', row.CourseId);
  const orderId = await idMap.resolve('GF_Order', row.OrderId);

  return {
    id,
    tenant_id: tenantId,
    course_id: courseId,
    tee_date: dateToDate(row.TeeDate) ?? new Date().toISOString().slice(0, 10),
    holes: int(row, 'Holes') ?? 18,
    players: int(row, 'Players') ?? 1,
    carts: int(row, 'Carts') ?? 0,
    check_in_status: cleanStatus(row.CheckInStatus, 'checkin') ?? 'pending',
    order_id: orderId,
    cart_total_cents: moneyToCents(row.CartTotal) ?? 0,
    booking_total_cents: moneyToCents(row.BookingTotal) ?? 0,
    payment_status: cleanStatus(row.PaymentStatus, 'payment') ?? 'unpaid',
    booking_source: str(row, 'BookingSource') ?? 'manual',
    is_valid: bitToBool(row.IsValid) ?? true,
    notes: str(row, 'Notes'),
    booking_clerk_name: str(row, 'BookingClerkName'),
    no_show: bitToBool(row.NoShow) ?? false,
    cancelled_at: datetimeToTimestamptz(row.CancelledDate),
    metadata: JSON.stringify({ legacyId: row.TeeBookingId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformTeeBookingGroupMember(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_TeeBookingGroupMember', row.TeeBookingGroupMemberId as number, 'tee_booking_players', tenantId);
  const teeBookingId = await idMap.resolve('GF_TeeBooking', row.TeeBookingId);
  const customerId = await idMap.resolve('GF_Customer', row.CustomerId);

  if (!teeBookingId) return null;

  return {
    id,
    tenant_id: tenantId,
    tee_booking_id: teeBookingId,
    customer_id: customerId,
    first_name: str(row, 'FirstName'),
    last_name: str(row, 'LastName'),
    email: cleanEmail(row.Email),
    mobile_no: cleanPhone(row.MobileNo),
    is_organiser: bitToBool(row.IsOrganiser) ?? false,
    price_cents: moneyToCents(row.Price) ?? 0,
    unit_price_cents: moneyToCents(row.UnitPrice) ?? 0,
    unit_list_price_cents: moneyToCents(row.UnitListPrice) ?? 0,
    discount_amount_cents: moneyToCents(row.DiscountAmount) ?? 0,
    tax_amount_cents: moneyToCents(row.TaxAmount) ?? 0,
    is_anonymous: bitToBool(row.IsAnonymous) ?? false,
    check_in_status: cleanStatus(row.CheckInStatus, 'checkin') ?? 'pending',
    payment_status: cleanStatus(row.PaymentStatus, 'payment') ?? 'unpaid',
    notes: str(row, 'Notes'),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformTeeSeason(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_TeeSeason', row.TeeSeasonId as number, 'tee_seasons', tenantId);
  const courseId = await idMap.resolve('GF_CourseInfo', row.CourseId);

  return {
    id,
    tenant_id: tenantId,
    course_id: courseId,
    title: str(row, 'Title') ?? 'Unnamed Season',
    start_date: dateToDate(row.StartDate) ?? '2020-01-01',
    end_date: dateToDate(row.EndDate) ?? '2025-12-31',
    cart_price_9_cents: moneyToCents(row.CartPrice9Hole),
    cart_price_18_cents: moneyToCents(row.CartPrice18Hole),
    position: int(row, 'Position') ?? 0,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformTeeSchedule(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_TeeSchedule', row.TeeScheduleId as number, 'tee_sheets', tenantId);
  const courseId = await idMap.resolve('GF_CourseInfo', row.CourseId);
  const teeSeasonId = await idMap.resolve('GF_TeeSeason', row.TeeSeasonId);

  return {
    id,
    tenant_id: tenantId,
    course_id: courseId,
    tee_season_id: teeSeasonId,
    start_time: str(row, 'StartTime') ?? '06:00',
    end_time: str(row, 'EndTime') ?? '18:00',
    interval_minutes: int(row, 'IntervalMinutes') ?? 10,
    monday: bitToBool(row.Monday) ?? true,
    tuesday: bitToBool(row.Tuesday) ?? true,
    wednesday: bitToBool(row.Wednesday) ?? true,
    thursday: bitToBool(row.Thursday) ?? true,
    friday: bitToBool(row.Friday) ?? true,
    saturday: bitToBool(row.Saturday) ?? true,
    sunday: bitToBool(row.Sunday) ?? true,
    interval_type: str(row, 'IntervalType') ?? 'fixed',
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 8. Events ────────────────────────────────────────────────────

async function transformCourseEvent(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_CourseEvents', row.CourseEventId as number, 'events', tenantId);

  return {
    id,
    tenant_id: tenantId,
    title: str(row, 'Title') ?? str(row, 'EventName') ?? 'Unnamed Event',
    description: str(row, 'Description'),
    event_type: str(row, 'EventType') ?? 'general',
    status: cleanStatus(row.Status, 'event') ?? 'draft',
    venue: str(row, 'Venue'),
    start_date: dateToDate(row.StartDate) ?? new Date().toISOString().slice(0, 10),
    end_date: dateToDate(row.EndDate) ?? dateToDate(row.StartDate) ?? new Date().toISOString().slice(0, 10),
    start_time: str(row, 'StartTime'),
    end_time: str(row, 'EndTime'),
    signup_fee_cents: moneyToCents(row.SignupFee) ?? 0,
    banner_image_url: str(row, 'BannerImageUrl'),
    max_registrants: int(row, 'MaxRegistrants'),
    is_tax_exempt: bitToBool(row.IsTaxExempt) ?? false,
    is_closed: bitToBool(row.IsClosed) ?? false,
    closed_date: dateToDate(row.ClosedDate),
    metadata: JSON.stringify({ legacyId: row.CourseEventId }),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformEventGolfer(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_EventGolfers', row.EventGolferId as number, 'event_golfers', tenantId);
  const eventId = await idMap.resolve('GF_CourseEvents', row.CourseEventId);
  const customerId = await idMap.resolve('GF_Customer', row.CustomerId);

  if (!eventId) return null;

  return {
    id,
    tenant_id: tenantId,
    event_id: eventId,
    customer_id: customerId,
    fee_price_cents: moneyToCents(row.FeePrice) ?? 0,
    source: str(row, 'Source'),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
  };
}

// ── 9. Courses ───────────────────────────────────────────────────

async function transformCourseInfo(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_CourseInfo', row.CourseId as number, 'courses', tenantId);
  const locationId = await idMap.resolve('locations', row.CourseId) ?? id; // fallback: courseId IS locationId in legacy

  // Build course row
  const courseRow: RawRow = {
    id,
    tenant_id: tenantId,
    location_id: locationId,
    name: str(row, 'CourseName') ?? str(row, 'Title') ?? 'Unnamed Course',
    course_type: str(row, 'CourseType') ?? 'standard',
    total_holes: int(row, 'TotalHoles') ?? 18,
    total_par: int(row, 'TotalPar'),
    slope_rating: str(row, 'SlopeRating'),
    course_rating: str(row, 'CourseRating'),
    green_grass_type: str(row, 'GreenGrassType'),
    fairway_grass_type: str(row, 'FairwayGrassType'),
    year_built: int(row, 'YearBuilt'),
    description: str(row, 'Description'),
    is_active: bitToBool(row.IsActive) ?? true,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };

  // Split denormalized hole data into rows
  const holes: RawRow[] = [];
  const totalHoles = int(row, 'TotalHoles') ?? 18;
  for (let h = 1; h <= totalHoles; h++) {
    const par = int(row, `Hole${h}Par`);
    if (par == null) continue;
    holes.push({
      tenant_id: tenantId,
      course_id: id,
      hole_number: h,
      par,
      yardage_white: int(row, `Hole${h}YardageWhite`),
      yardage_blue: int(row, `Hole${h}YardageBlue`),
      yardage_red: int(row, `Hole${h}YardageRed`),
      handicap: int(row, `Hole${h}Handicap`),
      created_at: courseRow.created_at,
    });
  }

  return [courseRow, ...holes];
}

// ── 10. Departments ──────────────────────────────────────────────

async function transformDepartment(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_Department', row.DepartmentId as number, 'departments', tenantId);

  return {
    id,
    tenant_id: tenantId,
    name: str(row, 'DepartmentName') ?? str(row, 'Title') ?? 'Unnamed Department',
    is_active: bitToBool(row.IsActive) ?? true,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 11. Terminals ────────────────────────────────────────────────

async function transformTerminal(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_Terminal', row.TerminalId as number, 'terminals', tenantId);
  const terminalLocationId = await idMap.resolve('GF_TerminalLocation', row.TerminalLocationId);

  if (!terminalLocationId) return null;

  return {
    id,
    tenant_id: tenantId,
    terminal_location_id: terminalLocationId,
    title: str(row, 'Title') ?? str(row, 'TerminalName') ?? 'Unnamed Terminal',
    shows_desktop_notification: bitToBool(row.ShowsDesktopNotification) ?? false,
    requires_pin_on_quick_tab: bitToBool(row.RequiresPinOnQuickTab) ?? false,
    lock_screen: bitToBool(row.LockScreen) ?? false,
    auto_pin_lock_idle_seconds: int(row, 'AutoPinLockIdleSeconds'),
    auto_logout_idle_seconds: int(row, 'AutoLogoutIdleSeconds'),
    auto_save_register_tabs: bitToBool(row.AutoSaveRegisterTabs) ?? false,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformTerminalLocation(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_TerminalLocation', row.TerminalLocationId as number, 'terminal_locations', tenantId);

  return {
    id,
    tenant_id: tenantId,
    title: str(row, 'Title') ?? str(row, 'LocationName') ?? 'Unnamed Location',
    tips_applicable: bitToBool(row.TipsApplicable) ?? true,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 12. Discounts ────────────────────────────────────────────────

async function transformDiscount(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_Discount', row.DiscountId as number, 'discounts', tenantId);

  const percentage = num(row, 'DiscountPercentage');
  const amount = moneyToCents(row.DiscountAmount);

  return {
    id,
    tenant_id: tenantId,
    title: str(row, 'Title') ?? str(row, 'DiscountName') ?? 'Unnamed Discount',
    value_type: percentage != null ? 'percentage' : 'fixed',
    value_percentage: percentage != null ? String(percentage) : null,
    value_amount_cents: amount,
    is_active: bitToBool(row.IsActive) ?? true,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 13. Employees ────────────────────────────────────────────────

async function transformEmployeeTimeLogEntry(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_EmployeeTimeLogEntry', row.EmployeeTimeLogEntryId as number, 'employee_time_entries', tenantId);

  return {
    id,
    tenant_id: tenantId,
    employee_id: str(row, 'EmployeeId') ?? 'UNKNOWN',
    role_id: str(row, 'RoleId'),
    clock_in_time: datetimeToTimestamptz(row.ClockInTime) ?? new Date().toISOString(),
    clock_out_time: datetimeToTimestamptz(row.ClockOutTime),
    clock_in_source: str(row, 'ClockInSource') ?? 'manual',
    clock_out_source: str(row, 'ClockOutSource'),
    approval_status: str(row, 'ApprovalStatus') ?? 'pending',
    admin_comment: str(row, 'AdminComment'),
    comment: str(row, 'Comment'),
    cash_tip_cents: moneyToCents(row.CashTip) ?? 0,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 14. Communications ───────────────────────────────────────────

async function transformEmailTemplate(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_EmailTemplates', row.EmailTemplateId as number, 'email_templates', tenantId);
  const courseId = await idMap.resolve('GF_CourseInfo', row.CourseId);

  return {
    id,
    tenant_id: tenantId,
    name: str(row, 'TemplateName') ?? str(row, 'Title') ?? 'Unnamed Template',
    subject: str(row, 'Subject'),
    body: str(row, 'Body') ?? '',
    html_path: str(row, 'HtmlPath'),
    css_path: str(row, 'CssPath'),
    logo_path: str(row, 'LogoPath'),
    course_id: courseId,
    original_body: str(row, 'OriginalBody'),
    is_active: bitToBool(row.IsActive) ?? true,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformMassMessage(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_MassMessages', row.MassMessageId as number, 'mass_messages', tenantId);

  return {
    id,
    tenant_id: tenantId,
    title: str(row, 'Title') ?? str(row, 'Subject') ?? 'Unnamed Message',
    body: str(row, 'Body') ?? str(row, 'Message') ?? '',
    status: cleanStatus(row.Status, 'message') ?? 'sent',
    recipient_type: str(row, 'RecipientType'),
    sent_count: int(row, 'SentCount') ?? 0,
    failed_count: int(row, 'FailedCount') ?? 0,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
    created_by: str(row, 'CreatedBy'),
  };
}

// ── 15. Reservations ─────────────────────────────────────────────

async function transformReservationResource(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_ReservationResource', row.ReservationResourceId as number, 'reservation_resources', tenantId);
  const typeId = await idMap.resolve('GF_ReservationResourceType', row.ResourceTypeId);

  if (!typeId) return null;

  return {
    id,
    tenant_id: tenantId,
    title: str(row, 'Title') ?? str(row, 'ResourceName') ?? 'Unnamed Resource',
    type_id: typeId,
    available_online: bitToBool(row.AvailableOnline) ?? false,
    display_sequence: int(row, 'DisplaySequence') ?? 0,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 16. Vouchers ─────────────────────────────────────────────────

async function transformVoucherType(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_ClubVoucherType', row.ClubVoucherTypeId as number, 'voucher_types', tenantId);

  return {
    id,
    tenant_id: tenantId,
    name: str(row, 'Title') ?? str(row, 'VoucherTypeName') ?? 'Unnamed Voucher Type',
    voucher_type: str(row, 'VoucherType') ?? 'gift_card',
    available_online: bitToBool(row.AvailableOnline) ?? false,
    available_for_pos_sale: bitToBool(row.AvailableForPosSale) ?? false,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

async function transformCreditVoucher(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_CreditVoucher', row.CreditVoucherId as number, 'vouchers', tenantId);
  const voucherTypeId = await idMap.resolve('GF_ClubVoucherType', row.ClubVoucherTypeId);
  const customerId = await idMap.resolve('GF_Customer', row.CustomerId);

  return {
    id,
    tenant_id: tenantId,
    voucher_type_id: voucherTypeId,
    voucher_number: str(row, 'VoucherNumber') ?? `LEGACY-${row.CreditVoucherId}`,
    voucher_amount_cents: moneyToCents(row.VoucherAmount) ?? 0,
    redeemed_amount_cents: moneyToCents(row.RedeemedAmount) ?? 0,
    redemption_status: cleanStatus(row.RedemptionStatus, 'voucher') ?? 'unredeemed',
    validity_start_date: dateToDate(row.ValidityStartDate),
    validity_end_date: dateToDate(row.ValidityEndDate),
    customer_id: customerId,
    first_name: str(row, 'FirstName'),
    last_name: str(row, 'LastName'),
    notes: str(row, 'Notes'),
    tax_cents: moneyToCents(row.Tax) ?? 0,
    total_cents: moneyToCents(row.Total) ?? 0,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 17. Loyalty ──────────────────────────────────────────────────

async function transformLoyaltyLedger(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_LoyaltyLedger', row.LoyaltyLedgerId as number, 'loyalty_ledger_entries', tenantId);
  const customerId = await idMap.resolve('GF_Customer', row.CustomerId);

  if (!customerId) return null;

  return {
    id,
    tenant_id: tenantId,
    customer_id: customerId,
    ledger_type: str(row, 'LedgerType') ?? 'earn',
    points: int(row, 'Points') ?? 0,
    balance: int(row, 'Balance') ?? 0,
    entity_id: str(row, 'EntityId'),
    entity_type: str(row, 'EntityType'),
    description: str(row, 'Description'),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 18. Management Companies ─────────────────────────────────────

async function transformManagementCompany(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_ManagementCompany', row.ManagementCompanyId as number, 'management_companies', tenantId);

  return {
    id,
    tenant_id: tenantId,
    name: str(row, 'CompanyName') ?? str(row, 'Title') ?? 'Unnamed Company',
    has_common_gift_cards: bitToBool(row.HasCommonGiftCards) ?? false,
    has_common_customer: bitToBool(row.HasCommonCustomer) ?? false,
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ── 19. Punch Cards ──────────────────────────────────────────────

async function transformPunchCard(row: RawRow, idMap: IdMap, tenantId: string) {
  const id = await idMap.getOrCreate('GF_PunchCard', row.PunchCardId as number, 'punch_cards', tenantId);
  const punchCardTypeId = await idMap.resolve('GF_PunchCardType', row.PunchCardTypeId);
  const customerId = await idMap.resolve('GF_Customer', row.CustomerId);

  if (!punchCardTypeId || !customerId) return null;

  return {
    id,
    tenant_id: tenantId,
    punch_card_type_id: punchCardTypeId,
    customer_id: customerId,
    title: str(row, 'Title'),
    description: str(row, 'Description'),
    amount_cents: moneyToCents(row.Amount) ?? 0,
    total_cents: moneyToCents(row.Total) ?? 0,
    card_number: str(row, 'CardNumber'),
    card_number_type: str(row, 'CardNumberType'),
    expiration_date: dateToDate(row.ExpirationDate),
    created_at: datetimeToTimestamptz(row.CreateDate) ?? new Date().toISOString(),
    updated_at: datetimeToTimestamptz(row.LastModifiedDate) ?? new Date().toISOString(),
  };
}

// ─── Table Handler Interface ─────────────────────────────────────

export interface TableHandler {
  sourceTable: string;
  targetTable: string;
  skipDeleted?: boolean;
  deletedColumn?: string;
  transform: (row: RawRow, idMap: IdMap, tenantId: string) => Promise<RawRow | RawRow[] | null>;
  dependsOn?: string[];
}

// ─── Transformer Registry ────────────────────────────────────────

export const TRANSFORMER_REGISTRY: Record<string, TableHandler[]> = {
  customers: [
    {
      sourceTable: 'GF_Customer',
      targetTable: 'customers',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformCustomer,
    },
  ],

  orders: [
    {
      sourceTable: 'GF_Order',
      targetTable: 'orders',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformOrder,
      dependsOn: ['customers', 'courses', 'terminals'],
    },
    {
      sourceTable: 'GF_OrderDetails',
      targetTable: 'order_lines',
      transform: transformOrderDetail,
      dependsOn: ['orders', 'catalog'],
    },
    {
      sourceTable: 'GF_OrderLineItem',
      targetTable: 'order_lines',
      transform: transformOrderLineItem,
      dependsOn: ['orders', 'catalog'],
    },
  ],

  catalog: [
    {
      sourceTable: 'GF_Category',
      targetTable: 'catalog_categories',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformCategory,
    },
    {
      sourceTable: 'GF_MenuItems',
      targetTable: 'catalog_items',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformMenuItem,
      dependsOn: ['catalog'], // depends on categories being loaded first
    },
    {
      sourceTable: 'GF_CourseFoodItemDetail',
      targetTable: 'catalog_items',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformCourseFoodItem,
      dependsOn: ['catalog'],
    },
  ],

  payments: [
    {
      sourceTable: 'GF_PaymentMethod',
      targetTable: 'tenders',
      transform: transformPaymentMethod,
      dependsOn: ['orders', 'courses'],
    },
  ],

  inventory: [
    {
      sourceTable: 'GF_InventoryItem',
      targetTable: 'inventory_items',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformInventoryItem,
      dependsOn: ['catalog', 'courses'],
    },
    {
      sourceTable: 'GF_PurchaseOrder',
      targetTable: 'inventory_movements',
      transform: transformPurchaseOrder,
      dependsOn: ['inventory'],
    },
  ],

  memberships: [
    {
      sourceTable: 'GF_ClassTypeClub',
      targetTable: 'membership_plans',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformClassTypeClub,
    },
    {
      sourceTable: 'GF_CustomerClassType',
      targetTable: 'customer_memberships',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformCustomerClassType,
      dependsOn: ['customers', 'memberships'],
    },
  ],

  tee_times: [
    {
      sourceTable: 'GF_TeeSeason',
      targetTable: 'tee_seasons',
      transform: transformTeeSeason,
      dependsOn: ['courses'],
    },
    {
      sourceTable: 'GF_TeeSchedule',
      targetTable: 'tee_sheets',
      transform: transformTeeSchedule,
      dependsOn: ['courses', 'tee_times'], // depends on tee_seasons
    },
    {
      sourceTable: 'GF_TeeBooking',
      targetTable: 'tee_bookings',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformTeeBooking,
      dependsOn: ['courses', 'orders'],
    },
    {
      sourceTable: 'GF_TeeBookingGroupMember',
      targetTable: 'tee_booking_players',
      transform: transformTeeBookingGroupMember,
      dependsOn: ['tee_times', 'customers'],
    },
  ],

  events: [
    {
      sourceTable: 'GF_CourseEvents',
      targetTable: 'events',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformCourseEvent,
    },
    {
      sourceTable: 'GF_EventGolfers',
      targetTable: 'event_golfers',
      transform: transformEventGolfer,
      dependsOn: ['events', 'customers'],
    },
  ],

  courses: [
    {
      sourceTable: 'GF_CourseInfo',
      targetTable: 'courses',
      transform: transformCourseInfo,
      // Returns [courseRow, ...holeRows] — loader must split and insert into courses + course_holes
    },
  ],

  departments: [
    {
      sourceTable: 'GF_Department',
      targetTable: 'departments',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformDepartment,
    },
  ],

  terminals: [
    {
      sourceTable: 'GF_TerminalLocation',
      targetTable: 'terminal_locations',
      transform: transformTerminalLocation,
    },
    {
      sourceTable: 'GF_Terminal',
      targetTable: 'terminals',
      transform: transformTerminal,
      dependsOn: ['terminals'], // depends on terminal_locations
    },
  ],

  discounts: [
    {
      sourceTable: 'GF_Discount',
      targetTable: 'discounts',
      skipDeleted: true,
      deletedColumn: 'IsDeleted',
      transform: transformDiscount,
    },
  ],

  employees: [
    {
      sourceTable: 'GF_EmployeeTimeLogEntry',
      targetTable: 'employee_time_entries',
      transform: transformEmployeeTimeLogEntry,
    },
  ],

  communications: [
    {
      sourceTable: 'GF_EmailTemplates',
      targetTable: 'email_templates',
      transform: transformEmailTemplate,
    },
    {
      sourceTable: 'GF_MassMessages',
      targetTable: 'mass_messages',
      transform: transformMassMessage,
    },
  ],

  reservations: [
    {
      sourceTable: 'GF_ReservationResource',
      targetTable: 'reservation_resources',
      transform: transformReservationResource,
    },
  ],

  vouchers: [
    {
      sourceTable: 'GF_ClubVoucherType',
      targetTable: 'voucher_types',
      transform: transformVoucherType,
    },
    {
      sourceTable: 'GF_CreditVoucher',
      targetTable: 'vouchers',
      transform: transformCreditVoucher,
      dependsOn: ['vouchers', 'customers'], // depends on voucher_types
    },
  ],

  loyalty: [
    {
      sourceTable: 'GF_LoyaltyLedger',
      targetTable: 'loyalty_ledger_entries',
      transform: transformLoyaltyLedger,
      dependsOn: ['customers'],
    },
  ],

  management_co: [
    {
      sourceTable: 'GF_ManagementCompany',
      targetTable: 'management_companies',
      transform: transformManagementCompany,
    },
  ],

  punch_cards: [
    {
      sourceTable: 'GF_PunchCard',
      targetTable: 'punch_cards',
      transform: transformPunchCard,
      dependsOn: ['customers'],
    },
  ],
};
