/**
 * Run the git indexer + embedding pipeline locally.
 *
 * Usage: npx tsx tools/scripts/run-git-indexer.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { runGitIndexer, embedDocuments } from '@oppsera/module-ai-support';

async function main() {
  console.log('Running git indexer...');
  const result = await runGitIndexer({ basePath: process.cwd(), force: false });
  console.log(`  SHA: ${result.sha}`);
  console.log(`  Indexed: ${result.indexed}, Skipped: ${result.skipped}, Errors: ${result.errors}`);

  console.log('\nRunning embedding pipeline...');
  const start = Date.now();
  let total = 0;
  while (Date.now() - start < 50_000) {
    const batch = await embedDocuments();
    total += batch;
    console.log(`  Batch: ${batch} (total: ${total})`);
    if (batch === 0) break;
  }
  console.log(`Done! Embedded ${total} documents.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
