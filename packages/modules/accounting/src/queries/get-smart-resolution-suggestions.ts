import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { getAccountingSettings } from '../helpers/get-accounting-settings';
import {
  batchResolveSubDepartmentAccounts,
  batchResolveTaxGroupAccounts,
} from '../helpers/resolve-mapping';

// ── Types ──────────────────────────────────────────────────────

export interface SuggestedMapping {
  entityType: string;
  entityId: string;
  entityName: string;
  suggestedAccountId: string;
  suggestedAccountNumber: string;
  suggestedAccountName: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  alreadyMapped: boolean;
  eventCount: number;
}

export interface SmartResolutionResult {
  suggestions: SuggestedMapping[];
  totalEvents: number;
  autoResolvable: number;
  alreadyMapped: number;
  /** Count of posting_error / no_line_detail events that need manual investigation */
  skippedErrors: number;
}

// ── Semantic matching helpers ──────────────────────────────────

const SEMANTIC_GROUPS: Record<string, string[]> = {
  food: ['food', 'kitchen', 'sandwich', 'burger', 'pizza', 'grill', 'appetizer', 'entree', 'dessert', 'salad', 'soup', 'breakfast', 'lunch', 'dinner', 'snack', 'bakery', 'deli', 'seafood', 'sushi', 'catering', 'buffet', 'brunch'],
  beverage: ['beverage', 'drink', 'bar', 'wine', 'beer', 'liquor', 'spirit', 'cocktail', 'coffee', 'tea', 'juice', 'soda', 'water', 'alcohol'],
  apparel: ['apparel', 'clothing', 'shirt', 'hat', 'cap', 'shoes', 'accessories', 'merchandise', 'merch', 'logo', 'branded', 'gift', 'souvenir'],
  golf: ['golf', 'pro shop', 'proshop', 'green fee', 'cart', 'range', 'lesson', 'club', 'tee', 'course', 'round'],
  retail: ['retail', 'general', 'merchandise', 'sundry', 'sundries', 'supplies', 'equipment', 'hardware'],
  rental: ['rental', 'equipment rental', 'cart rental', 'club rental'],
  spa: ['spa', 'wellness', 'massage', 'treatment', 'salon', 'beauty'],
  lodging: ['lodging', 'room', 'hotel', 'suite', 'accommodation', 'resort', 'stay', 'night'],
  event: ['event', 'banquet', 'conference', 'meeting', 'party', 'wedding', 'function'],
  service: ['service', 'fee', 'charge', 'labor', 'installation'],
};

const REVENUE_KEYWORDS = ['revenue', 'sales', 'income'];
const CASH_KEYWORDS = ['cash', 'on hand', 'register', 'drawer', 'till'];
const TAX_KEYWORDS = ['tax', 'payable', 'collected', 'liability'];

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function tokenOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let matches = 0;
  for (const t of a) {
    if (setB.has(t)) matches++;
  }
  return a.length === 0 ? 0 : matches / a.length;
}

function expandSemanticGroup(tokens: string[]): string[] {
  const expanded = [...tokens];
  for (const [, groupWords] of Object.entries(SEMANTIC_GROUPS)) {
    const hasOverlap = tokens.some((t) => groupWords.includes(t));
    if (hasOverlap) {
      for (const w of groupWords) {
        if (!expanded.includes(w)) expanded.push(w);
      }
    }
  }
  return expanded;
}

interface GLAccount {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
}

function scoreAccountMatch(
  entityName: string,
  account: GLAccount,
  roleKeywords: string[],
): number {
  const entityTokens = tokenize(entityName);
  const accountTokens = tokenize(account.name);
  const expandedEntity = expandSemanticGroup(entityTokens);

  let score = tokenOverlap(expandedEntity, accountTokens) * 0.6;

  const roleOverlap = tokenOverlap(roleKeywords, accountTokens);
  score += roleOverlap * 0.3;

  const genericNames = ['other', 'miscellaneous', 'general', 'uncategorized', 'default'];
  if (genericNames.some((g) => account.name.toLowerCase().includes(g))) {
    score *= 0.7;
  }

  if (account.accountType === 'revenue' && roleKeywords.includes('revenue')) score += 0.1;
  if (account.accountType === 'liability' && roleKeywords.includes('tax')) score += 0.1;
  if (account.accountType === 'asset' && roleKeywords.includes('cash')) score += 0.1;

  return Math.min(score, 1.0);
}

