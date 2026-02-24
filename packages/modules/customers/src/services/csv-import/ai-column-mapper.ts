/**
 * AI-powered column mapping via Claude Haiku.
 *
 * Only called for columns that Tier 1 alias matching could not resolve.
 * Uses the same direct-fetch Anthropic adapter pattern from
 * packages/modules/semantic/src/llm/adapters/anthropic.ts
 */

import type { TargetField } from './import-types';
import type { AiMappingSuggestion } from './import-types';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const TIMEOUT_MS = 15_000; // 15s — Haiku is fast

// ── Prompt Builder ──────────────────────────────────────────────────

function buildMappingPrompt(
  unmatchedHeaders: string[],
  sampleRows: string[][],
  availableTargets: TargetField[],
): string {
  const targetList = availableTargets
    .map((t) => `  - "${t.key}" — ${t.label} (${t.group}, ${t.dataType})`)
    .join('\n');

  const sampleData = unmatchedHeaders
    .map((header, idx) => {
      const samples = sampleRows
        .map((row) => row[idx])
        .filter(Boolean)
        .slice(0, 5);
      return `  - Header: "${header}" | Samples: ${JSON.stringify(samples)}`;
    })
    .join('\n');

  return `Given CSV column headers with sample data, suggest which target field each column maps to.

## Available Target Fields
${targetList}

## Unmatched CSV Columns (with sample data)
${sampleData}

## Rules
1. Only suggest fields from the Available Target Fields list.
2. Use sample data patterns to infer meaning:
   - Values with @ → email
   - Numeric values 0-54 with decimals → likely handicapIndex
   - Values like "M"/"F"/"Male"/"Female" → gender
   - Date patterns (MM/DD/YYYY, etc.) → dateOfBirth, anniversary, joinDate, or expirationDate
   - Street-like patterns → addressLine1
   - 5-digit numbers → postalCode
   - 2-letter US state codes → state
   - Values like "(555) 123-4567" → phone
   - Dollar amounts → houseAccountBalance or creditLimit
   - "Active"/"Inactive" → status
3. confidence > 80: clear match from header name or unambiguous data pattern
4. confidence 50-80: plausible match, header is ambiguous but data supports it
5. confidence < 50: weak guess
6. If a column appears to be a unique ID from the source system, map to "externalId"
7. If a column has no reasonable mapping, set suggestedField to null
8. Include a reasoning field explaining WHY you matched (1 sentence, reference data patterns)

## Output
Respond with ONLY a JSON array, no markdown fences, no prose:
[{"sourceHeader":"...","suggestedField":"...","confidence":85,"reasoning":"..."}]`;
}

// ── API Call ─────────────────────────────────────────────────────────

export async function callAiColumnMapper(
  unmatchedHeaders: string[],
  sampleRows: string[][],
  availableTargets: TargetField[],
): Promise<AiMappingSuggestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No API key — gracefully return empty (all stay unmapped)
    return [];
  }

  if (unmatchedHeaders.length === 0) return [];

  const userMessage = buildMappingPrompt(unmatchedHeaders, sampleRows, availableTargets);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0,
        system: 'You are a data-mapping assistant for a customer/member management system. Respond only with JSON arrays.',
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`AI column mapper HTTP ${response.status}`);
      return [];
    }

    const body = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = body.content?.find((c) => c.type === 'text')?.text ?? '';

    // Parse JSON — strip markdown fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as AiMappingSuggestion[];

    if (!Array.isArray(parsed)) return [];

    // Validate shape
    return parsed.filter(
      (item) =>
        typeof item.sourceHeader === 'string' &&
        (item.suggestedField === null || typeof item.suggestedField === 'string') &&
        typeof item.confidence === 'number' &&
        typeof item.reasoning === 'string',
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('AI column mapper timed out');
    } else {
      console.error('AI column mapper error:', err);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
