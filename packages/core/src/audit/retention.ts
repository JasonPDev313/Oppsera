import { sql } from 'drizzle-orm';
import { db } from '@oppsera/db';

/**
 * Detach audit log partitions older than the retention period.
 * For V1, this detaches old partitions (much faster than DELETE).
 * In production, export to S3/Parquet before dropping.
 *
 * Usage: run as a monthly cron job
 */
export async function pruneAuditLog(retentionDays: number = 90): Promise<string[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const year = cutoff.getFullYear();
  const month = String(cutoff.getMonth() + 1).padStart(2, '0');
  const cutoffPartitionName = `audit_log_${year}_${month}`;

  const partitions = await db.execute(sql`
    SELECT tablename FROM pg_tables
    WHERE tablename LIKE 'audit_log_%'
      AND tablename < ${cutoffPartitionName}
    ORDER BY tablename
  `);

  const rows = Array.from(partitions as Iterable<{ tablename: string }>);
  const detached: string[] = [];

  for (const partition of rows) {
    const name = partition.tablename;
    console.log(`Detaching partition: ${name}`);
    // Validate partition name format to prevent SQL injection in DDL
    if (!/^audit_log_\d{4}_\d{2}$/.test(name)) {
      console.warn(`Skipping invalid partition name: ${name}`);
      continue;
    }
    await db.execute(sql.raw(`ALTER TABLE audit_log DETACH PARTITION ${name}`));
    detached.push(name);
    console.log(`Partition ${name} detached`);
  }

  return detached;
}
