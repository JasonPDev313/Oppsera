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

import { seedTrainingData, seedTrainingDataBatch2, seedTrainingDataBatch3, seedTrainingDataBatch4, seedTrainingDataBatch5, seedTrainingDataBatch6, seedRouteManifests } from '@oppsera/module-ai-support';

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

  // Batch 3: 45 cards (KDS)
  console.log('\n── Batch 3 (KDS / Kitchen Display System) ──');
  const r3 = await seedTrainingDataBatch3(null);
  console.log(`  ${r3.answerCardsInserted} answer cards processed. ${r3.message}`);

  // Batch 4: 50 cards (Spa)
  console.log('\n── Batch 4 (Spa) ──');
  const r4 = await seedTrainingDataBatch4(null);
  console.log(`  ${r4.answerCardsInserted} answer cards processed. ${r4.message}`);

  // Batch 5: 50 cards (Inventory / Catalog Deep-Dive)
  console.log('\n── Batch 5 (Inventory / Catalog Deep-Dive) ──');
  const r5 = await seedTrainingDataBatch5(null);
  console.log(`  ${r5.answerCardsInserted} answer cards processed. ${r5.message}`);

  // Batch 6: 50 cards (Assistant-Awareness & Meta)
  console.log('\n── Batch 6 (Assistant-Awareness & Meta) ──');
  const r6 = await seedTrainingDataBatch6(null);
  console.log(`  ${r6.answerCardsInserted} answer cards processed. ${r6.message}`);

  // Route Manifests — structured page descriptions for T4 retrieval
  console.log('\n── Route Manifests ──');
  const rm = await seedRouteManifests();
  console.log(`  ${rm.inserted} route manifests upserted.`);

  console.log(`\nTotal: ${r1.answerCardsInserted + r2.answerCardsInserted + r3.answerCardsInserted + r4.answerCardsInserted + r5.answerCardsInserted + r6.answerCardsInserted} cards + ${rm.inserted} manifests processed.`);
  console.log('Done!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
