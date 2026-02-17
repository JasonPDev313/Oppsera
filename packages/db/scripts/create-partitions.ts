/**
 * Creates monthly audit_log partitions for the next N months.
 * Run this as a weekly cron job to ensure partitions always exist
 * ahead of time. If a partition already exists, it's a no-op.
 *
 * Usage: tsx packages/db/scripts/create-partitions.ts [months-ahead]
 * Default: creates partitions for the next 3 months
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

async function createPartitions(monthsAhead: number = 3) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  const now = new Date();

  for (let i = 0; i <= monthsAhead; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const nextMonth = new Date(year, date.getMonth() + 1, 1);
    const nextYear = nextMonth.getFullYear();
    const nextMonthStr = String(nextMonth.getMonth() + 1).padStart(2, '0');

    const partitionName = `audit_log_${year}_${month}`;
    const fromDate = `${year}-${month}-01`;
    const toDate = `${nextYear}-${nextMonthStr}-01`;

    try {
      // Validate partition name format to prevent SQL injection in DDL
      if (!/^audit_log_\d{4}_\d{2}$/.test(partitionName)) {
        throw new Error(`Invalid partition name: ${partitionName}`);
      }
      if (!/^\d{4}-\d{2}-01$/.test(fromDate) || !/^\d{4}-\d{2}-01$/.test(toDate)) {
        throw new Error(`Invalid date range: ${fromDate} to ${toDate}`);
      }
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS ${partitionName} PARTITION OF audit_log
          FOR VALUES FROM ('${fromDate}') TO ('${toDate}');
      `));
      console.log(`Partition ${partitionName}: OK`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg.includes('already exists')) {
        console.log(`Partition ${partitionName}: already exists (skipped)`);
      } else {
        throw error;
      }
    }
  }

  await client.end();
  console.log('Done.');
}

const monthsAhead = parseInt(process.argv[2] || '3', 10);
createPartitions(monthsAhead).catch((err) => {
  console.error('Failed to create partitions:', err);
  process.exit(1);
});