// ── Best-practice payment type defaults ────────────────────────

const PAYMENT_TYPE_BEST_PRACTICES: Record<string, { keywords: string[]; accountNameHints: string[]; accountTypeFilter: string[] }> = {
  cash: {
    keywords: CASH_KEYWORDS,
    accountNameHints: ['Cash on Hand', 'Cash - Register', 'Cash Drawer', 'Petty Cash', 'Cash in Drawer'],
    accountTypeFilter: ['asset'],
  },
  card: {
    keywords: ['card', 'credit', 'debit', 'visa', 'mastercard', 'amex', 'discover', 'undeposited'],
    accountNameHints: ['Undeposited Funds', 'Credit Card Clearing', 'Card Clearing', 'Merchant Clearing'],
    accountTypeFilter: ['asset'],
  },
  check: {
    keywords: ['check', 'cheque', 'undeposited'],
    accountNameHints: ['Undeposited Funds', 'Checks Receivable'],
    accountTypeFilter: ['asset'],
  },
  gift_card: {
    keywords: ['gift', 'stored value', 'deferred', 'liability'],
    accountNameHints: ['Gift Card Liability', 'Deferred Revenue', 'Stored Value Liability'],
    accountTypeFilter: ['liability'],
  },
  house_account: {
    keywords: ['house', 'accounts receivable', 'ar', 'member', 'charge'],
    accountNameHints: ['Accounts Receivable', 'House Accounts', 'Member Charges'],
    accountTypeFilter: ['asset'],
  },
};

/**
 * Find best-practice config for a payment type ID, handling compound IDs like
 * "credit_card" → matches "card" key, "debit" → matches "card" key, etc.
 */
function findPaymentTypePractice(paymentTypeId: string) {
  const lower = paymentTypeId.toLowerCase();
  // Exact match
  if (PAYMENT_TYPE_BEST_PRACTICES[lower]) return PAYMENT_TYPE_BEST_PRACTICES[lower];
  // Normalized (credit-card → credit_card)
  const normalized = lower.replace(/[^a-z]/g, '_');
  if (PAYMENT_TYPE_BEST_PRACTICES[normalized]) return PAYMENT_TYPE_BEST_PRACTICES[normalized];
  // Partial: "credit_card" contains "card" key
  for (const [key, value] of Object.entries(PAYMENT_TYPE_BEST_PRACTICES)) {
    if (lower.includes(key) || key.includes(lower)) return value;
  }
  // Token: "credit_card" → tokens ["credit","card"] → matches "card" key
  const tokens = lower.split(/[_\s-]+/);
  for (const [key, value] of Object.entries(PAYMENT_TYPE_BEST_PRACTICES)) {
    if (tokens.includes(key)) return value;
  }
  return undefined;
}

// ── Main query ────────────────────────────────────────────────

