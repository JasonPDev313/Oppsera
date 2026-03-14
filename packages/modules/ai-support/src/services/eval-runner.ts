/**
 * AI Assistant Evaluation Runner — Session 11.5
 *
 * Runs the 50 benchmark questions defined in AI_ASSISTANT_EVAL_SET.md against the
 * AI assistant orchestrator (or a retrieval-only mock) and scores each answer against
 * expected traits, confidence band, and source tier.
 *
 * Usable as:
 *   - Importable module: `import { runEval, EVAL_QUESTIONS } from './eval-runner'`
 *   - CLI script: `npx tsx packages/modules/ai-support/src/services/eval-runner.ts`
 */

import type { AiAssistantContext, SourceTier } from '../types';
import { retrieveForEval } from './eval-retrieval';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EvalQuestion {
  id: string;
  category: string;
  question: string;
  route: string;
  moduleKey?: string;
  expectedMode: string;
  expectedConfidence: string;
  expectedSourceTier: string;
  requiredTraits: string[];
}

export interface EvalResult {
  questionId: string;
  question: string;
  category: string;
  pass: boolean;
  partial: boolean;
  matchedTraits: string[];
  missedTraits: string[];
  actualConfidence: string;
  confidenceMatch: boolean;
  actualSourceTier: string;
  sourceTierMatch: boolean;
  answerSnippet: string;
  errorMessage?: string;
}

export interface EvalSummary {
  totalQuestions: number;
  passed: number;
  partial: number;
  failed: number;
  passRate: number;
  confidenceAccuracy: number;
  sourceTierAccuracy: number;
  traitCoverageRate: number;
  results: EvalResult[];
}

// ── Benchmark Question Set ───────────────────────────────────────────────────

