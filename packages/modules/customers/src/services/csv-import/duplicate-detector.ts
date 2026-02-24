/**
 * Duplicate detection for CSV import.
 *
 * Queries existing customers by multiple signals:
 *  1. Email exact match (highest priority)
 *  2. Phone exact match
 *  3. Member number exact match
 *  4. External ID match
 *
 * Returns a DuplicateMatch[] for the UI to show resolution options.
 */

import { sql } from 'drizzle-orm';
import {
  withTenant,
} from '@oppsera/db';
import type { MappedCustomerRow, DuplicateMatch } from './import-types';

// ── Types ───────────────────────────────────────────────────────

interface ExistingCustomerLookup {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

// ── Main Detection ──────────────────────────────────────────────

export async function detectDuplicates(
  tenantId: string,
  mappedRows: MappedCustomerRow[],
): Promise<DuplicateMatch[]> {
  if (mappedRows.length === 0) return [];

  // Collect all candidate values for batch lookup
  const emails: string[] = [];
  const phones: string[] = [];
  const memberNumbers: string[] = [];
  const externalIdValues: string[] = [];

  for (const row of mappedRows) {
    const email = row.customer.email as string | undefined;
    if (email) emails.push(email.toLowerCase().trim());

    const phone = row.customer.phone as string | undefined;
    if (phone) phones.push(phone.trim());

    const memberNumber = row.customer.memberNumber as string | undefined;
    if (memberNumber) memberNumbers.push(memberNumber.trim());

    if (row.externalId) externalIdValues.push(row.externalId.trim());
  }

  // Run batch queries inside tenant context
  return withTenant(tenantId, async (tx: any) => {
    const duplicates: DuplicateMatch[] = [];
    const matchedRowIndices = new Set<number>();

    // ── 1. Email matches ──
    if (emails.length > 0) {
      const uniqueEmails = [...new Set(emails)];
      const emailResults = await tx.execute(
        sql`SELECT id, display_name as "displayName", email, phone
            FROM customers
            WHERE tenant_id = ${tenantId}
              AND LOWER(email) = ANY(${uniqueEmails})
              AND display_name NOT LIKE '[MERGED]%'`,
      );

      const emailMap = new Map<string, ExistingCustomerLookup>();
      for (const row of Array.from(emailResults as Iterable<ExistingCustomerLookup>)) {
        if (row.email) emailMap.set(row.email.toLowerCase(), row);
      }

      for (const mappedRow of mappedRows) {
        const email = (mappedRow.customer.email as string | undefined)?.toLowerCase().trim();
        if (!email) continue;
        const match = emailMap.get(email);
        if (match && !matchedRowIndices.has(mappedRow.rowIndex)) {
          duplicates.push({
            csvRowIndex: mappedRow.rowIndex,
            matchType: 'email',
            existingCustomerId: match.id,
            existingDisplayName: match.displayName,
            existingEmail: match.email,
            matchConfidence: 100,
          });
          matchedRowIndices.add(mappedRow.rowIndex);
        }
      }
    }

    // ── 2. Phone matches (only for rows not already matched) ──
    if (phones.length > 0) {
      const uniquePhones = [...new Set(phones)];
      const phoneResults = await tx.execute(
        sql`SELECT id, display_name as "displayName", email, phone
            FROM customers
            WHERE tenant_id = ${tenantId}
              AND phone = ANY(${uniquePhones})
              AND display_name NOT LIKE '[MERGED]%'`,
      );

      const phoneMap = new Map<string, ExistingCustomerLookup>();
      for (const row of Array.from(phoneResults as Iterable<ExistingCustomerLookup>)) {
        if (row.phone) phoneMap.set(row.phone, row);
      }

      for (const mappedRow of mappedRows) {
        if (matchedRowIndices.has(mappedRow.rowIndex)) continue;
        const phone = (mappedRow.customer.phone as string | undefined)?.trim();
        if (!phone) continue;
        const match = phoneMap.get(phone);
        if (match) {
          duplicates.push({
            csvRowIndex: mappedRow.rowIndex,
            matchType: 'phone',
            existingCustomerId: match.id,
            existingDisplayName: match.displayName,
            existingEmail: match.email,
            matchConfidence: 100,
          });
          matchedRowIndices.add(mappedRow.rowIndex);
        }
      }
    }

    // ── 3. Member number matches ──
    if (memberNumbers.length > 0) {
      const uniqueMemberNums = [...new Set(memberNumbers)];
      const memberResults = await tx.execute(
        sql`SELECT ci.customer_id as "customerId", ci.value, c.display_name as "displayName", c.email
            FROM customer_identifiers ci
            JOIN customers c ON c.id = ci.customer_id AND c.tenant_id = ci.tenant_id
            WHERE ci.tenant_id = ${tenantId}
              AND ci.type = 'member_number'
              AND ci.value = ANY(${uniqueMemberNums})
              AND c.display_name NOT LIKE '[MERGED]%'`,
      );

      const memberMap = new Map<string, { customerId: string; displayName: string; email: string | null }>();
      for (const row of Array.from(memberResults as Iterable<{ customerId: string; value: string; displayName: string; email: string | null }>)) {
        memberMap.set(row.value, { customerId: row.customerId, displayName: row.displayName, email: row.email });
      }

      for (const mappedRow of mappedRows) {
        if (matchedRowIndices.has(mappedRow.rowIndex)) continue;
        const memberNum = (mappedRow.customer.memberNumber as string | undefined)?.trim();
        if (!memberNum) continue;
        const match = memberMap.get(memberNum);
        if (match) {
          duplicates.push({
            csvRowIndex: mappedRow.rowIndex,
            matchType: 'member_number',
            existingCustomerId: match.customerId,
            existingDisplayName: match.displayName,
            existingEmail: match.email,
            matchConfidence: 100,
          });
          matchedRowIndices.add(mappedRow.rowIndex);
        }
      }
    }

    // ── 4. External ID matches ──
    if (externalIdValues.length > 0) {
      const uniqueExternalIds = [...new Set(externalIdValues)];
      const extResults = await tx.execute(
        sql`SELECT ce.customer_id as "customerId", ce.external_id as "externalId",
                   c.display_name as "displayName", c.email
            FROM customer_external_ids ce
            JOIN customers c ON c.id = ce.customer_id AND c.tenant_id = ce.tenant_id
            WHERE ce.tenant_id = ${tenantId}
              AND ce.provider = 'legacy_import'
              AND ce.external_id = ANY(${uniqueExternalIds})
              AND c.display_name NOT LIKE '[MERGED]%'`,
      );

      const extMap = new Map<string, { customerId: string; displayName: string; email: string | null }>();
      for (const row of Array.from(extResults as Iterable<{ customerId: string; externalId: string; displayName: string; email: string | null }>)) {
        extMap.set(row.externalId, { customerId: row.customerId, displayName: row.displayName, email: row.email });
      }

      for (const mappedRow of mappedRows) {
        if (matchedRowIndices.has(mappedRow.rowIndex)) continue;
        const extId = mappedRow.externalId?.trim();
        if (!extId) continue;
        const match = extMap.get(extId);
        if (match) {
          duplicates.push({
            csvRowIndex: mappedRow.rowIndex,
            matchType: 'external_id',
            existingCustomerId: match.customerId,
            existingDisplayName: match.displayName,
            existingEmail: match.email,
            matchConfidence: 100,
          });
          matchedRowIndices.add(mappedRow.rowIndex);
        }
      }
    }

    // Sort by CSV row index
    duplicates.sort((a, b) => a.csvRowIndex - b.csvRowIndex);
    return duplicates;
  });
}