export async function getSmartResolutionSuggestions(
  tenantId: string,
): Promise<SmartResolutionResult> {
  return withTenant(tenantId, async (tx) => {
    // 1. Group unresolved unmapped events by (entity_type, entity_id)
    const groupRows = await tx.execute(sql`
      SELECT
        entity_type,
        entity_id,
        COUNT(*)::int AS event_count,
        MAX(reason) AS sample_reason
      FROM gl_unmapped_events
      WHERE tenant_id = ${tenantId}
        AND resolved_at IS NULL
      GROUP BY entity_type, entity_id
      ORDER BY COUNT(*) DESC
    `);

    const groups = Array.from(groupRows as Iterable<Record<string, unknown>>);
    if (groups.length === 0) {
      return { suggestions: [], totalEvents: 0, autoResolvable: 0, alreadyMapped: 0, skippedErrors: 0 };
    }

    // 2. Fetch all active GL accounts
    const accountRows = await tx.execute(sql`
      SELECT id, account_number, name, account_type
      FROM gl_accounts
      WHERE tenant_id = ${tenantId} AND is_active = true
      ORDER BY account_number
    `);
    const accounts: GLAccount[] = Array.from(accountRows as Iterable<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      accountNumber: String(r.account_number),
      name: String(r.name),
      accountType: String(r.account_type),
    }));

    // 3. Get accounting settings for defaults
    const settings = await getAccountingSettings(tx, tenantId);

    // 4. Collect entity IDs by type for name lookups
    const subDeptIds = groups.filter((g) => String(g.entity_type) === 'sub_department' || String(g.entity_type) === 'discount_account').map((g) => String(g.entity_id));
    const taxGroupIds = groups.filter((g) => String(g.entity_type) === 'tax_group').map((g) => String(g.entity_id));

    // 5. Lookup sub-department names from catalog_categories
    const subDeptNames = new Map<string, string>();
    const filteredSubDeptIds = subDeptIds.filter((id) => id !== 'unmapped');
    if (filteredSubDeptIds.length > 0) {
      const nameRows = await tx.execute(sql`
        SELECT id, name
        FROM catalog_categories
        WHERE tenant_id = ${tenantId}
          AND id IN ${sql`(${sql.join(filteredSubDeptIds.map((id) => sql`${id}`), sql`, `)})`}
      `);
      for (const row of Array.from(nameRows as Iterable<Record<string, unknown>>)) {
        subDeptNames.set(String(row.id), String(row.name));
      }
    }

    // 6. Lookup tax group names
    const taxGroupNames = new Map<string, string>();
    if (taxGroupIds.length > 0) {
      const nameRows = await tx.execute(sql`
        SELECT id, name
        FROM tax_groups
        WHERE tenant_id = ${tenantId}
          AND id IN ${sql`(${sql.join(taxGroupIds.map((id) => sql`${id}`), sql`, `)})`}
      `);
      for (const row of Array.from(nameRows as Iterable<Record<string, unknown>>)) {
        taxGroupNames.set(String(row.id), String(row.name));
      }
    }

    // 7. Batch-fetch existing mappings (3 queries total, not N per entity)
    const [existingSubDeptMappings, existingTaxMappings, ptRows] = await Promise.all([
      batchResolveSubDepartmentAccounts(tx, tenantId),
      batchResolveTaxGroupAccounts(tx, tenantId),
      tx.execute(sql`
        SELECT payment_type_id, cash_account_id
        FROM payment_type_gl_defaults
        WHERE tenant_id = ${tenantId}
      `),
    ]);
    const existingPaymentMappings = new Map<string, string>();
    for (const row of Array.from(ptRows as Iterable<Record<string, unknown>>)) {
      existingPaymentMappings.set(String(row.payment_type_id), String(row.cash_account_id));
    }

    // 8. Generate suggestions per entity
    const suggestions: SuggestedMapping[] = [];
    let totalEvents = 0;
    let autoResolvable = 0;
    let alreadyMapped = 0;
    let skippedErrors = 0;

    for (const group of groups) {
      const entityType = String(group.entity_type);
      const entityId = String(group.entity_id);
      const eventCount = Number(group.event_count);
      totalEvents += eventCount;

      if (entityType === 'posting_error' || entityType === 'no_line_detail') {
        skippedErrors += eventCount;
        continue;
      }

      if (entityType === 'sub_department') {
        const existing = entityId !== 'unmapped' ? existingSubDeptMappings.get(entityId) ?? null : null;
        if (existing) {
          alreadyMapped += eventCount;
          const acct = accounts.find((a) => a.id === existing.revenueAccountId);
          suggestions.push({ entityType, entityId, entityName: subDeptNames.get(entityId) ?? entityId, suggestedAccountId: existing.revenueAccountId, suggestedAccountNumber: acct?.accountNumber ?? '', suggestedAccountName: acct?.name ?? '', confidence: 'high', reason: 'Existing mapping — resolve stale events', alreadyMapped: true, eventCount });
          continue;
        }

        const entityName = entityId === 'unmapped' ? 'Uncategorized Items' : (subDeptNames.get(entityId) ?? entityId);
        const revenueAccounts = accounts.filter((a) => a.accountType === 'revenue');

        if (entityId === 'unmapped') {
          const fallbackId = settings?.defaultUncategorizedRevenueAccountId;
          const fallbackAccount = fallbackId ? accounts.find((a) => a.id === fallbackId) : revenueAccounts.find((a) => a.name.toLowerCase().includes('uncategorized') || a.accountNumber === '49900');
          if (fallbackAccount) {
            suggestions.push({ entityType, entityId, entityName, suggestedAccountId: fallbackAccount.id, suggestedAccountNumber: fallbackAccount.accountNumber, suggestedAccountName: fallbackAccount.name, confidence: 'medium', reason: `Best practice: uncategorized items → ${fallbackAccount.name}`, alreadyMapped: false, eventCount });
            autoResolvable += eventCount;
          }
          continue;
        }

        let bestAccount: GLAccount | null = null;
        let bestScore = 0;
        for (const acct of revenueAccounts) {
          const score = scoreAccountMatch(entityName, acct, REVENUE_KEYWORDS);
          if (score > bestScore) { bestScore = score; bestAccount = acct; }
        }

        if (bestAccount && bestScore > 0.2) {
          const confidence: SuggestedMapping['confidence'] = bestScore >= 0.5 ? 'high' : bestScore >= 0.3 ? 'medium' : 'low';
          suggestions.push({ entityType, entityId, entityName, suggestedAccountId: bestAccount.id, suggestedAccountNumber: bestAccount.accountNumber, suggestedAccountName: bestAccount.name, confidence, reason: `Semantic match: "${entityName}" → ${bestAccount.name} (${Math.round(bestScore * 100)}%)`, alreadyMapped: false, eventCount });
          if (confidence !== 'low') autoResolvable += eventCount;
        } else {
          const fallbackId = settings?.defaultUncategorizedRevenueAccountId;
          const fb = fallbackId ? accounts.find((a) => a.id === fallbackId) : null;
          if (fb) {
            suggestions.push({ entityType, entityId, entityName, suggestedAccountId: fb.id, suggestedAccountNumber: fb.accountNumber, suggestedAccountName: fb.name, confidence: 'low', reason: `Fallback: no strong match, using ${fb.name}`, alreadyMapped: false, eventCount });
            // Low confidence fallbacks are NOT counted as auto-resolvable
          }
        }
      } else if (entityType === 'payment_type') {
        const existingAccountId = existingPaymentMappings.get(entityId);
        if (existingAccountId) {
          alreadyMapped += eventCount;
          const acct = accounts.find((a) => a.id === existingAccountId);
          suggestions.push({ entityType, entityId, entityName: entityId, suggestedAccountId: existingAccountId, suggestedAccountNumber: acct?.accountNumber ?? '', suggestedAccountName: acct?.name ?? '', confidence: 'high', reason: 'Existing mapping — resolve stale events', alreadyMapped: true, eventCount });
          continue;
        }

        const practice = findPaymentTypePractice(entityId);
        let bestAccount: GLAccount | null = null;

        if (practice) {
          const eligible = accounts.filter((a) => practice.accountTypeFilter.includes(a.accountType));
          for (const hint of practice.accountNameHints) {
            const match = eligible.find((a) => a.name.toLowerCase().includes(hint.toLowerCase()));
            if (match) { bestAccount = match; break; }
          }
          if (!bestAccount) {
            let bestScore = 0;
            for (const acct of eligible) {
              const score = scoreAccountMatch(entityId, acct, practice.keywords);
              if (score > bestScore) { bestScore = score; bestAccount = acct; }
            }
          }
        }

        if (!bestAccount && entityId.toLowerCase() === 'cash') {
          const uid = settings?.defaultUndepositedFundsAccountId;
          if (uid) bestAccount = accounts.find((a) => a.id === uid) ?? null;
        }

        const displayName = entityId.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        if (bestAccount) {
          suggestions.push({ entityType, entityId, entityName: displayName, suggestedAccountId: bestAccount.id, suggestedAccountNumber: bestAccount.accountNumber, suggestedAccountName: bestAccount.name, confidence: 'high', reason: `Best practice: ${displayName} payments → ${bestAccount.name}`, alreadyMapped: false, eventCount });
          autoResolvable += eventCount;
        } else {
          // Fallback: use Undeposited Funds for unknown payment types
          const uid = settings?.defaultUndepositedFundsAccountId;
          const fallbackAccount = uid ? accounts.find((a) => a.id === uid) : accounts.find((a) => a.name.toLowerCase().includes('undeposited'));
          if (fallbackAccount) {
            suggestions.push({ entityType, entityId, entityName: displayName, suggestedAccountId: fallbackAccount.id, suggestedAccountNumber: fallbackAccount.accountNumber, suggestedAccountName: fallbackAccount.name, confidence: 'low', reason: `Fallback: no specific match, using ${fallbackAccount.name}`, alreadyMapped: false, eventCount });
          }
        }
      } else if (entityType === 'tax_group') {
        const existingTaxAccountId = existingTaxMappings.get(entityId) ?? null;
        if (existingTaxAccountId) {
          alreadyMapped += eventCount;
          const acct = accounts.find((a) => a.id === existingTaxAccountId);
          suggestions.push({ entityType, entityId, entityName: taxGroupNames.get(entityId) ?? entityId, suggestedAccountId: existingTaxAccountId, suggestedAccountNumber: acct?.accountNumber ?? '', suggestedAccountName: acct?.name ?? '', confidence: 'high', reason: 'Existing mapping — resolve stale events', alreadyMapped: true, eventCount });
          continue;
        }

        const taxPayableId = settings?.defaultSalesTaxPayableAccountId;
        let taxAccount = taxPayableId ? accounts.find((a) => a.id === taxPayableId) ?? null : null;

        if (!taxAccount) {
          const taxLiabilityAccounts = accounts.filter((a) => a.accountType === 'liability');
          let bestScore = 0;
          for (const acct of taxLiabilityAccounts) {
            const score = scoreAccountMatch('sales tax payable', acct, TAX_KEYWORDS);
            if (score > bestScore) { bestScore = score; taxAccount = acct; }
          }
        }

        if (taxAccount) {
          suggestions.push({ entityType, entityId, entityName: taxGroupNames.get(entityId) ?? entityId, suggestedAccountId: taxAccount.id, suggestedAccountNumber: taxAccount.accountNumber, suggestedAccountName: taxAccount.name, confidence: 'high', reason: `Best practice: tax groups → ${taxAccount.name}`, alreadyMapped: false, eventCount });
          autoResolvable += eventCount;
        }
      } else if (entityType === 'discount_account') {
        const existingSubDept = entityId !== 'unmapped' ? existingSubDeptMappings.get(entityId) ?? null : null;
        if (existingSubDept?.discountAccountId) { alreadyMapped += eventCount; continue; }

        const entityName = entityId === 'unmapped' ? 'Default Discount' : (subDeptNames.get(entityId) ?? entityId);
        const discountId = settings?.defaultDiscountAccountId;
        const discountAccount = discountId ? accounts.find((a) => a.id === discountId) : null;
        if (discountAccount) {
          suggestions.push({ entityType, entityId, entityName, suggestedAccountId: discountAccount.id, suggestedAccountNumber: discountAccount.accountNumber, suggestedAccountName: discountAccount.name, confidence: 'medium', reason: `Default discount account: ${discountAccount.name}`, alreadyMapped: false, eventCount });
          autoResolvable += eventCount;
        } else {
          // No default configured — try semantic match on contra-revenue accounts
          const discountKeywords = ['discount', 'allowance', 'contra', 'markdown', 'reduction'];
          const contraRevenue = accounts.filter((a) => a.accountType === 'revenue' || a.accountType === 'contra_revenue');
          let bestAccount: GLAccount | null = null;
          let bestScore = 0;
          for (const a of contraRevenue) {
            const score = scoreAccountMatch('Discount', a, discountKeywords);
            if (score > bestScore) { bestScore = score; bestAccount = a; }
          }
          if (bestAccount && bestScore > 0.2) {
            const confidence: SuggestedMapping['confidence'] = bestScore >= 0.5 ? 'high' : bestScore >= 0.3 ? 'medium' : 'low';
            suggestions.push({ entityType, entityId, entityName, suggestedAccountId: bestAccount.id, suggestedAccountNumber: bestAccount.accountNumber, suggestedAccountName: bestAccount.name, confidence, reason: `Semantic match: "${entityName}" → ${bestAccount.name} (${Math.round(bestScore * 100)}%)`, alreadyMapped: false, eventCount });
            if (confidence !== 'low') autoResolvable += eventCount;
          }
        }
      } else if (entityType === 'tips_payable_account' || entityType === 'service_charge_account') {
        const label = entityType === 'tips_payable_account' ? 'Tips Payable' : 'Service Charge Revenue';
        const accountId = entityType === 'tips_payable_account' ? settings?.defaultTipsPayableAccountId : settings?.defaultServiceChargeRevenueAccountId;
        const acct = accountId ? accounts.find((a) => a.id === accountId) : null;
        if (acct) {
          // Settings configured — events just need resolution
          suggestions.push({ entityType, entityId, entityName: label, suggestedAccountId: acct.id, suggestedAccountNumber: acct.accountNumber, suggestedAccountName: acct.name, confidence: 'high', reason: `Settings configured: ${acct.name} — resolve stale events`, alreadyMapped: false, eventCount });
          autoResolvable += eventCount;
        } else {
          // Settings NOT configured — try semantic match
          const roleKeywords = entityType === 'tips_payable_account' ? ['tips', 'payable', 'gratuity', 'liability'] : ['service', 'charge', 'revenue'];
          const typeFilter = entityType === 'tips_payable_account' ? 'liability' : 'revenue';
          const eligible = accounts.filter((a) => a.accountType === typeFilter);
          let bestAccount: GLAccount | null = null;
          let bestScore = 0;
          for (const a of eligible) {
            const score = scoreAccountMatch(label, a, roleKeywords);
            if (score > bestScore) { bestScore = score; bestAccount = a; }
          }
          if (bestAccount && bestScore > 0.2) {
            const confidence: SuggestedMapping['confidence'] = bestScore >= 0.5 ? 'high' : bestScore >= 0.3 ? 'medium' : 'low';
            suggestions.push({ entityType, entityId, entityName: label, suggestedAccountId: bestAccount.id, suggestedAccountNumber: bestAccount.accountNumber, suggestedAccountName: bestAccount.name, confidence, reason: `Semantic match: "${label}" → ${bestAccount.name} (${Math.round(bestScore * 100)}%)`, alreadyMapped: false, eventCount });
            if (confidence !== 'low') autoResolvable += eventCount;
          }
        }
      }
    }

    // Sort: actionable first (high → medium → low), already-mapped last
    const CONFIDENCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => {
      if (a.alreadyMapped !== b.alreadyMapped) return a.alreadyMapped ? 1 : -1;
      const ca = CONFIDENCE_ORDER[a.confidence] ?? 3;
      const cb = CONFIDENCE_ORDER[b.confidence] ?? 3;
      if (ca !== cb) return ca - cb;
      return b.eventCount - a.eventCount;
    });

    return { suggestions, totalEvents, autoResolvable, alreadyMapped, skippedErrors };
  });
}
