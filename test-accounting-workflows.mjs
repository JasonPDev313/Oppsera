/**
 * Comprehensive accounting workflow test runner.
 * Tests all core accounting API endpoints against local dev server.
 */

const BASE = 'http://localhost:3000';
let TOKEN = '';
let RESULTS = [];
let createdAccountId = null;
let createdClassificationId = null;
let createdJournalId = null;
let locationId = null;

async function api(method, path, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${BASE}${path}`, opts);
  const data = await resp.json().catch(() => null);
  return { status: resp.status, data, ok: resp.ok };
}

function log(group, endpoint, status, ok, detail) {
  const icon = ok ? '✓' : '✗';
  const line = `  ${icon} [${status}] ${endpoint}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  RESULTS.push({ group, endpoint, status, ok, detail });
}

async function test(group, method, path, body, expectStatus) {
  try {
    const r = await api(method, path, body);
    const isOk = expectStatus ? r.status === expectStatus : r.ok;
    const detail = !isOk ? JSON.stringify(r.data?.error || r.data).slice(0, 200) : null;
    log(group, `${method} ${path.split('?')[0]}`, r.status, isOk, detail);
    return r;
  } catch (err) {
    log(group, `${method} ${path.split('?')[0]}`, 'ERR', false, err.message);
    return { status: 0, data: null, ok: false };
  }
}

