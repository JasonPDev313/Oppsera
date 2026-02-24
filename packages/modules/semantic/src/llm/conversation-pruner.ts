// -- Token-Aware Conversation Pruner ------------------------------------------
// Replaces hard-coded message limits (10 in frontend, 5 in intent-resolver,
// 3 in sql-generator) with a token-budget-based pruning strategy.
//
// All functions are pure -- no side effects, no external imports beyond types.

import type { LLMMessage } from './types';

// -- Types --------------------------------------------------------------------

export interface PruneOptions {
  /** Maximum token budget for the returned messages. Default: 2000. */
  maxTokens?: number;
  /** Pruning strategy. 'recent' keeps newest messages. 'summarize' is V2. Default: 'recent'. */
  strategy?: 'recent' | 'summarize';
  /** Always keep the last N messages regardless of budget. Default: 2. */
  preserveLatest?: number;
}

// -- Token estimation ---------------------------------------------------------

/**
 * Conservative character-based token estimate.
 * ~4 characters per token for English text. Slightly over-estimates
 * which is safer than under-estimating (avoids context overflow).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(message: { role: string; content: string }): number {
  // Add a small overhead per message for role tags / delimiters (~4 tokens).
  return estimateTokens(message.content) + 4;
}

// -- Core pruning -------------------------------------------------------------

const DROPPED_CONTEXT_MESSAGE: LLMMessage = {
  role: 'system',
  content:
    '[Earlier conversation context omitted for brevity. The user has been asking about business analytics.]',
};

/**
 * Prune a conversation to fit within a token budget.
 *
 * Algorithm (strategy = 'recent'):
 * 1. Always keep the last `preserveLatest` messages.
 * 2. Walk backwards from the remaining messages, adding each while under budget.
 * 3. If any messages were dropped, prepend a system message summarizing the gap.
 */
export function pruneConversation(
  messages: LLMMessage[],
  opts?: PruneOptions,
): LLMMessage[] {
  const maxTokens = opts?.maxTokens ?? 2000;
  const preserveLatest = opts?.preserveLatest ?? 2;
  // 'summarize' strategy is V2 -- fall back to 'recent' for now
  // const strategy = opts?.strategy ?? 'recent';

  if (messages.length === 0) return [];

  // If everything fits, return as-is
  const totalTokens = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  if (totalTokens <= maxTokens) return [...messages];

  // Split into preserved tail and candidates
  const preserveCount = Math.min(preserveLatest, messages.length);
  const preserved = messages.slice(-preserveCount);
  const candidates = messages.slice(0, messages.length - preserveCount);

  // Budget remaining after the preserved messages
  const preservedTokens = preserved.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
  // Reserve tokens for the dropped-context system message in case we need it
  const droppedMsgTokens = estimateMessageTokens(DROPPED_CONTEXT_MESSAGE);
  let remainingBudget = maxTokens - preservedTokens;

  // If even the preserved messages exceed the budget, return only those
  // (we never drop the preserved tail)
  if (remainingBudget <= 0) return [...preserved];

  // Walk backwards through candidates (most recent first)
  const kept: LLMMessage[] = [];
  let droppedAny = false;

  for (let i = candidates.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(candidates[i]!);
    // If this is not the last candidate we could add, account for the
    // dropped-context message that we will need if we stop here
    const budgetNeeded = i > 0 ? msgTokens + droppedMsgTokens : msgTokens;

    if (budgetNeeded <= remainingBudget) {
      kept.unshift(candidates[i]!);
      remainingBudget -= msgTokens;
    } else {
      droppedAny = true;
      break;
    }
  }

  // If we skipped candidates before the ones we kept, mark any earlier ones as dropped
  if (!droppedAny && kept.length < candidates.length) {
    droppedAny = true;
  }

  const result: LLMMessage[] = [];
  if (droppedAny) {
    result.push(DROPPED_CONTEXT_MESSAGE);
  }
  result.push(...kept, ...preserved);
  return result;
}

// -- Convenience wrappers -----------------------------------------------------

/**
 * Prune conversation history for the intent resolver.
 * Only user messages are relevant for intent resolution.
 * maxTokens: 1500, preserveLatest: 3.
 */
export function pruneForIntentResolver(
  history: LLMMessage[],
): LLMMessage[] {
  const userOnly = history.filter((m) => m.role === 'user');
  return pruneConversation(userOnly, {
    maxTokens: 1500,
    preserveLatest: 3,
    strategy: 'recent',
  });
}

/**
 * Prune conversation history for the SQL generator.
 * Only user messages are relevant for SQL generation context.
 * maxTokens: 1000, preserveLatest: 2.
 */
export function pruneForSqlGenerator(
  history: LLMMessage[],
): LLMMessage[] {
  const userOnly = history.filter((m) => m.role === 'user');
  return pruneConversation(userOnly, {
    maxTokens: 1000,
    preserveLatest: 2,
    strategy: 'recent',
  });
}

/**
 * Prune the full conversation for the frontend chat window.
 * Keeps both user and assistant messages for display continuity.
 * maxTokens: 4000, preserveLatest: 4.
 */
export function pruneForFrontend(
  messages: { role: string; content: string }[],
): { role: string; content: string }[] {
  // Cast to LLMMessage for internal processing, then cast back
  const asLLM = messages as LLMMessage[];
  const pruned = pruneConversation(asLLM, {
    maxTokens: 4000,
    preserveLatest: 4,
    strategy: 'recent',
  });
  return pruned;
}
