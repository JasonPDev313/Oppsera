/**
 * Seed AI support answer cards as draft for admin review.
 *
 * Usage: npx tsx tools/scripts/seed-ai-training-data.ts
 *
 * Idempotent — uses onConflictDoNothing on slug unique constraint.
 * All cards are inserted as 'draft' status. Review and activate from:
 *   Admin Portal → AI Assistant → Answer Cards
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { seedTrainingData, seedTrainingDataBatch2 } from '@oppsera/module-ai-support';

async function main() {
  console.log('Seeding AI support training data...\n');

  // Batch 1: 59 cards (ERP, POS, Reservations)
  console.log('── Batch 1 (ERP, POS, Reservations) ──');
  const r1 = await seedTrainingData(null);
  console.log(`  ${r1.answerCardsInserted} answer cards processed. ${r1.message}`);

  // Batch 2: 40 cards (ERP/Accounting)
  console.log('\n── Batch 2 (ERP/Accounting) ──');
  const r2 = await seedTrainingDataBatch2(null);
  console.log(`  ${r2.answerCardsInserted} answer cards processed. ${r2.message}`);

  console.log(`\nTotal: ${r1.answerCardsInserted + r2.answerCardsInserted} cards processed.`);
  console.log('Done!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
