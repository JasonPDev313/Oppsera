/**
 * Fix GL Accounts + Transaction Type Mappings
 *
 * Creates any missing GL accounts required for proper double-entry accounting,
 * then maps all system transaction types (41 base + 24 discount/comp) with
 * PwC-standard debit/credit assignments.
 *
 * Idempotent — safe to run multiple times. Uses ON CONFLICT DO NOTHING for accounts
 * and UPSERT for mappings.
 *
 * Usage:
 *   pnpm tsx tools/scripts/fix-transaction-type-mappings.ts              # local DB
 *   pnpm tsx tools/scripts/fix-transaction-type-mappings.ts --remote      # production DB
 */
import dotenv from 'dotenv';

const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '.env.remote', override: true });
}
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';

interface AccountDef {
  number: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  classification: string;
  isControlAccount: boolean;
  controlAccountType: string | null;
  sortOrder: number;
}

const REQUIRED_ACCOUNTS: AccountDef[] = [
  { number: '1010', name: 'Cash on Hand',               type: 'asset',     normalBalance: 'debit',  classification: 'Cash & Bank',             isControlAccount: false, controlAccountType: null,              sortOrder: 10 },
  { number: '1020', name: 'Operating Checking',         type: 'asset',     normalBalance: 'debit',  classification: 'Cash & Bank',             isControlAccount: false, controlAccountType: null,              sortOrder: 20 },
  { number: '1050', name: 'Undeposited Funds',          type: 'asset',     normalBalance: 'debit',  classification: 'Cash & Bank',             isControlAccount: true,  controlAccountType: 'undeposited_funds', sortOrder: 40 },
  { number: '1100', name: 'Accounts Receivable',        type: 'asset',     normalBalance: 'debit',  classification: 'Receivables',             isControlAccount: true,  controlAccountType: 'ar',              sortOrder: 50 },
  { number: '1150', name: 'Member Receivables',         type: 'asset',     normalBalance: 'debit',  classification: 'Receivables',             isControlAccount: false, controlAccountType: null,              sortOrder: 60 },
  { number: '1200', name: 'Inventory - Pro Shop',       type: 'asset',     normalBalance: 'debit',  classification: 'Inventory',               isControlAccount: false, controlAccountType: null,              sortOrder: 70 },
  { number: '1210', name: 'Inventory - F&B',            type: 'asset',     normalBalance: 'debit',  classification: 'Inventory',               isControlAccount: false, controlAccountType: null,              sortOrder: 80 },
  { number: '2000', name: 'Accounts Payable',           type: 'liability', normalBalance: 'credit', classification: 'Payables',                isControlAccount: true,  controlAccountType: 'ap',              sortOrder: 200 },
  { number: '2100', name: 'Sales Tax Payable',          type: 'liability', normalBalance: 'credit', classification: 'Tax Liabilities',         isControlAccount: true,  controlAccountType: 'sales_tax',       sortOrder: 210 },
  { number: '2160', name: 'Tips Payable',               type: 'liability', normalBalance: 'credit', classification: 'Accrued Liabilities',     isControlAccount: false, controlAccountType: null,              sortOrder: 225 },
  { number: '2200', name: 'Gift Card Liability',        type: 'liability', normalBalance: 'credit', classification: 'Deferred Revenue',        isControlAccount: false, controlAccountType: null,              sortOrder: 230 },
  { number: '2300', name: 'Deferred Revenue - Memberships', type: 'liability', normalBalance: 'credit', classification: 'Deferred Revenue',    isControlAccount: false, controlAccountType: null,              sortOrder: 240 },
  { number: '2310', name: 'Deferred Revenue - Event Deposits', type: 'liability', normalBalance: 'credit', classification: 'Deferred Revenue', isControlAccount: false, controlAccountType: null,              sortOrder: 250 },
  { number: '2320', name: 'Customer Deposits Payable',  type: 'liability', normalBalance: 'credit', classification: 'Deferred Revenue',        isControlAccount: false, controlAccountType: null,              sortOrder: 255 },
  { number: '2400', name: 'Accrued Expenses',           type: 'liability', normalBalance: 'credit', classification: 'Accrued Liabilities',     isControlAccount: false, controlAccountType: null,              sortOrder: 260 },
  { number: '2500', name: 'Payroll Clearing',           type: 'liability', normalBalance: 'credit', classification: 'Accrued Liabilities',     isControlAccount: false, controlAccountType: null,              sortOrder: 270 },
  { number: '3000', name: 'Retained Earnings',          type: 'equity',    normalBalance: 'credit', classification: 'Retained Earnings',       isControlAccount: false, controlAccountType: null,              sortOrder: 300 },
  { number: '4010', name: 'Green Fees Revenue',         type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 400 },
  { number: '4030', name: 'Pro Shop Sales',             type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 420 },
  { number: '4040', name: 'F&B Sales',                  type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 430 },
  { number: '4050', name: 'Membership Dues',            type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 440 },
  { number: '4060', name: 'Event Revenue',              type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 450 },
  { number: '4090', name: 'Other Revenue',              type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 480 },
  { number: '4100', name: 'Sales Discounts - Manual',    type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 490 },
  { number: '4101', name: 'Promotional Discounts',      type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 491 },
  { number: '4102', name: 'Employee Discounts',          type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 492 },
  { number: '4103', name: 'Loyalty Program Discounts',   type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 493 },
  { number: '4104', name: 'Member Discounts',            type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 494 },
  { number: '4105', name: 'Price Match Adjustments',     type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 495 },
  { number: '4106', name: 'Volume / Quantity Discounts', type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 496 },
  { number: '4107', name: 'Senior / Military Discounts', type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 497 },
  { number: '4108', name: 'Group / Event Discounts',     type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 498 },
  { number: '4109', name: 'Seasonal / Clearance Markdowns', type: 'revenue', normalBalance: 'credit', classification: 'Discounts & Returns',    isControlAccount: false, controlAccountType: null,              sortOrder: 499 },
  { number: '4110', name: 'Returns & Allowances',       type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 500 },
  { number: '4111', name: 'Vendor-Funded Promotions',    type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 501 },
  { number: '4112', name: 'Rain Check Credits',          type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 502 },
  { number: '4113', name: 'Cash / Early Payment Discounts', type: 'revenue', normalBalance: 'credit', classification: 'Discounts & Returns',    isControlAccount: false, controlAccountType: null,              sortOrder: 503 },
  { number: '4114', name: 'Bundle / Package Discounts',  type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 504 },
  { number: '4115', name: 'Trade Discounts',             type: 'revenue',   normalBalance: 'credit', classification: 'Discounts & Returns',     isControlAccount: false, controlAccountType: null,              sortOrder: 505 },
  { number: '4500', name: 'Service Charge Revenue',     type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 550 },
  { number: '4510', name: 'Surcharge Revenue',          type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 551 },
  { number: '49900', name: 'Uncategorized Revenue',     type: 'revenue',   normalBalance: 'credit', classification: 'Operating Revenue',       isControlAccount: false, controlAccountType: null,              sortOrder: 990 },
  { number: '5010', name: 'Pro Shop COGS',              type: 'expense',   normalBalance: 'debit',  classification: 'Cost of Goods Sold',      isControlAccount: false, controlAccountType: null,              sortOrder: 600 },
  { number: '5020', name: 'F&B COGS',                   type: 'expense',   normalBalance: 'debit',  classification: 'Cost of Goods Sold',      isControlAccount: false, controlAccountType: null,              sortOrder: 610 },
  { number: '6100', name: 'Credit Card Processing Fees', type: 'expense',  normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 690 },
  // Comp / Write-off Expense accounts (6150–6158)
  { number: '6150', name: 'Manager Comps',              type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 695 },
  { number: '6151', name: 'Promotional Comps',          type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 696 },
  { number: '6152', name: 'Quality Recovery Expense',   type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 697 },
  { number: '6153', name: 'Price Override Loss',        type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 698 },
  { number: '6154', name: 'Other Comps & Write-offs',   type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 699 },
  { number: '6155', name: 'Spoilage & Waste Write-offs', type: 'expense',  normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 700 },
  { number: '6156', name: 'Charity / Donation Comps',   type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 701 },
  { number: '6157', name: 'Training & Staff Meals',     type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 702 },
  { number: '6158', name: 'Insurance Recovery Write-offs', type: 'expense', normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 703 },
  { number: '6160', name: 'Cash Over/Short',            type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 710 },
  { number: '6170', name: 'Chargeback Expense',         type: 'expense',   normalBalance: 'debit',  classification: 'Operating Expenses',      isControlAccount: false, controlAccountType: null,              sortOrder: 711 },
  { number: '9999', name: 'Rounding / Reconciliation',  type: 'expense',   normalBalance: 'debit',  classification: 'System Accounts',         isControlAccount: false, controlAccountType: null,              sortOrder: 999 },
];

