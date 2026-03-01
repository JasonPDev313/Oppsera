const postgres = require('postgres');
require('dotenv').config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 5 });

(async () => {
  try {
    const tenantId = '01KJ7X1JZS20NXP4DFWXW9BTV8';

    // 1. Get all categories
    const cats = await sql`
      SELECT id, name, parent_id
      FROM catalog_categories
      WHERE tenant_id = ${tenantId}
      ORDER BY parent_id NULLS FIRST, name
    `;
    console.log('=== Categories (' + cats.length + ') ===');
    for (const c of cats) {
      console.log('  parent=' + (c.parent_id || 'NULL') + ' id=' + c.id + ' name=' + c.name);
    }

    // 2. Find mappable sub-departments (COALESCE(parent_id, id) pattern)
    const subDepts = await sql`
      SELECT COALESCE(parent_id, id) AS mappable_id, name
      FROM catalog_categories
      WHERE tenant_id = ${tenantId}
      AND parent_id IS NOT NULL
      GROUP BY COALESCE(parent_id, id), name
    `;
    console.log('\n=== Mappable SubDepts (' + subDepts.length + ') ===');
    for (const s of subDepts) {
      console.log('  id=' + s.mappable_id + ' name=' + s.name);
    }

    // If no sub-departments, try departments (2-level hierarchy)
    if (subDepts.length === 0) {
      console.log('\n  No sub-departments found. Trying departments...');
      const depts = await sql`
        SELECT id, name FROM catalog_categories
        WHERE tenant_id = ${tenantId}
        AND parent_id IS NULL
      `;
      console.log('  Departments: ' + depts.length);
      for (const d of depts) {
        console.log('    id=' + d.id + ' name=' + d.name);
      }
    }

    // 3. Get GL discount accounts
    const accts = await sql`
      SELECT id, account_number, name FROM gl_accounts
      WHERE tenant_id = ${tenantId}
      AND (account_number LIKE '41%' OR account_number LIKE '61%')
    `;
    console.log('\n=== Discount GL Accounts (' + accts.length + ') ===');
    for (const a of accts) {
      console.log('  ' + a.account_number + ' - ' + a.name + ' (id=' + a.id + ')');
    }

    // 4. Check existing discount mappings
    const mappings = await sql`
      SELECT * FROM discount_gl_mappings
      WHERE tenant_id = ${tenantId}
    `;
    console.log('\n=== Existing Discount Mappings (' + mappings.length + ') ===');
    for (const m of mappings) {
      console.log('  subDept=' + m.sub_department_id + ' classification=' + m.discount_classification + ' account=' + m.gl_account_id);
    }

    // 5. Test the save command payload shape
    if (cats.length > 0 && accts.length > 0) {
      const testSubDeptId = cats[0].id;
      const testAcctId = accts[0].id;
      console.log('\n=== Test Payload ===');
      console.log(JSON.stringify({
        mappings: [{
          subDepartmentId: testSubDeptId,
          classification: 'manual_discount',
          glAccountId: testAcctId,
        }]
      }, null, 2));
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await sql.end();
  }
})();
