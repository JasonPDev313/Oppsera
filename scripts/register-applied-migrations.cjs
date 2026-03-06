/**
 * register-applied-migrations.cjs
 *
 * For migrations that are already applied in the DB (objects exist)
 * but missing from the Drizzle tracking table: inserts ONLY the
 * tracking row. Does NOT run any SQL. Purely additive.
 *
 * Usage:
 *   node scripts/register-applied-migrations.cjs --dry-run
 *   node scripts/register-applied-migrations.cjs
 */

const postgres = require("postgres");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "../.env.remote"), override: true });
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const dryRun = process.argv.includes("--dry-run");
const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL_ADMIN or DATABASE_URL set");
  process.exit(1);
}

const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 });

async function main() {
  const migrationsDir = path.join(__dirname, "../packages/db/migrations");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta/_journal.json"), "utf8")
  );

  const applied = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
  const prodHashSet = new Set(applied.map(r => r.hash));

  // Find migrations still missing from tracking table
  const missing = [];
  for (const entry of journal.entries) {
    const content = fs.readFileSync(path.join(migrationsDir, entry.tag + ".sql"), "utf8");
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    const md5 = crypto.createHash("md5").update(content).digest("hex");
    if (!prodHashSet.has(sha256) && !prodHashSet.has(md5)) {
      missing.push({ idx: entry.idx, tag: entry.tag, when: entry.when, sha256 });
    }
  }

  if (missing.length === 0) {
    console.log("All migrations are tracked. Nothing to do.");
    await sql.end();
    return;
  }

  console.log(`Found ${missing.length} untracked migration(s) to register:`);
  missing.forEach(m => console.log(`  [${m.idx}] ${m.tag}`));
  console.log();

  if (dryRun) {
    console.log("DRY RUN — no changes made.");
    await sql.end();
    return;
  }

  console.log("Registering tracking entries (NO SQL execution)...");
  let count = 0;
  for (const m of missing) {
    await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${m.sha256}, ${m.when})`;
    console.log(`  [${m.idx}] ${m.tag} ... REGISTERED`);
    count++;
  }

  console.log();
  console.log(`Registered: ${count}/${missing.length}`);
  await sql.end();
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