export const EVAL_QUESTIONS: EvalQuestion[] = [
  // ── Category 1: What does this page/button do? ───────────────────────────
  {
    id: 'Q01',
    category: 'page-explain',
    question: 'What does the Dashboard page show?',
    route: '/dashboard',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['dashboard', 'summary', 'home'],
  },
  {
    id: 'Q02',
    category: 'page-explain',
    question: 'What is the "New Sale" button on the POS Retail screen?',
    route: '/pos/retail',
    moduleKey: 'pos',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['new sale', 'transaction', 'cart'],
  },
  {
    id: 'Q03',
    category: 'page-explain',
    question: 'What does the "Fire" button do on the F&B POS screen?',
    route: '/pos/fnb',
    moduleKey: 'fnb',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['fire', 'kitchen', 'course'],
  },
  {
    id: 'Q04',
    category: 'page-explain',
    question: 'What does the Orders list page show?',
    route: '/orders',
    moduleKey: 'orders',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['orders', 'list', 'status'],
  },
  {
    id: 'Q05',
    category: 'page-explain',
    question: 'What is the "Void" button on the order detail page?',
    route: '/orders/[id]',
    moduleKey: 'orders',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['void', 'cancel', 'permission'],
  },
  {
    id: 'Q06',
    category: 'page-explain',
    question: 'What does the Catalog page do?',
    route: '/catalog',
    moduleKey: 'catalog',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['catalog', 'product', 'item'],
  },
  {
    id: 'Q07',
    category: 'page-explain',
    question: 'What does the Inventory page track?',
    route: '/inventory',
    moduleKey: 'inventory',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['inventory', 'stock', 'quantity'],
  },
  {
    id: 'Q08',
    category: 'page-explain',
    question: 'What does the Customers list page show?',
    route: '/customers',
    moduleKey: 'customers',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['customer', 'list', 'profile'],
  },
  {
    id: 'Q09',
    category: 'page-explain',
    question: 'What information is on the Customer detail page?',
    route: '/customers/[id]',
    moduleKey: 'customers',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['contact', 'history', 'edit'],
  },
  {
    id: 'Q10',
    category: 'page-explain',
    question: 'What is the General Ledger page in Accounting?',
    route: '/accounting/gl',
    moduleKey: 'accounting',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['ledger', 'account', 'transaction'],
  },
  {
    id: 'Q11',
    category: 'page-explain',
    question: 'What does the Journal Entry form do?',
    route: '/accounting/journal-entries/new',
    moduleKey: 'accounting',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['journal', 'debit', 'credit'],
  },
  {
    id: 'Q12',
    category: 'page-explain',
    question: 'What does the Reports page offer?',
    route: '/reports',
    moduleKey: 'reporting',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['report', 'filter', 'export'],
  },
  {
    id: 'Q13',
    category: 'page-explain',
    question: 'What can I configure on the Settings page?',
    route: '/settings/general',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['settings', 'business', 'timezone'],
  },
  {
    id: 'Q14',
    category: 'page-explain',
    question: 'What does the Membership page manage?',
    route: '/membership',
    moduleKey: 'membership',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['membership', 'plan', 'customer'],
  },
  {
    id: 'Q15',
    category: 'page-explain',
    question: 'What does the Marketing page do?',
    route: '/marketing',
    moduleKey: 'marketing',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['campaign', 'customer', 'notification'],
  },

  // ── Category 2: How do I...? ─────────────────────────────────────────────
  {
    id: 'Q16',
    category: 'how-to',
    question: 'How do I process a refund on an order?',
    route: '/orders/[id]',
    moduleKey: 'orders',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['refund', 'step', 'permission'],
  },
  {
    id: 'Q17',
    category: 'how-to',
    question: 'How do I close a batch at end of day?',
    route: '/pos/retail',
    moduleKey: 'pos',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['batch', 'close', 'totals'],
  },
  {
    id: 'Q18',
    category: 'how-to',
    question: 'How do I transfer a tab to another table in F&B?',
    route: '/pos/fnb',
    moduleKey: 'fnb',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['transfer', 'table', 'tab'],
  },
  {
    id: 'Q19',
    category: 'how-to',
    question: 'How do I receive new inventory stock?',
    route: '/inventory',
    moduleKey: 'inventory',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['receive', 'quantity', 'stock'],
  },
  {
    id: 'Q20',
    category: 'how-to',
    question: 'How do I post a manual journal entry?',
    route: '/accounting/journal-entries/new',
    moduleKey: 'accounting',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['journal', 'balance', 'post'],
  },
  {
    id: 'Q21',
    category: 'how-to',
    question: 'How do I create a new catalog item?',
    route: '/catalog/new',
    moduleKey: 'catalog',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['name', 'price', 'save'],
  },
  {
    id: 'Q22',
    category: 'how-to',
    question: 'How do I add a new customer?',
    route: '/customers/new',
    moduleKey: 'customers',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['name', 'email', 'save'],
  },
  {
    id: 'Q23',
    category: 'how-to',
    question: 'How do I run an end-of-day sales report?',
    route: '/reports',
    moduleKey: 'reporting',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['report', 'date', 'generate'],
  },
  {
    id: 'Q24',
    category: 'how-to',
    question: 'How do I set up a discount for a product?',
    route: '/catalog',
    moduleKey: 'catalog',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['discount', 'percentage', 'item'],
  },
  {
    id: 'Q25',
    category: 'how-to',
    question: 'How do I void an order?',
    route: '/orders/[id]',
    moduleKey: 'orders',
    expectedMode: 'guide',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['void', 'confirm', 'permission'],
  },

  // ── Category 3: Why is this disabled/stuck/different? ───────────────────
  {
    id: 'Q26',
    category: 'diagnose',
    question: 'Why is the Refund button greyed out on this order?',
    route: '/orders/[id]',
    moduleKey: 'orders',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['permission', 'settled', 'role'],
  },
  {
    id: 'Q27',
    category: 'diagnose',
    question: 'Why does it say the batch is already closed when I try to close it?',
    route: '/pos/retail',
    moduleKey: 'pos',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['batch', 'closed', 'shift'],
  },
  {
    id: 'Q28',
    category: 'diagnose',
    question: 'Why am I getting a "No open shift" error when I try to process a sale?',
    route: '/pos/retail',
    moduleKey: 'pos',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['shift', 'open', 'start'],
  },
  {
    id: 'Q29',
    category: 'diagnose',
    question: "Why can't I see the Accounting menu item?",
    route: '/dashboard',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['permission', 'module', 'role'],
  },
  {
    id: 'Q30',
    category: 'diagnose',
    question: 'Why is the KDS not showing any incoming orders?',
    route: '/kds',
    moduleKey: 'kds',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['station', 'location', 'fire'],
  },
  {
    id: 'Q31',
    category: 'diagnose',
    question: "Why is my inventory count different from what the system shows?",
    route: '/inventory',
    moduleKey: 'inventory',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['adjustment', 'sync', 'count'],
  },
  {
    id: 'Q32',
    category: 'diagnose',
    question: 'Why is the "Post Journal Entry" button disabled?',
    route: '/accounting/journal-entries/new',
    moduleKey: 'accounting',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['balance', 'debit', 'permission'],
  },
  {
    id: 'Q33',
    category: 'diagnose',
    question: 'Why is an order stuck in "Pending" status?',
    route: '/orders/[id]',
    moduleKey: 'orders',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['payment', 'pending', 'failed'],
  },
  {
    id: 'Q34',
    category: 'diagnose',
    question: 'Why does the order total not match the payment amount?',
    route: '/orders/[id]',
    moduleKey: 'orders',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['partial', 'tip', 'discount'],
  },
  {
    id: 'Q35',
    category: 'diagnose',
    question: 'Why is GL posting not happening automatically for my orders?',
    route: '/accounting/gl',
    moduleKey: 'accounting',
    expectedMode: 'diagnose',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['gl', 'adapter', 'configured'],
  },

  // ── Category 4: Who can access this? ────────────────────────────────────
  {
    id: 'Q36',
    category: 'permissions',
    question: 'Who can process a refund?',
    route: '/orders/[id]',
    moduleKey: 'orders',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['permission', 'manager', 'role'],
  },
  {
    id: 'Q37',
    category: 'permissions',
    question: 'Who can see the Reports page?',
    route: '/reports',
    moduleKey: 'reporting',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['manager', 'owner', 'cashier'],
  },
  {
    id: 'Q38',
    category: 'permissions',
    question: 'Who can modify catalog items?',
    route: '/catalog',
    moduleKey: 'catalog',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['catalog', 'permission', 'manager'],
  },
  {
    id: 'Q39',
    category: 'permissions',
    question: 'Who can post manual journal entries?',
    route: '/accounting/journal-entries/new',
    moduleKey: 'accounting',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['accounting', 'manager', 'owner'],
  },
  {
    id: 'Q40',
    category: 'permissions',
    question: 'Who can manage users and roles?',
    route: '/settings/users',
    expectedMode: 'explain',
    expectedConfidence: 'medium',
    expectedSourceTier: 't4',
    requiredTraits: ['owner', 'role', 'user'],
  },

  // ── Category 5: What changed recently? ──────────────────────────────────
  {
    id: 'Q41',
    category: 'release-aware',
    question: 'What new features were added to the KDS recently?',
    route: '/kds',
    moduleKey: 'kds',
    expectedMode: 'explain',
    expectedConfidence: 'low',
    expectedSourceTier: 't5',
    requiredTraits: ['release', 'changelog', 'contact'],
  },
  {
    id: 'Q42',
    category: 'release-aware',
    question: 'Was there a rename of any field in the F&B module lately?',
    route: '/pos/fnb',
    moduleKey: 'fnb',
    expectedMode: 'explain',
    expectedConfidence: 'low',
    expectedSourceTier: 't5',
    requiredTraits: ['release', 'rename', 'changelog'],
  },
  {
    id: 'Q43',
    category: 'release-aware',
    question: 'Did the workflow for closing a tab change in a recent update?',
    route: '/pos/fnb',
    moduleKey: 'fnb',
    expectedMode: 'explain',
    expectedConfidence: 'low',
    expectedSourceTier: 't5',
    requiredTraits: ['recent', 'change', 'update'],
  },
  {
    id: 'Q44',
    category: 'release-aware',
    question: 'Was the navigation menu reorganized recently?',
    route: '/dashboard',
    expectedMode: 'explain',
    expectedConfidence: 'low',
    expectedSourceTier: 't5',
    requiredTraits: ['navigation', 'release', 'confirm'],
  },
  {
    id: 'Q45',
    category: 'release-aware',
    question: 'Is there a new module that was added recently?',
    route: '/dashboard',
    expectedMode: 'explain',
    expectedConfidence: 'low',
    expectedSourceTier: 't5',
    requiredTraits: ['module', 'available', 'admin'],
  },

  // ── Category 6: Edge Cases ───────────────────────────────────────────────
  {
    id: 'Q46',
    category: 'edge-case',
    question: 'Can I integrate OppsEra with my existing accounting software like QuickBooks?',
    route: '/settings/general',
    expectedMode: 'escalate',
    expectedConfidence: 'low',
    expectedSourceTier: 't6',
    requiredTraits: ['support', 'contact', 'integration'],
  },
  {
    id: 'Q47',
    category: 'edge-case',
    question: 'How do I handle a chargeback dispute with my payment processor?',
    route: '/orders/[id]',
    moduleKey: 'payments',
    expectedMode: 'escalate',
    expectedConfidence: 'low',
    expectedSourceTier: 't6',
    requiredTraits: ['chargeback', 'processor', 'contact'],
  },
  {
    id: 'Q48',
    category: 'edge-case',
    question: 'Can you add a custom field to the customer profile for my business?',
    route: '/customers',
    moduleKey: 'customers',
    expectedMode: 'escalate',
    expectedConfidence: 'low',
    expectedSourceTier: 't6',
    requiredTraits: ['custom', 'support', 'implementation'],
  },
  {
    id: 'Q49',
    category: 'edge-case',
    question: 'When will the golf module be available for my account?',
    route: '/dashboard',
    expectedMode: 'escalate',
    expectedConfidence: 'low',
    expectedSourceTier: 't6',
    requiredTraits: ['roadmap', 'contact', 'sales'],
  },
  {
    id: 'Q50',
    category: 'edge-case',
    question: 'Can you show me a report comparing my revenue to industry benchmarks?',
    route: '/reports',
    moduleKey: 'reporting',
    expectedMode: 'escalate',
    expectedConfidence: 'low',
    expectedSourceTier: 't6',
    requiredTraits: ['benchmark', 'not', 'available'],
  },
];