interface MappingDef {
  code: string;
  debitAccountNumber: string | null;
  creditAccountNumber: string | null;
}

const TRANSACTION_TYPE_MAPPINGS: MappingDef[] = [
  // Tender types — debit only (revenue side handled by POS adapter per sub-department)
  { code: 'cash',               debitAccountNumber: '1010', creditAccountNumber: null },
  { code: 'card',               debitAccountNumber: '1050', creditAccountNumber: null },
  { code: 'ecom',               debitAccountNumber: '1050', creditAccountNumber: null },
  { code: 'check',              debitAccountNumber: '1010', creditAccountNumber: null },
  { code: 'ach',                debitAccountNumber: '1050', creditAccountNumber: null },
  { code: 'voucher',            debitAccountNumber: '2200', creditAccountNumber: null },
  { code: 'house_account',      debitAccountNumber: '1100', creditAccountNumber: null },
  { code: 'membership_payment', debitAccountNumber: '1150', creditAccountNumber: null },
  // Revenue events
  { code: 'gift_card_sold',     debitAccountNumber: '1010', creditAccountNumber: '2200' },
  { code: 'gift_card_redeemed', debitAccountNumber: '2200', creditAccountNumber: '4090' },
  { code: 'gift_card_expired',  debitAccountNumber: '2200', creditAccountNumber: '4090' },
  { code: 'tee_time',            debitAccountNumber: null,   creditAccountNumber: '4010' },
  { code: 'convenience_fee',    debitAccountNumber: null,   creditAccountNumber: '4510' },
  { code: 'event_registration', debitAccountNumber: null,   creditAccountNumber: '4060' },
  // Tax
  { code: 'sales_tax',          debitAccountNumber: null,   creditAccountNumber: '2100' },
  // Tips
  { code: 'tip_collected',      debitAccountNumber: null,   creditAccountNumber: '2160' },
  { code: 'tip_paidout',        debitAccountNumber: '2160', creditAccountNumber: '1010' },
  { code: 'event_gratuity',     debitAccountNumber: null,   creditAccountNumber: '2160' },
  // Deposits
  { code: 'deposit_taken',      debitAccountNumber: '1010', creditAccountNumber: '2320' },
  { code: 'deposit_applied',    debitAccountNumber: '2320', creditAccountNumber: '4090' },
  { code: 'event_deposit',      debitAccountNumber: '1010', creditAccountNumber: '2310' },
  { code: 'event_final_payment', debitAccountNumber: '2310', creditAccountNumber: '4060' },
  // Refunds
  { code: 'refund',             debitAccountNumber: '4110', creditAccountNumber: '1010' },
  { code: 'refund_voucher',     debitAccountNumber: '4110', creditAccountNumber: '2200' },
  { code: 'void',               debitAccountNumber: null,   creditAccountNumber: null },
  // Settlement
  { code: 'processor_settlement', debitAccountNumber: '1020', creditAccountNumber: '1050' },
  { code: 'chargeback',         debitAccountNumber: '6170', creditAccountNumber: '1020' },
  { code: 'processing_fee',     debitAccountNumber: '6100', creditAccountNumber: '1050' },
  // Discounts / Comps — generic fallback
  { code: 'discount',           debitAccountNumber: '4100', creditAccountNumber: null },
  { code: 'comp',               debitAccountNumber: '6150', creditAccountNumber: null },
  // Contra-revenue discount types (debit reduces net revenue, credit = N/A, resolved per sub-dept)
  { code: 'manual_discount',    debitAccountNumber: '4100', creditAccountNumber: null },
  { code: 'promo_code',         debitAccountNumber: '4101', creditAccountNumber: null },
  { code: 'employee_discount',  debitAccountNumber: '4102', creditAccountNumber: null },
  { code: 'loyalty_discount',   debitAccountNumber: '4103', creditAccountNumber: null },
  { code: 'member_discount',    debitAccountNumber: '4104', creditAccountNumber: null },
  { code: 'price_match',        debitAccountNumber: '4105', creditAccountNumber: null },
  { code: 'volume_discount',    debitAccountNumber: '4106', creditAccountNumber: null },
  { code: 'senior_military',    debitAccountNumber: '4107', creditAccountNumber: null },
  { code: 'group_event',        debitAccountNumber: '4108', creditAccountNumber: null },
  { code: 'seasonal_clearance', debitAccountNumber: '4109', creditAccountNumber: null },
  { code: 'vendor_funded',      debitAccountNumber: '4111', creditAccountNumber: null },
  { code: 'rain_check',         debitAccountNumber: '4112', creditAccountNumber: null },
  { code: 'early_payment',      debitAccountNumber: '4113', creditAccountNumber: null },
  { code: 'bundle_package',     debitAccountNumber: '4114', creditAccountNumber: null },
  { code: 'trade_discount',     debitAccountNumber: '4115', creditAccountNumber: null },
  // Expense comp types (debit = expense absorbed by business, credit = N/A)
  { code: 'manager_comp',       debitAccountNumber: '6150', creditAccountNumber: null },
  { code: 'promo_comp',         debitAccountNumber: '6151', creditAccountNumber: null },
  { code: 'quality_recovery',   debitAccountNumber: '6152', creditAccountNumber: null },
  { code: 'price_override',     debitAccountNumber: '6153', creditAccountNumber: null },
  { code: 'other_comp',         debitAccountNumber: '6154', creditAccountNumber: null },
  { code: 'spoilage_waste',     debitAccountNumber: '6155', creditAccountNumber: null },
  { code: 'charity_donation',   debitAccountNumber: '6156', creditAccountNumber: null },
  { code: 'training_staff_meal', debitAccountNumber: '6157', creditAccountNumber: null },
  { code: 'insurance_recovery', debitAccountNumber: '6158', creditAccountNumber: null },
  // Over/Short
  { code: 'over_short',         debitAccountNumber: '6160', creditAccountNumber: '1010' },
  { code: 'cash_payout',        debitAccountNumber: '6160', creditAccountNumber: '1010' },
  // AR
  { code: 'ar_invoice',         debitAccountNumber: '1100', creditAccountNumber: '4090' },
  { code: 'ar_payment',         debitAccountNumber: '1020', creditAccountNumber: '1100' },
  // AP
  { code: 'ap_bill',            debitAccountNumber: '6100', creditAccountNumber: '2000' },
  { code: 'ap_payment',         debitAccountNumber: '2000', creditAccountNumber: '1020' },
  // Inventory
  { code: 'inventory_receiving', debitAccountNumber: '1200', creditAccountNumber: '2000' },
  { code: 'cogs_recognition',   debitAccountNumber: '5010', creditAccountNumber: '1200' },
  // Memberships
  { code: 'membership_sale',     debitAccountNumber: '1150', creditAccountNumber: '2300' },
  { code: 'membership_ar_payment', debitAccountNumber: '1020', creditAccountNumber: '1150' },
  { code: 'membership_ap',      debitAccountNumber: '4050', creditAccountNumber: '2000' },
];

