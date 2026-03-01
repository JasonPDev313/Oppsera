const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5 });

(async () => {
  try {
    const policies = await sql`
      SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
             pg_get_expr(polwithcheck, polrelid) as check_expr
      FROM pg_policy
      WHERE polrelid = (SELECT oid FROM pg_class WHERE relname = 'discount_gl_mappings')
    `;
    console.log('=== RLS Policies ===');
    for (const p of policies) {
      console.log(p.polname, '| cmd:', p.polcmd);
      console.log('  USING:', p.using_expr);
      console.log('  CHECK:', p.check_expr);
    }

    const role = await sql`SELECT current_user, current_role, session_user`;
    console.log('\n=== Connection Role ===');
    console.log(JSON.stringify(role[0]));

    const tenants = await sql`SELECT id FROM tenants LIMIT 1`;
    if (tenants.length === 0) { console.log('No tenants found'); return; }
    const tenantId = tenants[0].id;
    console.log('\nTest tenant:', tenantId);

    const cats = await sql`
      SELECT id, name, parent_id FROM catalog_categories
      WHERE tenant_id = ${tenantId} LIMIT 5
    `;
    console.log('Categories:');
    for (const c of cats) console.log('  -', c.id, c.name, 'parent:', c.parent_id);

    const acct = await sql`
      SELECT id, account_number, name FROM gl_accounts
      WHERE tenant_id = ${tenantId} AND account_number = '4100' LIMIT 1
    `;
    console.log('\nGL Account 4100:', acct.length > 0 ? JSON.stringify(acct[0]) : 'NOT FOUND');

    if (cats.length > 0 && acct.length > 0) {
      const catId = cats[0].id;
      const acctId = acct[0].id;
      console.log('\n=== Test INSERT with set_config ===');
      try {
        await sql.begin(async (tx) => {
          await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
          const result = await tx`
            INSERT INTO discount_gl_mappings (tenant_id, sub_department_id, discount_classification, gl_account_id)
            VALUES (${tenantId}, ${catId}, 'manual_discount', ${acctId})
            RETURNING *
          `;
          console.log('INSERT succeeded:', JSON.stringify(result[0]));
          throw new Error('ROLLBACK_TEST');
        });
      } catch (e) {
        if (e.message === 'ROLLBACK_TEST') {
          console.log('Test INSERT works! (rolled back)');
        } else {
          console.log('INSERT FAILED:', e.message);
        }
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
})();