// ── Trait Matcher ────────────────────────────────────────────────────────────

/**
 * Simple case-insensitive keyword matching against answer text.
 * Returns a list of matched trait keywords and missed ones.
 */
function matchTraits(
  answerText: string,
  requiredTraits: string[],
): { matchedTraits: string[]; missedTraits: string[] } {
  const lowerAnswer = answerText.toLowerCase();
  const matchedTraits: string[] = [];
  const missedTraits: string[] = [];

  for (const trait of requiredTraits) {
    const lowerTrait = trait.toLowerCase();
    if (lowerAnswer.includes(lowerTrait)) {
      matchedTraits.push(trait);
    } else {
      missedTraits.push(trait);
    }
  }

  return { matchedTraits, missedTraits };
}

// ── Retrieval-Only Evaluation Backend ────────────────────────────────────────

/**
 * Interface for the evaluation backend.
 * The default implementation uses retrieval-only (no LLM call) to keep the
 * eval cheap and deterministic. Pass a custom backend to test with the full
 * orchestrator.
 */
export interface EvalBackend {
  answer(question: EvalQuestion): Promise<{
    answerText: string;
    confidence: string;
    sourceTier: string;
  }>;
}

/**
 * Default backend: retrieval-only. Concatenates evidence text from T2/T3/T4
 * without making an LLM call. Good for testing retrieval pipeline coverage.
 */
