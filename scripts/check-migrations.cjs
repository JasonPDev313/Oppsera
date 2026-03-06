const postgres = require("postgres");
const fs = require("fs");
const path = require("path");

// Load .env.remote the same way migrate.ts does
require("dotenv").config({ path: require("path").join(__dirname, "../.env.remote"), override: true });
require("dotenv").config({ path: require("path").join(__dirname, "../.env.local") });
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const dbUrl = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL_ADMIN or DATABASE_URL set");
  process.exit(1);
}

const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 10 });

async function main() {
  // Get applied migrations from Drizzle tracking table
  const applied = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
  console.log("Applied migrations in production:", applied.length);

  // Get local journal
  const journal = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../packages/db/migrations/meta/_journal.json"), "utf8")
  );
  console.log("Local journal entries:", journal.entries.length);
  console.log();

  // Group by hash length to understand versions
  const by64 = applied.filter(r => r.hash.length === 64);
  const by32 = applied.filter(r => r.hash.length === 32);
  const other = applied.filter(r => r.hash.length !== 64 && r.hash.length !== 32);
  console.log(`Hash formats: ${by64.length} SHA-256 (64-char), ${by32.length} MD5 (32-char), ${other.length} other`);
  console.log();

  // Compute local hashes with BOTH algorithms
  const crypto = require("crypto");
  const migrationsDir = path.join(__dirname, "../packages/db/migrations");
  const localHashes = journal.entries.map(e => {
    const content = fs.readFileSync(path.join(migrationsDir, e.tag + ".sql"), "utf8");
    return {
      idx: e.idx,
      tag: e.tag,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      md5: crypto.createHash("md5").update(content).digest("hex"),
    };
  });

  const prodHashSet = new Set(applied.map(r => r.hash));
  const localSha256Set = new Set(localHashes.map(h => h.sha256));
  const localMd5Set = new Set(localHashes.map(h => h.md5));

  // Check which local migrations are NOT in production (by either hash)
  const notInProd = localHashes.filter(h => !prodHashSet.has(h.sha256) && !prodHashSet.has(h.md5));
  if (notInProd.length) {
    console.log(`LOCAL MIGRATIONS NOT IN PRODUCTION: ${notInProd.length}`);
    notInProd.forEach(h => console.log(`  - [${h.idx}] ${h.tag}`));
  } else {
    console.log("All local migrations found in production (by SHA-256 or MD5).");
  }
  console.log();

  // Check production entries not matching any local hash
  const notInLocal = applied.filter(r => !localSha256Set.has(r.hash) && !localMd5Set.has(r.hash));
  if (notInLocal.length) {
    console.log(`ORPHAN PRODUCTION ENTRIES (no matching local file): ${notInLocal.length}`);
    notInLocal.forEach(r => console.log(`  hash=${r.hash} (${r.hash.length}-char) at=${r.created_at}`));
  } else {
    console.log("All production entries match a local file.");
  }

  // KEY: Drizzle uses timestamp comparison, not hash or count
  // It runs: SELECT ... ORDER BY created_at DESC LIMIT 1
  // Then applies any migration where folderMillis > lastDbMigration.created_at
  const lastApplied = applied[applied.length - 1];
  console.log();
  console.log("=== DRIZZLE TIMESTAMP ANALYSIS ===");
  console.log("Last applied created_at:", lastApplied.created_at);
  console.log();

  const pendingByTimestamp = journal.entries.filter(e => e.when > Number(lastApplied.created_at));
  const skippedByTimestamp = journal.entries.filter(e => e.when <= Number(lastApplied.created_at));
  console.log("Journal entries with when > last applied:", pendingByTimestamp.length, "(would run)");
  console.log("Journal entries with when <= last applied:", skippedByTimestamp.length, "(would be SKIPPED)");

  if (pendingByTimestamp.length) {
    console.log();
    console.log("Would run on next migrate:");
    pendingByTimestamp.forEach(e => console.log(`  - [${e.idx}] ${e.tag} (when=${e.when})`));
  }

  // Check which skipped ones are actually NOT applied (the real problem)
  const skippedButNotApplied = [];
  for (const entry of skippedByTimestamp) {
    const content = fs.readFileSync(path.join(migrationsDir, entry.tag + ".sql"), "utf8");
    const sha = crypto.createHash("sha256").update(content).digest("hex");
    const md5 = crypto.createHash("md5").update(content).digest("hex");
    if (!prodHashSet.has(sha) && !prodHashSet.has(md5)) {
      skippedButNotApplied.push(entry);
    }
  }
  if (skippedButNotApplied.length) {
    console.log();
    console.log(`CRITICAL: ${skippedButNotApplied.length} migrations are SKIPPED by Drizzle but NEVER APPLIED:`);
    skippedButNotApplied.forEach(e => console.log(`  - [${e.idx}] ${e.tag} (when=${e.when})`));
    console.log();
    console.log("These will NEVER run via db:migrate because their timestamp is <= the last applied.");
    console.log("They must be applied manually or the tracking table must be fixed.");
  }

  await sql.end();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
