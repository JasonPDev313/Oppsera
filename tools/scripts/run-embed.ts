/**
 * Run the keyword embedding pipeline to make seeded answer cards searchable.
 *
 * Usage: npx tsx tools/scripts/run-embed.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { embedDocuments } from '@oppsera/module-ai-support';

async function main() {
  console.log('Running keyword embedding pipeline...');
  const start = Date.now();
  let total = 0;

  while (Date.now() - start < 50_000) {
    const batch = await embedDocuments();
    total += batch;
    console.log(`  Batch: ${batch} documents embedded (total: ${total})`);
    if (batch === 0) break;
  }

  console.log(`\nDone! Embedded ${total} documents in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