export class RetrievalOnlyBackend implements EvalBackend {
  private tenantId: string;
  private locationId: string | undefined;

  constructor(tenantId: string, locationId?: string) {
    this.tenantId = tenantId;
    this.locationId = locationId;
  }

  async answer(question: EvalQuestion): Promise<{
    answerText: string;
    confidence: string;
    sourceTier: string;
  }> {
    const context: AiAssistantContext = {
      route: question.route,
      moduleKey: question.moduleKey,
      tenantId: this.tenantId,
      locationId: this.locationId,
      roleKeys: ['manager'], // Default eval role
    };

    const { evidence, confidence, sourceTier } = await retrieveForEval(
      context,
      question.question,
    );

    // Concatenate all evidence content for trait matching
    const answerText = evidence.map((e) => e.content).join('\n\n');

    return { answerText, confidence, sourceTier };
  }
}

// ── Question Evaluator ────────────────────────────────────────────────────────

async function evaluateQuestion(
  question: EvalQuestion,
  backend: EvalBackend,
): Promise<EvalResult> {
  let answerText = '';
  let actualConfidence = 'low';
  let actualSourceTier = 't6';
  let errorMessage: string | undefined;

  try {
    const result = await backend.answer(question);
    answerText = result.answerText;
    actualConfidence = result.confidence;
    actualSourceTier = result.sourceTier;
  } catch (err) {
    errorMessage =
      err instanceof Error ? err.message : 'Unknown error during evaluation';
    // Fall through with empty answer — all traits will miss
  }

  const { matchedTraits, missedTraits } = matchTraits(
    answerText,
    question.requiredTraits,
  );

  const totalTraits = question.requiredTraits.length;
  const pass = missedTraits.length === 0;
  const partial = !pass && matchedTraits.length > 0;

  const confidenceMatch = actualConfidence === question.expectedConfidence;

  // Source tier matching: exact match OR the actual tier is "better" (lower number)
  // For tiers t2 > t3 > t4 > t5 > t6 > t7 (lower = higher trust)
  const tierIndex = (tier: string) => {
    const order: SourceTier[] = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
    return order.indexOf(tier as SourceTier);
  };
  const actualTierIdx = tierIndex(actualSourceTier);
  const expectedTierIdx = tierIndex(question.expectedSourceTier);
  // Consider a match if actual tier is within ±1 of expected (to handle evidence found at adjacent tier)
  const sourceTierMatch =
    actualSourceTier === question.expectedSourceTier ||
    Math.abs(actualTierIdx - expectedTierIdx) <= 1;

  return {
    questionId: question.id,
    question: question.question,
    category: question.category,
    pass,
    partial,
    matchedTraits,
    missedTraits,
    actualConfidence,
    confidenceMatch,
    actualSourceTier,
    sourceTierMatch,
    answerSnippet: answerText.slice(0, 200).replace(/\n/g, ' '),
    errorMessage,
    // Include trait coverage count for debugging
    ...({ _traitCoverage: `${matchedTraits.length}/${totalTraits}` } as object),
  };
}

