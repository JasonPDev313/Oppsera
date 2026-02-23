const postgres = require('postgres');
const sql = postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres');

const TENANT_ID = '01KHY880B3SR174K8B4MBQV043';
const ROBERT_CUSTOMER_ID = '01KHY880GECTSQKJAS2WK8P705';
const SARAH_CUSTOMER_ID = '01KHY880GECTSQKJAS2WK8P706';
const GOLD_PLAN_ID = '01KHY880H91AMQC6RY7HQGE3J1';
const SILVER_PLAN_ID = '01KHY880H91AMQC6RY7HQGE3J2';
const BILLING_ACCT_ID = '01KHY880HDES2NARZ4QGF1SM9Z';

let counter = 0;
function id() { return 'SEEDMBR' + String(++counter).padStart(4, '0') + Date.now().toString(36).slice(-6); }

async function main() {
  await sql`SELECT set_config('app.current_tenant_id', ${TENANT_ID}, false)`;

  // 1. Membership account for Robert Johnson
  const robertAcctId = id();
  await sql`INSERT INTO membership_accounts (id, tenant_id, account_number, status, start_date, primary_member_id, customer_id, billing_email, statement_day_of_month, payment_terms_days, autopay_enabled, credit_limit_cents, hold_charging, billing_account_id, created_at, updated_at)
  VALUES (${robertAcctId}, ${TENANT_ID}, 'MBR-2025-001', 'active', '2025-01-01', ${ROBERT_CUSTOMER_ID}, ${ROBERT_CUSTOMER_ID}, 'rjohnson@example.com', 1, 30, true, 500000, false, ${BILLING_ACCT_ID}, NOW(), NOW())`;
  console.log('Created membership account for Robert:', robertAcctId);

  // 2. Membership account for Sarah Smith
  const sarahAcctId = id();
  await sql`INSERT INTO membership_accounts (id, tenant_id, account_number, status, start_date, primary_member_id, customer_id, billing_email, statement_day_of_month, payment_terms_days, autopay_enabled, credit_limit_cents, hold_charging, created_at, updated_at)
  VALUES (${sarahAcctId}, ${TENANT_ID}, 'MBR-2025-002', 'active', '2025-03-15', ${SARAH_CUSTOMER_ID}, ${SARAH_CUSTOMER_ID}, 'ssmith@example.com', 15, 30, false, 300000, false, NOW(), NOW())`;
  console.log('Created membership account for Sarah:', sarahAcctId);

  // 3. Members
  await sql`INSERT INTO membership_members (id, tenant_id, membership_account_id, customer_id, role, member_number, status, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${robertAcctId}, ${ROBERT_CUSTOMER_ID}, 'primary', 'MEM-001', 'active', NOW(), NOW())`;
  await sql`INSERT INTO membership_members (id, tenant_id, membership_account_id, customer_id, role, member_number, status, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${sarahAcctId}, ${SARAH_CUSTOMER_ID}, 'primary', 'MEM-002', 'active', NOW(), NOW())`;
  console.log('Created members');

  // 4. Classes
  await sql`INSERT INTO membership_classes (id, tenant_id, membership_account_id, class_name, effective_date, is_archived, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${robertAcctId}, 'Gold', '2025-01-01', false, NOW(), NOW())`;
  await sql`INSERT INTO membership_classes (id, tenant_id, membership_account_id, class_name, effective_date, is_archived, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${sarahAcctId}, 'Silver', '2025-03-15', false, NOW(), NOW())`;
  console.log('Created classes');

  // 5. Billing items
  await sql`INSERT INTO membership_billing_items (id, tenant_id, membership_account_id, description, amount_cents, frequency, is_active, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${robertAcctId}, 'Monthly Gold Dues', 29900, 'monthly', true, NOW(), NOW())`;
  await sql`INSERT INTO membership_billing_items (id, tenant_id, membership_account_id, description, amount_cents, frequency, is_active, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${sarahAcctId}, 'Monthly Silver Dues', 14900, 'monthly', true, NOW(), NOW())`;
  console.log('Created billing items');

  // 6. Subscriptions
  await sql`INSERT INTO membership_subscriptions (id, tenant_id, membership_account_id, plan_id, status, effective_start, next_bill_date, last_billed_date, billed_through_date, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${robertAcctId}, ${GOLD_PLAN_ID}, 'active', '2025-01-01', '2026-03-01', '2026-02-01', '2026-02-28', NOW(), NOW())`;
  await sql`INSERT INTO membership_subscriptions (id, tenant_id, membership_account_id, plan_id, status, effective_start, next_bill_date, last_billed_date, billed_through_date, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${sarahAcctId}, ${SILVER_PLAN_ID}, 'active', '2025-03-15', '2026-03-15', '2026-02-15', '2026-02-28', NOW(), NOW())`;
  console.log('Created subscriptions');

  // 7. Statements for Robert (last 3 months)
  const stmts = [
    ['2025-12-01','2025-12-31','STMT-2025-12-001', 'paid'],
    ['2026-01-01','2026-01-31','STMT-2026-01-001', 'paid'],
    ['2026-02-01','2026-02-28','STMT-2026-02-001', 'open'],
  ];
  for (const [pStart, pEnd, num, status] of stmts) {
    await sql`INSERT INTO statements (id, tenant_id, billing_account_id, membership_account_id, period_start, period_end, opening_balance_cents, charges_cents, payments_cents, late_fees_cents, closing_balance_cents, due_date, status, statement_number, delivery_status, created_at)
    VALUES (${id()}, ${TENANT_ID}, ${BILLING_ACCT_ID}, ${robertAcctId}, ${pStart}, ${pEnd}, 0, 29900, ${status === 'paid' ? 29900 : 0}, 0, ${status === 'paid' ? 0 : 29900}, ${pEnd}, ${status}, ${num}, 'delivered', NOW())`;
  }
  console.log('Created 3 statements for Robert');

  // 8. Authorized user
  await sql`INSERT INTO membership_authorized_users (id, tenant_id, membership_account_id, name, relationship, effective_date, status, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${robertAcctId}, 'Emily Johnson', 'spouse', '2025-01-01', 'active', NOW(), NOW())`;
  console.log('Created authorized user');

  // 9. Autopay profile
  await sql`INSERT INTO autopay_profiles (id, tenant_id, membership_account_id, strategy, is_active, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, ${robertAcctId}, 'full_balance', true, NOW(), NOW())`;
  console.log('Created autopay profile');

  // 10. Update Robert's customer email to match admin user for portal access
  await sql`UPDATE customers SET email = 'admin@sunsetgolf.test' WHERE id = ${ROBERT_CUSTOMER_ID}`;
  console.log('Updated Robert email -> admin@sunsetgolf.test (for portal access)');

  // 11. Accounting settings
  await sql`INSERT INTO membership_accounting_settings (id, tenant_id, club_model, created_at, updated_at)
  VALUES (${id()}, ${TENANT_ID}, 'for_profit', NOW(), NOW())`;
  console.log('Created accounting settings');

  console.log('\n=== Membership seed complete! ===');
  console.log('Robert Johnson (MBR-2025-001) - Gold, active, autopay, $5k credit limit');
  console.log('Sarah Smith (MBR-2025-002) - Silver, active, $3k credit limit');
  console.log('\nLogin: admin@sunsetgolf.test (any password with DEV_AUTH_BYPASS=true)');
  console.log('URL: http://localhost:3000/member-portal');

  await sql.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