// ═══════════════════════════════════════════════════════════════
// 1. AUTH
// ═══════════════════════════════════════════════════════════════
async function testAuth() {
  console.log('\n══ AUTH ══');
  const r = await api('POST', '/api/v1/auth/login', { email: 'admin@sunsetgolf.test', password: 'dev' });
  if (r.ok && r.data?.data?.accessToken) {
    TOKEN = r.data.data.accessToken;
    log('auth', 'POST /api/v1/auth/login', r.status, true, 'token acquired');
  } else {
    log('auth', 'POST /api/v1/auth/login', r.status, false, 'NO TOKEN — cannot continue');
    process.exit(1);
  }

  // Fetch user profile to get locationId
  const me = await api('GET', '/api/v1/me');
  if (me.ok && me.data?.data?.locations?.[0]?.id) {
    locationId = me.data.data.locations[0].id;
    console.log(`    (locationId: ${locationId})`);
  } else {
    console.log('    (warning: no locationId available — some tests will use dummy)');
    locationId = 'dummy-location';
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. SETTINGS & BOOTSTRAP
// ═══════════════════════════════════════════════════════════════
async function testSettings() {
  console.log('\n══ SETTINGS & BOOTSTRAP ══');
  await test('settings', 'GET', '/api/v1/accounting/settings');
  await test('settings', 'POST', '/api/v1/accounting/bootstrap', { templateKey: 'golf' }, 201);
  await test('settings', 'PATCH', '/api/v1/accounting/settings', {
    fiscalYearStartMonth: 1,
    autoPostMode: 'auto_post',
  });
}

// ═══════════════════════════════════════════════════════════════
// 3. GL CLASSIFICATIONS
// ═══════════════════════════════════════════════════════════════
async function testClassifications() {
  console.log('\n══ GL CLASSIFICATIONS ══');
  await test('classifications', 'GET', '/api/v1/accounting/classifications');

  const r = await test('classifications', 'POST', '/api/v1/accounting/classifications', {
    name: '_Test Classification ' + Date.now(),
    accountType: 'expense',
    sortOrder: 999,
  }, 201);
  if (r.ok && r.data?.data?.id) {
    createdClassificationId = r.data.data.id;
    await test('classifications', 'PATCH', `/api/v1/accounting/classifications/${createdClassificationId}`, {
      sortOrder: 998,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. GL ACCOUNTS
// ═══════════════════════════════════════════════════════════════
async function testAccounts() {
  console.log('\n══ GL ACCOUNTS ══');
  const list = await test('accounts', 'GET', '/api/v1/accounting/accounts');
  const count = list.data?.data?.length || 0;
  console.log(`    (${count} accounts found)`);

  const r = await test('accounts', 'POST', '/api/v1/accounting/accounts', {
    accountNumber: String(90000 + Math.floor(Math.random() * 9999)),
    name: '_Test Account ' + Date.now(),
    accountType: 'expense',
    normalBalance: 'debit',
    classificationId: createdClassificationId,
    isActive: true,
  }, 201);
  if (r.ok && r.data?.data?.id) {
    createdAccountId = r.data.data.id;
    await test('accounts', 'GET', `/api/v1/accounting/accounts/${createdAccountId}`);
    await test('accounts', 'PATCH', `/api/v1/accounting/accounts/${createdAccountId}`, {
      description: 'Test account for workflow validation',
    });
    await test('accounts', 'GET', `/api/v1/accounting/accounts/${createdAccountId}/change-log`);
    await test('accounts', 'POST', `/api/v1/accounting/accounts/${createdAccountId}/deactivate`, { reason: 'test' });
    await test('accounts', 'POST', `/api/v1/accounting/accounts/${createdAccountId}/reactivate`);
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. JOURNAL ENTRIES (full lifecycle: create → post → void)
// ═══════════════════════════════════════════════════════════════
async function testJournals() {
  console.log('\n══ JOURNAL ENTRIES ══');
  await test('journals', 'GET', '/api/v1/accounting/journals');

  // Need two accounts for balanced entry
  const accts = await api('GET', '/api/v1/accounting/accounts');
  const accounts = accts.data?.data || [];
  const debitAcct = accounts.find(a => a.normalBalance === 'debit' && a.isActive);
  const creditAcct = accounts.find(a => a.normalBalance === 'credit' && a.isActive);

  if (!debitAcct || !creditAcct) {
    log('journals', 'SKIP lifecycle', '-', false, 'need debit+credit accounts');
    return;
  }
  console.log(`    (debit: ${debitAcct.accountNumber} ${debitAcct.name}, credit: ${creditAcct.accountNumber} ${creditAcct.name})`);

  const today = new Date().toISOString().slice(0, 10);

  // Create journal entry with required sourceModule
  const r = await test('journals', 'POST', '/api/v1/accounting/journals', {
    businessDate: today,
    sourceModule: 'manual',
    memo: 'Test journal entry',
    lines: [
      { accountId: debitAcct.id, debitAmount: '10.00', creditAmount: '0.00', memo: 'test debit' },
      { accountId: creditAcct.id, debitAmount: '0.00', creditAmount: '10.00', memo: 'test credit' },
    ],
  }, 201);

  if (r.ok && r.data?.data?.id) {
    createdJournalId = r.data.data.id;
    console.log(`    (created journal: ${createdJournalId})`);

    // Get the journal
    await test('journals', 'GET', `/api/v1/accounting/journals/${createdJournalId}`);

    // Post it (if it was created as draft)
    const je = await api('GET', `/api/v1/accounting/journals/${createdJournalId}`);
    if (je.data?.data?.status === 'draft') {
      await test('journals', 'POST', `/api/v1/accounting/journals/${createdJournalId}/post`);
    } else {
      console.log(`    (journal auto-posted, status: ${je.data?.data?.status})`);
    }

    // Void it
    await test('journals', 'POST', `/api/v1/accounting/journals/${createdJournalId}/void`, {
      reason: 'test void',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// 6. GL MAPPINGS
// ═══════════════════════════════════════════════════════════════
async function testMappings() {
  console.log('\n══ GL MAPPINGS ══');
  await test('mappings', 'GET', '/api/v1/accounting/mappings/coverage');
  await test('mappings', 'GET', '/api/v1/accounting/mappings/sub-departments');
  await test('mappings', 'GET', '/api/v1/accounting/mappings/payment-types');
  await test('mappings', 'GET', '/api/v1/accounting/mappings/tax-groups');
  // fnb-categories requires locationId
  await test('mappings', 'GET', `/api/v1/accounting/mappings/fnb-categories?locationId=${locationId}`);
}

// ═══════════════════════════════════════════════════════════════
// 7. FINANCIAL REPORTS (corrected param names)
// ═══════════════════════════════════════════════════════════════
async function testReports() {
  console.log('\n══ FINANCIAL REPORTS ══');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  await test('reports', 'GET', `/api/v1/accounting/reports/trial-balance?asOfDate=${today}`);

  // detail requires accountId — use a real one
  const accts = await api('GET', '/api/v1/accounting/accounts');
  const firstAcct = accts.data?.data?.[0];
  if (firstAcct) {
    await test('reports', 'GET', `/api/v1/accounting/reports/detail?accountId=${firstAcct.id}&startDate=${monthAgo}&endDate=${today}`);
  }

  await test('reports', 'GET', `/api/v1/accounting/reports/summary?startDate=${monthAgo}&endDate=${today}`);

  // sales-tax-liability uses from/to
  await test('reports', 'GET', `/api/v1/accounting/reports/sales-tax-liability?from=${monthAgo}&to=${today}`);

  // Statements use from/to
  await test('statements', 'GET', `/api/v1/accounting/statements/profit-loss?from=${monthAgo}&to=${today}`);
  await test('statements', 'GET', `/api/v1/accounting/statements/balance-sheet?asOfDate=${today}`);
  await test('statements', 'GET', `/api/v1/accounting/statements/cash-flow?from=${monthAgo}&to=${today}`);
  await test('statements', 'GET', `/api/v1/accounting/statements/comparison?currentFrom=${monthAgo}&currentTo=${today}&priorFrom=${monthAgo}&priorTo=${today}`);
  await test('statements', 'GET', '/api/v1/accounting/statements/health-summary');
}

// ═══════════════════════════════════════════════════════════════
// 8. CLOSE PERIODS
// ═══════════════════════════════════════════════════════════════
async function testClosePeriods() {
  console.log('\n══ CLOSE PERIODS ══');
  await test('close', 'GET', '/api/v1/accounting/close-periods');

  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
  await test('close', 'GET', `/api/v1/accounting/close-periods/${currentPeriod}`);

  // close-status needs locationId + businessDate
  const today = new Date().toISOString().slice(0, 10);
  await test('close', 'GET', `/api/v1/accounting/close-status?locationId=${locationId}&businessDate=${today}`);
}

// ═══════════════════════════════════════════════════════════════
// 9. UNMAPPED EVENTS
// ═══════════════════════════════════════════════════════════════
async function testUnmappedEvents() {
  console.log('\n══ UNMAPPED EVENTS ══');
  await test('unmapped', 'GET', '/api/v1/accounting/unmapped-events');
}

// ═══════════════════════════════════════════════════════════════
// 10. BANK ACCOUNTS & RECONCILIATION
// ═══════════════════════════════════════════════════════════════
async function testBanking() {
  console.log('\n══ BANK ACCOUNTS & RECONCILIATION ══');
  await test('banking', 'GET', '/api/v1/accounting/bank-accounts');
  await test('banking', 'GET', '/api/v1/accounting/bank-reconciliation');
}

// ═══════════════════════════════════════════════════════════════
// 11. RECURRING JOURNALS
// ═══════════════════════════════════════════════════════════════
async function testRecurring() {
  console.log('\n══ RECURRING JOURNALS ══');
  await test('recurring', 'GET', '/api/v1/accounting/recurring');
}

// ═══════════════════════════════════════════════════════════════
// 12. OPERATIONS (corrected params — need locationId)
// ═══════════════════════════════════════════════════════════════
async function testOperations() {
  console.log('\n══ OPERATIONS ══');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  await test('operations', 'GET', `/api/v1/accounting/operations/summary?startDate=${monthAgo}&endDate=${today}`);
  await test('operations', 'GET', `/api/v1/accounting/operations/cash-dashboard?locationId=${locationId}&startDate=${monthAgo}&endDate=${today}`);
  await test('operations', 'GET', `/api/v1/accounting/operations/daily-reconciliation?locationId=${locationId}&businessDate=${today}`);
}

// ═══════════════════════════════════════════════════════════════
// 13. RECONCILIATION
// ═══════════════════════════════════════════════════════════════
async function testReconciliation() {
  console.log('\n══ RECONCILIATION ══');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  await test('reconciliation', 'GET', `/api/v1/accounting/reconciliation/waterfall?startDate=${monthAgo}&endDate=${today}`);
  await test('reconciliation', 'GET', `/api/v1/accounting/reconciliation/ap?startDate=${monthAgo}&endDate=${today}`);
  await test('reconciliation', 'GET', `/api/v1/accounting/reconciliation/ar?startDate=${monthAgo}&endDate=${today}`);
  await test('reconciliation', 'GET', `/api/v1/accounting/audit/coverage?from=${monthAgo}&to=${today}`);
}

// ═══════════════════════════════════════════════════════════════
// 14. SETTLEMENTS & DEPOSITS
// ═══════════════════════════════════════════════════════════════
async function testSettlements() {
  console.log('\n══ SETTLEMENTS & DEPOSITS ══');
  await test('settlements', 'GET', '/api/v1/accounting/settlements');
  await test('settlements', 'GET', '/api/v1/accounting/settlements/unmatched-tenders');
  await test('deposits', 'GET', '/api/v1/accounting/deposits');
}

// ═══════════════════════════════════════════════════════════════
// 15. COGS
// ═══════════════════════════════════════════════════════════════
async function testCogs() {
  console.log('\n══ COGS ══');
  await test('cogs', 'GET', '/api/v1/accounting/cogs');
}

// ═══════════════════════════════════════════════════════════════
// 16. COA IMPORT & HEALTH
// ═══════════════════════════════════════════════════════════════
async function testImportAndHealth() {
  console.log('\n══ COA IMPORT & HEALTH ══');
  await test('import', 'GET', '/api/v1/accounting/import/history');
  await test('health', 'GET', '/api/v1/accounting/health');
  await test('breakage', 'GET', '/api/v1/accounting/breakage');
  await test('layouts', 'GET', '/api/v1/accounting/statement-layouts');
}

// ═══════════════════════════════════════════════════════════════
// 17. ACCOUNTS PAYABLE
// ═══════════════════════════════════════════════════════════════
async function testAP() {
  console.log('\n══ ACCOUNTS PAYABLE ══');
  await test('ap', 'GET', '/api/v1/ap/bills');
  await test('ap', 'GET', '/api/v1/ap/payments');
  await test('ap', 'GET', '/api/v1/ap/payment-terms');

  // AP aging is at /ap/aging (NOT /ap/reports/aging)
  const today = new Date().toISOString().slice(0, 10);
  await test('ap-reports', 'GET', `/api/v1/ap/aging?asOfDate=${today}`);
  await test('ap-reports', 'GET', '/api/v1/ap/reports/open-bills');
  await test('ap-reports', 'GET', `/api/v1/ap/reports/cash-requirements?asOfDate=${today}`);
  await test('ap-reports', 'GET', `/api/v1/ap/reports/1099?year=${new Date().getFullYear()}`);
}

// ═══════════════════════════════════════════════════════════════
// 18. ACCOUNTS RECEIVABLE
// ═══════════════════════════════════════════════════════════════
async function testAR() {
  console.log('\n══ ACCOUNTS RECEIVABLE ══');
  await test('ar', 'GET', '/api/v1/ar/invoices');
  await test('ar', 'GET', '/api/v1/ar/receipts');

  const today = new Date().toISOString().slice(0, 10);
  await test('ar-reports', 'GET', `/api/v1/ar/reports/aging?asOfDate=${today}`);
  await test('ar-reports', 'GET', '/api/v1/ar/reports/open-invoices');
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
async function cleanup() {
  console.log('\n══ CLEANUP ══');
  if (createdAccountId) {
    await test('cleanup', 'POST', `/api/v1/accounting/accounts/${createdAccountId}/deactivate`, { reason: 'cleanup' });
  }
  console.log('  (test data left in place — safe to ignore)');
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
function printSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  const passed = RESULTS.filter(r => r.ok).length;
  const failed = RESULTS.filter(r => !r.ok).length;
  console.log(`  Total: ${RESULTS.length}  |  Passed: ${passed}  |  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFAILED ENDPOINTS:');
    for (const r of RESULTS.filter(r => !r.ok)) {
      console.log(`  ✗ [${r.status}] ${r.endpoint} — ${r.detail || 'unknown'}`);
    }
  } else {
    console.log('\n  ALL ENDPOINTS PASSED! ✓');
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('Accounting Workflow Test Runner (v2)');
  console.log('Target: ' + BASE);
  console.log('═'.repeat(60));

  await testAuth();
  await testSettings();
  await testClassifications();
  await testAccounts();
  await testJournals();
  await testMappings();
  await testReports();
  await testClosePeriods();
  await testUnmappedEvents();
  await testBanking();
  await testRecurring();
  await testOperations();
  await testReconciliation();
  await testSettlements();
  await testCogs();
  await testImportAndHealth();
  await testAP();
  await testAR();
  await cleanup();
  printSummary();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
