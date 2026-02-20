import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL!, { prepare: false });

  // Check if calculation_mode still exists on tax_groups
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'tax_groups' AND column_name = 'calculation_mode'
  `;
  console.log('tax_groups.calculation_mode exists:', cols.length > 0);

  if (cols.length > 0) {
    console.log('Dropping calculation_mode from tax_groups...');
    await sql`ALTER TABLE tax_groups DROP COLUMN calculation_mode`;
    console.log('Column dropped!');
  }

  await sql.end();
}

main().catch(console.error);