// ── Summary Builder ───────────────────────────────────────────────────────────

function buildSummary(results: EvalResult[]): EvalSummary {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const partial = results.filter((r) => !r.pass && r.partial).length;
  const failed = results.filter((r) => !r.pass && !r.partial).length;

  const confidenceAccurate = results.filter((r) => r.confidenceMatch).length;
  const tierAccurate = results.filter((r) => r.sourceTierMatch).length;

  const totalTraitsRequired = results.reduce(
    (sum, r) => sum + r.matchedTraits.length + r.missedTraits.length,
    0,
  );
  const totalTraitsMatched = results.reduce(
    (sum, r) => sum + r.matchedTraits.length,
    0,
  );

  return {
    totalQuestions: total,
    passed,
    partial,
    failed,
    passRate: total > 0 ? passed / total : 0,
    confidenceAccuracy: total > 0 ? confidenceAccurate / total : 0,
    sourceTierAccuracy: total > 0 ? tierAccurate / total : 0,
    traitCoverageRate:
      totalTraitsRequired > 0 ? totalTraitsMatched / totalTraitsRequired : 0,
    results,
  };
}

// ── Main Eval Runner ──────────────────────────────────────────────────────────

export interface RunEvalOptions {
  /** Subset of question IDs to run. Omit to run all 50. */
  questionIds?: string[];
  /** Categories to include. Omit to include all. */
  categories?: string[];
  /** Custom backend for answering questions. Defaults to RetrievalOnlyBackend. */
  backend?: EvalBackend;
  /** Tenant ID to use for context. Defaults to 'eval-tenant'. */
  tenantId?: string;
  /** Location ID to use for context. Optional. */
  locationId?: string;
  /** Max concurrent questions to evaluate. Defaults to 5. */
  concurrency?: number;
  /** Called after each question is evaluated. Useful for progress reporting. */
  onProgress?: (result: EvalResult, index: number, total: number) => void;
}

/**
 * Run the full evaluation benchmark (or a subset) against the provided backend.
 *
 * @returns EvalSummary with per-question results and aggregate stats.
 *
 * @example
 * ```ts
 * const summary = await runEval({ tenantId: 'my-tenant' });
 * console.log(`Pass rate: ${(summary.passRate * 100).toFixed(1)}%`);
 * ```
 */
export async function runEval(options: RunEvalOptions = {}): Promise<EvalSummary> {
  const {
    questionIds,
    categories,
    tenantId = 'eval-tenant',
    locationId,
    concurrency = 5,
    onProgress,
  } = options;

  // Filter questions
  let questions = EVAL_QUESTIONS;
  if (questionIds && questionIds.length > 0) {
    questions = questions.filter((q) => questionIds.includes(q.id));
  }
  if (categories && categories.length > 0) {
    questions = questions.filter((q) => categories.includes(q.category));
  }

  // Set up backend
  const backend =
    options.backend ?? new RetrievalOnlyBackend(tenantId, locationId);

  // Run questions with limited concurrency
  const results: EvalResult[] = [];
  const total = questions.length;
  let completed = 0;

  // Process in batches
  for (let batchStart = 0; batchStart < total; batchStart += concurrency) {
    const batch = questions.slice(batchStart, batchStart + concurrency);
    const batchResults = await Promise.all(
      batch.map((question) => evaluateQuestion(question, backend)),
    );

    for (const batchResult of batchResults) {
      results.push(batchResult);
      completed++;
      onProgress?.(batchResult, completed, total);
    }
  }

  return buildSummary(results);
}

