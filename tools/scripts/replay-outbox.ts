/**
 * Replays all outbox events through registered consumers.
 *
 * Usage: npx tsx tools/scripts/replay-outbox.ts
 *
 * This is a one-time script to backfill read models after consumers are wired up.
 * Safe to run multiple times — consumers use processed_events for idempotency.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { asc } from 'drizzle-orm';
import { db, eventOutbox } from '@oppsera/db';
import { EventEnvelopeSchema } from '@oppsera/shared';
import type { EventEnvelope } from '@oppsera/shared';

// Import consumers from each module
import {
  handleOrderPlaced as reportingOrderPlaced,
  handleOrderVoided as reportingOrderVoided,
  handleTenderRecorded as reportingTenderRecorded,
  handleInventoryMovement as reportingInventoryMovement,
} from '@oppsera/module-reporting';

import {
  handleOrderPlaced as inventoryOrderPlaced,
  handleOrderVoided as inventoryOrderVoided,
  handleCatalogItemCreated as inventoryCatalogItemCreated,
} from '@oppsera/module-inventory';

import {
  handleOrderPlaced as customersOrderPlaced,
  handleOrderVoided as customersOrderVoided,
  handleTenderRecorded as customersTenderRecorded,
} from '@oppsera/module-customers';

import {
  handleOrderVoided as paymentsOrderVoided,
} from '@oppsera/module-payments';

type Handler = (event: EventEnvelope) => Promise<void>;

const consumerMap: Record<string, { name: string; handler: Handler }[]> = {
  'order.placed.v1': [
    { name: 'reporting', handler: reportingOrderPlaced },
    { name: 'inventory', handler: inventoryOrderPlaced },
    { name: 'customers', handler: customersOrderPlaced },
  ],
  'order.voided.v1': [
    { name: 'reporting', handler: reportingOrderVoided },
    { name: 'inventory', handler: inventoryOrderVoided },
    { name: 'customers', handler: customersOrderVoided },
    { name: 'payments', handler: paymentsOrderVoided },
  ],
  'tender.recorded.v1': [
    { name: 'reporting', handler: reportingTenderRecorded },
    { name: 'customers', handler: customersTenderRecorded },
  ],
  'inventory.movement.created.v1': [
    { name: 'reporting', handler: reportingInventoryMovement },
  ],
  'catalog.item.created.v1': [
    { name: 'inventory', handler: inventoryCatalogItemCreated },
  ],
};

async function main() {
  console.log('Loading all outbox events...');

  const allEvents = await db
    .select()
    .from(eventOutbox)
    .orderBy(asc(eventOutbox.createdAt));

  console.log(`Found ${allEvents.length} total outbox events`);

  const relevantTypes = Object.keys(consumerMap);
  const relevant = allEvents.filter((e) => relevantTypes.includes(e.eventType));
  console.log(`${relevant.length} events match registered consumers`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of relevant) {
    const consumers = consumerMap[row.eventType];
    if (!consumers) continue;

    let event: EventEnvelope;
    try {
      event = EventEnvelopeSchema.parse(row.payload);
    } catch (err) {
      console.error(`  [SKIP] Invalid event payload: ${row.id} (${row.eventType})`);
      skipped++;
      continue;
    }

    for (const { name, handler } of consumers) {
      try {
        await handler(event);
        processed++;
      } catch (err) {
        // Consumers have internal idempotency — errors here are real failures
        console.error(`  [FAIL] ${name}/${row.eventType} event=${row.eventId}:`, err);
        failed++;
      }
    }
  }

  console.log(`\nDone!`);
  console.log(`  Processed: ${processed}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Failed:    ${failed}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Replay failed:', err);
  process.exit(1);
});
