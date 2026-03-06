/**
 * apply-missing-migrations.cjs
 *
 * Purely additive fix: runs each missing migration SQL (all idempotent),
 * then inserts the tracking row so Drizzle knows it's applied.
 * Does NOT delete or modify any existing rows in __drizzle_migrations.
 *
 * Usage:
 *   node scripts/apply-missing-migrations.cjs --dry-run   # preview only
 *   node scripts/apply-missing-migrations.cjs              # apply for real
 */

const postgres = require("postgres");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Load env the same way migrate.ts does
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

  // Get what's already applied
  const applied = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
  const prodHashSet = new Set(applied.map(r => r.hash));

  // Find missing migrations (hash not in production, using both SHA-256 and MD5)
  const missing = [];
  for (const entry of journal.entries) {
    const content = fs.readFileSync(path.join(migrationsDir, entry.tag + ".sql"), "utf8");
    const sha256 = crypto.createHash("sha256").update(content).digest("hex");
    const md5 = crypto.createHash("md5").update(content).digest("hex");
    if (!prodHashSet.has(sha256) && !prodHashSet.has(md5)) {
      missing.push({ ...entry, content, sha256 });
    }
  }

  if (missing.length === 0) {
    console.log("All migrations are already applied. Nothing to do.");
    await sql.end();
    return;
  }

  console.log(`Found ${missing.length} missing migration(s):`);
  missing.forEach(m => console.log(`  [${m.idx}] ${m.tag}`));
  console.log();

  if (dryRun) {
    console.log("DRY RUN — no changes applied.");
    await sql.end();
    return;
  }

  console.log("Applying missing migrations...");
  let applied_count = 0;
  let failed = [];

  for (const m of missing) {
    process.stdout.write(`  [${m.idx}] ${m.tag} ... `);
    try {
      // Split on statement breakpoints (Drizzle convention: --> statement-breakpoint)
      // and also handle plain semicolon-delimited statements
      const statements = m.content
        .split("--> statement-breakpoint")
        .flatMap(block => {
          // Each block may contain multiple DO $$ ... $$ blocks or plain statements
          // Run as a single block to preserve DO $$ blocks correctly
          return [block.trim()];
        })
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        await sql.unsafe(stmt);
      }

      // Insert tracking row with SHA-256 hash and the journal's `when` timestamp
      await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${m.sha256}, ${m.when})`;

      console.log("OK");
      applied_count++;
    } catch (err) {
      console.log("FAILED");
      console.error(`    Error: ${err.message}`);
      failed.push({ tag: m.tag, error: err.message });
      // Continue with remaining migrations
    }
  }

  console.log();
  console.log(`Applied: ${applied_count}/${missing.length}`);
  if (failed.length) {
    console.log(`Failed: ${failed.length}`);
    failed.forEach(f => console.log(`  - ${f.tag}: ${f.error}`));
  }

  await sql.end();
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
