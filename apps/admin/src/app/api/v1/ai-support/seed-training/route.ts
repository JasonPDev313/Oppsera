import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import {
  seedTrainingData,
  seedTrainingDataBatch2,
  seedTrainingDataBatch3,
  seedTrainingDataBatch4,
  seedTrainingDataBatch5,
  seedTrainingDataBatch6,
} from '@oppsera/module-ai-support';

// POST /api/v1/ai-support/seed-training — seed all training answer-card batches (global, tenant_id = null)
export const POST = withAdminPermission(
  async () => {
    const r1 = await seedTrainingData(null);
    const r2 = await seedTrainingDataBatch2(null);
    const r3 = await seedTrainingDataBatch3(null);
    const r4 = await seedTrainingDataBatch4(null);
    const r5 = await seedTrainingDataBatch5(null);
    const r6 = await seedTrainingDataBatch6(null);

    const total =
      r1.answerCardsInserted +
      r2.answerCardsInserted +
      r3.answerCardsInserted +
      r4.answerCardsInserted +
      r5.answerCardsInserted +
      r6.answerCardsInserted;

    return NextResponse.json({
      data: {
        total,
        batches: {
          batch1: r1.answerCardsInserted,
          batch2: r2.answerCardsInserted,
          batch3: r3.answerCardsInserted,
          batch4: r4.answerCardsInserted,
          batch5: r5.answerCardsInserted,
          batch6: r6.answerCardsInserted,
        },
      },
    });
  },
  { permission: 'admin.ai_support' },
);