interface PaymentTypeDefault {
  code: string;
  cashAccountNumber: string | null;
  clearingAccountNumber: string | null;
}

const PAYMENT_TYPE_DEFAULTS: PaymentTypeDefault[] = [
  { code: 'cash',               cashAccountNumber: '1010', clearingAccountNumber: null },
  { code: 'card',               cashAccountNumber: null,   clearingAccountNumber: '1050' },
  { code: 'ecom',               cashAccountNumber: null,   clearingAccountNumber: '1050' },
  { code: 'check',              cashAccountNumber: '1010', clearingAccountNumber: null },
  { code: 'ach',                cashAccountNumber: null,   clearingAccountNumber: '1050' },
  { code: 'voucher',            cashAccountNumber: null,   clearingAccountNumber: '2200' },
  { code: 'house_account',      cashAccountNumber: null,   clearingAccountNumber: '1100' },
  { code: 'membership_payment', cashAccountNumber: null,   clearingAccountNumber: '1150' },
];

async function main() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_ADMIN or DATABASE_URL is required');
  }

  const target = isRemote ? 'REMOTE' : 'LOCAL';
  const masked = connectionString.replace(/:[^:@]+@/, ':***@');
  console.log(`\nFix GL Accounts + Transaction Type Mappings (${target})`);
  console.log(`DB: ${masked}\n`);

  const sql = postgres(connectionString, { max: 1, prepare: false });

  try {
    const tenants = await sql`
      SELECT t.id, t.name FROM tenants t
      WHERE EXISTS (SELECT 1 FROM accounting_settings s WHERE s.tenant_id = t.id)
    `;

    if (tenants.length === 0) {
      console.log('No tenants with accounting settings found. Nothing to do.');
      await sql.end();
      return;
    }

    console.log(`Found ${tenants.length} tenant(s) with accounting:\n`);

    for (const tenant of tenants) {
      console.log(`── Tenant: ${tenant.name} (${tenant.id}) ──────────────────────`);

      const classifications = await sql`SELECT id, name FROM gl_classifications WHERE tenant_id = ${tenant.id}`;
      const classMap = new Map<string, string>();
      for (const c of classifications) classMap.set(c.name, c.id);

      let accountsCreated = 0;
      const accountIdMap = new Map<string, string>();

      const existingAccounts = await sql`SELECT id, account_number FROM gl_accounts WHERE tenant_id = ${tenant.id}`;
      for (const a of existingAccounts) accountIdMap.set(a.account_number, a.id);

      for (const acct of REQUIRED_ACCOUNTS) {
        if (accountIdMap.has(acct.number)) continue;
        const classificationId = classMap.get(acct.classification) ?? null;
        const [created] = await sql`
          INSERT INTO gl_accounts (id, tenant_id, account_number, name, account_type, normal_balance,
            classification_id, is_control_account, control_account_type, depth, path, allow_manual_posting)
          VALUES (gen_random_uuid()::text, ${tenant.id}, ${acct.number}, ${acct.name}, ${acct.type},
            ${acct.normalBalance}, ${classificationId}, ${acct.isControlAccount}, ${acct.controlAccountType},
            0, ${acct.number}, true)
          ON CONFLICT DO NOTHING RETURNING id, account_number`;
        if (created) { accountIdMap.set(created.account_number, created.id); accountsCreated++; }
      }

      if (accountsCreated < REQUIRED_ACCOUNTS.length) {
        const allAccounts = await sql`SELECT id, account_number FROM gl_accounts WHERE tenant_id = ${tenant.id}`;
        for (const a of allAccounts) accountIdMap.set(a.account_number, a.id);
      }
      console.log(`  GL accounts created: ${accountsCreated}`);

      let mappingsUpdated = 0;
      for (const mapping of TRANSACTION_TYPE_MAPPINGS) {
        const debitAccountId = mapping.debitAccountNumber ? accountIdMap.get(mapping.debitAccountNumber) ?? null : null;
        const creditAccountId = mapping.creditAccountNumber ? accountIdMap.get(mapping.creditAccountNumber) ?? null : null;
        if (!debitAccountId && !creditAccountId) continue;
        if (mapping.debitAccountNumber && !debitAccountId) console.warn(`  WARNING: Debit account ${mapping.debitAccountNumber} not found for ${mapping.code}`);
        if (mapping.creditAccountNumber && !creditAccountId) console.warn(`  WARNING: Credit account ${mapping.creditAccountNumber} not found for ${mapping.code}`);
        await sql`
          INSERT INTO gl_transaction_type_mappings (id, tenant_id, transaction_type_code, location_id, credit_account_id, debit_account_id, source)
          VALUES (gen_random_uuid()::text, ${tenant.id}, ${mapping.code}, NULL, ${creditAccountId}, ${debitAccountId}, 'manual')
          ON CONFLICT (tenant_id, transaction_type_code) WHERE location_id IS NULL
          DO UPDATE SET credit_account_id = COALESCE(EXCLUDED.credit_account_id, gl_transaction_type_mappings.credit_account_id),
            debit_account_id = COALESCE(EXCLUDED.debit_account_id, gl_transaction_type_mappings.debit_account_id),
            source = 'manual', updated_at = NOW()`;
        mappingsUpdated++;
      }
      console.log(`  Transaction type mappings set: ${mappingsUpdated}`);

      let paymentDefaultsUpdated = 0;
      for (const ptd of PAYMENT_TYPE_DEFAULTS) {
        const cashId = ptd.cashAccountNumber ? accountIdMap.get(ptd.cashAccountNumber) ?? null : null;
        const clearingId = ptd.clearingAccountNumber ? accountIdMap.get(ptd.clearingAccountNumber) ?? null : null;
        if (!cashId && !clearingId) continue;
        if (cashId) {
          await sql`INSERT INTO payment_type_gl_defaults (tenant_id, payment_type_id, cash_account_id, updated_at)
            VALUES (${tenant.id}, ${ptd.code}, ${cashId}, NOW())
            ON CONFLICT (tenant_id, payment_type_id) DO UPDATE SET cash_account_id = COALESCE(EXCLUDED.cash_account_id, payment_type_gl_defaults.cash_account_id), updated_at = NOW()`;
        }
        if (clearingId) {
          await sql`INSERT INTO payment_type_gl_defaults (tenant_id, payment_type_id, clearing_account_id, updated_at)
            VALUES (${tenant.id}, ${ptd.code}, ${clearingId}, NOW())
            ON CONFLICT (tenant_id, payment_type_id) DO UPDATE SET clearing_account_id = COALESCE(EXCLUDED.clearing_account_id, payment_type_gl_defaults.clearing_account_id), updated_at = NOW()`;
        }
        paymentDefaultsUpdated++;
      }
      console.log(`  Payment type GL defaults set: ${paymentDefaultsUpdated}`);

      await sql`
        UPDATE accounting_settings SET
          default_tips_payable_account_id = COALESCE(${accountIdMap.get('2160') ?? null}, default_tips_payable_account_id),
          default_service_charge_revenue_account_id = COALESCE(${accountIdMap.get('4500') ?? null}, default_service_charge_revenue_account_id),
          default_surcharge_revenue_account_id = COALESCE(${accountIdMap.get('4510') ?? null}, default_surcharge_revenue_account_id),
          default_uncategorized_revenue_account_id = COALESCE(${accountIdMap.get('49900') ?? null}, default_uncategorized_revenue_account_id),
          default_cash_over_short_account_id = COALESCE(${accountIdMap.get('6160') ?? null}, default_cash_over_short_account_id),
          default_comp_expense_account_id = COALESCE(${accountIdMap.get('6150') ?? null}, default_comp_expense_account_id),
          default_discount_account_id = COALESCE(${accountIdMap.get('4100') ?? null}, default_discount_account_id),
          default_price_override_expense_account_id = COALESCE(${accountIdMap.get('6153') ?? null}, default_price_override_expense_account_id),
          default_returns_account_id = COALESCE(${accountIdMap.get('4110') ?? null}, default_returns_account_id),
          default_payroll_clearing_account_id = COALESCE(${accountIdMap.get('2500') ?? null}, default_payroll_clearing_account_id),
          default_ap_control_account_id = COALESCE(${accountIdMap.get('2000') ?? null}, default_ap_control_account_id),
          default_ar_control_account_id = COALESCE(${accountIdMap.get('1100') ?? null}, default_ar_control_account_id),
          default_sales_tax_payable_account_id = COALESCE(${accountIdMap.get('2100') ?? null}, default_sales_tax_payable_account_id),
          default_undeposited_funds_account_id = COALESCE(${accountIdMap.get('1050') ?? null}, default_undeposited_funds_account_id),
          default_retained_earnings_account_id = COALESCE(${accountIdMap.get('3000') ?? null}, default_retained_earnings_account_id),
          default_rounding_account_id = COALESCE(${accountIdMap.get('9999') ?? null}, default_rounding_account_id),
          updated_at = NOW()
        WHERE tenant_id = ${tenant.id}`;
      console.log(`  Accounting settings updated with key account references\n`);
    }

    console.log('Done! All transaction types mapped with PwC-standard double-entry assignments.');
    console.log('Verify at: /accounting/mappings → Transaction Types tab\n');
  } finally {
    await sql.end();
  }
}

main().catch((err) => { console.error('FATAL:', err); process.exit(1); });