// ── CLI Printer ───────────────────────────────────────────────────────────────

function printSummary(summary: EvalSummary): void {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  console.log('\n' + '═'.repeat(70));
  console.log('  AI ASSISTANT EVALUATION RESULTS');
  console.log('═'.repeat(70));
  console.log(`  Total questions   : ${summary.totalQuestions}`);
  console.log(`  Passed            : ${summary.passed} (${pct(summary.passRate)})`);
  console.log(`  Partial           : ${summary.partial}`);
  console.log(`  Failed            : ${summary.failed}`);
  console.log(`  Confidence acc.   : ${pct(summary.confidenceAccuracy)}`);
  console.log(`  Source tier acc.  : ${pct(summary.sourceTierAccuracy)}`);
  console.log(`  Trait coverage    : ${pct(summary.traitCoverageRate)}`);
  console.log('─'.repeat(70));

  // Group by category
  const byCategory = new Map<string, EvalResult[]>();
  for (const r of summary.results) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  for (const [category, catResults] of byCategory) {
    const catPassed = catResults.filter((r) => r.pass).length;
    const catTotal = catResults.length;
    console.log(`\n  [${category}] ${catPassed}/${catTotal} passed`);
    for (const r of catResults) {
      const icon = r.pass ? '✓' : r.partial ? '~' : '✗';
      const traitInfo = `${r.matchedTraits.length}/${r.matchedTraits.length + r.missedTraits.length} traits`;
      const confIcon = r.confidenceMatch ? 'C✓' : `C✗(${r.actualConfidence})`;
      const tierIcon = r.sourceTierMatch ? 'T✓' : `T✗(${r.actualSourceTier})`;
      console.log(`    ${icon} ${r.questionId}: ${traitInfo} | ${confIcon} | ${tierIcon}`);
      if (r.missedTraits.length > 0) {
        console.log(`        missed: ${r.missedTraits.join(', ')}`);
      }
      if (r.errorMessage) {
        console.log(`        error: ${r.errorMessage}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(70));
}

// ── CLI Entry Point ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Parse simple CLI args
  const args = process.argv.slice(2);
  const tenantId = args.find((a) => a.startsWith('--tenant='))?.split('=')[1] ?? 'eval-tenant';
  const locationId = args.find((a) => a.startsWith('--location='))?.split('=')[1];
  const onlyCategories = args
    .filter((a) => a.startsWith('--category='))
    .map((a) => a.split('=')[1])
    .filter((v): v is string => v !== undefined);
  const onlyIds = args
    .filter((a) => a.startsWith('--id='))
    .map((a) => a.split('=')[1])
    .filter((v): v is string => v !== undefined);
  const concurrencyArg = args.find((a) => a.startsWith('--concurrency='))?.split('=')[1];
  const concurrency = concurrencyArg ? parseInt(concurrencyArg, 10) : 5;

  console.log('[eval-runner] Starting evaluation run...');
  console.log(`  tenant: ${tenantId}`);
  if (locationId) console.log(`  location: ${locationId}`);
  if (onlyCategories.length > 0) console.log(`  categories: ${onlyCategories.join(', ')}`);
  if (onlyIds.length > 0) console.log(`  ids: ${onlyIds.join(', ')}`);

  let completed = 0;
  const summary = await runEval({
    tenantId,
    locationId,
    categories: onlyCategories.length > 0 ? onlyCategories : undefined,
    questionIds: onlyIds.length > 0 ? onlyIds : undefined,
    concurrency,
    onProgress: (result, idx, total) => {
      completed++;
      const icon = result.pass ? '✓' : result.partial ? '~' : '✗';
      process.stdout.write(
        `\r  Progress: ${completed}/${total} — last: ${icon} ${result.questionId}   `,
      );
    },
  });

  console.log(''); // newline after progress
  printSummary(summary);

  // Exit with non-zero if pass rate is below 50%
  process.exit(summary.passRate < 0.5 ? 1 : 0);
}

// Run as script if invoked directly
if (
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('eval-runner.ts')
) {
  main().catch((err) => {
    console.error('[eval-runner] Fatal error:', err);
    process.exit(1);
  });
}
