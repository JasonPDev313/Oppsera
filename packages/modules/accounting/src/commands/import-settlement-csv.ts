import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentSettlements, paymentSettlementLines } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import type { ImportSettlementCsvInput } from '../validation';

interface ParsedSettlementLine {
  date: string;
  amount: number;
  fee: number;
  net: number;
  batchId?: string;
  reference?: string;
}

/**
 * Parse a CSV string into settlement lines.
 * Supports common processor CSV formats:
 *   date, amount, fee, net, batch_id, reference
 */
function parseCsv(csvContent: string): ParsedSettlementLine[] {
  const lines = csvContent
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return []; // header + at least one data row

  const header = lines[0]!.toLowerCase();
  const columns = header.split(',').map((c) => c.trim().replace(/"/g, ''));

  // Find column indexes
  const dateIdx = columns.findIndex((c) => c === 'date' || c === 'settlement_date' || c === 'trans_date');
  const amountIdx = columns.findIndex((c) => c === 'amount' || c === 'gross_amount' || c === 'gross');
  const feeIdx = columns.findIndex((c) => c === 'fee' || c === 'fee_amount' || c === 'fees' || c === 'processing_fee');
  const netIdx = columns.findIndex((c) => c === 'net' || c === 'net_amount');
  const batchIdx = columns.findIndex((c) => c === 'batch_id' || c === 'batch' || c === 'batch_number');
  const refIdx = columns.findIndex((c) => c === 'reference' || c === 'ref' || c === 'transaction_id' || c === 'auth_code');

  if (dateIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must contain at least "date" and "amount" columns');
  }

  const parsed: ParsedSettlementLine[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!);
    const amount = parseFloat(values[amountIdx] ?? '0');
    const fee = feeIdx >= 0 ? parseFloat(values[feeIdx] ?? '0') : 0;
    const net = netIdx >= 0 ? parseFloat(values[netIdx] ?? '0') : amount - Math.abs(fee);

    parsed.push({
      date: values[dateIdx]?.trim().replace(/"/g, '') ?? '',
      amount,
      fee: Math.abs(fee),
      net,
      batchId: batchIdx >= 0 ? values[batchIdx]?.trim().replace(/"/g, '') : undefined,
      reference: refIdx >= 0 ? values[refIdx]?.trim().replace(/"/g, '') : undefined,
    });
  }

  return parsed;
}

/** Parse a single CSV line, handling quoted values */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function importSettlementCsv(
  ctx: RequestContext,
  input: ImportSettlementCsvInput,
) {
  const parsedLines = parseCsv(input.csvContent);

  if (parsedLines.length === 0) {
    throw new Error('CSV contains no data rows');
  }

  // Group by batch ID if present, otherwise create one settlement
  const batchGroups = new Map<string, ParsedSettlementLine[]>();

  for (const line of parsedLines) {
    const key = line.batchId ?? 'default';
    if (!batchGroups.has(key)) batchGroups.set(key, []);
    batchGroups.get(key)!.push(line);
  }

  const settlements: Array<{ id: string; processorName: string; grossAmount: string }> = [];

  for (const [batchId, batchLines] of batchGroups) {
    const totalGross = batchLines.reduce((sum, l) => sum + l.amount, 0);
    const totalFee = batchLines.reduce((sum, l) => sum + l.fee, 0);
    const totalNet = batchLines.reduce((sum, l) => sum + l.net, 0);
    const totalChargeback = batchLines
      .filter((l) => l.amount < 0)
      .reduce((sum, l) => sum + Math.abs(l.amount), 0);

    // Use earliest/latest date from lines
    const dates = batchLines.map((l) => l.date).filter(Boolean).sort();
    const settlementDate = dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);
    const businessDateFrom = dates[0] ?? settlementDate;
    const businessDateTo = dates[dates.length - 1] ?? settlementDate;

    const result = await publishWithOutbox(ctx, async (tx) => {
      const settlementId = generateUlid();

      const [settlement] = await tx
        .insert(paymentSettlements)
        .values({
          id: settlementId,
          tenantId: ctx.tenantId,
          settlementDate,
          processorName: input.processorName,
          processorBatchId: batchId === 'default' ? null : batchId,
          grossAmount: totalGross.toFixed(2),
          feeAmount: totalFee.toFixed(2),
          netAmount: totalNet.toFixed(2),
          chargebackAmount: totalChargeback.toFixed(2),
          bankAccountId: input.bankAccountId ?? null,
          importSource: 'csv',
          rawData: { lineCount: batchLines.length, originalBatchId: batchId },
          businessDateFrom,
          businessDateTo,
        })
        .returning();

      // Insert individual lines
      for (const line of batchLines) {
        const amountCents = Math.round(line.amount * 100);
        const feeCents = Math.round(line.fee * 100);
        const netCents = Math.round(line.net * 100);

        await tx
          .insert(paymentSettlementLines)
          .values({
            id: generateUlid(),
            tenantId: ctx.tenantId,
            settlementId,
            originalAmountCents: amountCents,
            settledAmountCents: amountCents,
            feeCents,
            netCents,
            status: 'unmatched',
          });
      }

      const event = buildEventFromContext(ctx, 'accounting.settlement.imported.v1', {
        settlementId,
        processorName: input.processorName,
        lineCount: batchLines.length,
        grossAmount: totalGross.toFixed(2),
      });

      return { result: settlement!, events: [event] };
    });

    settlements.push({
      id: result.id,
      processorName: input.processorName,
      grossAmount: totalGross.toFixed(2),
    });

    await auditLog(ctx, 'accounting.settlement.imported', 'payment_settlement', result.id);
  }

  return settlements;
}
