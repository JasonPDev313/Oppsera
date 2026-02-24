import type {
  DeclineCategory,
  SuggestedAction,
  AvsInterpretation,
  CvvInterpretation,
} from '@oppsera/shared';
import {
  getResponseCodeMap,
  getAvsMap,
  getCvvMap,
  DECLINE_CATEGORY_LABELS,
  SUGGESTED_ACTION_LABELS,
} from '@oppsera/shared';

// ── Types ──────────────────────────────────────────────────────

export interface ResponseInterpretation {
  declineCategory: DeclineCategory;
  userMessage: string;
  operatorMessage: string;
  suggestedAction: SuggestedAction;
  retryable: boolean;
  avsResult: AvsInterpretation | null;
  cvvResult: CvvInterpretation | null;
  visaDeclineCategory: number | null;
  mcAdviceCode: string | null;
  processor: string | null;
}

export interface InterpretInput {
  responseCode: string | null;
  responseText: string | null;
  respstat: string | null; // 'A' | 'B' | 'C'
  avsResponse: string | null;
  cvvResponse: string | null;
  rawResponse: Record<string, unknown> | null;
}

// ── Interpreter ────────────────────────────────────────────────

/**
 * Interpret a gateway response into structured decline categorization.
 * Looks up the response code in the registry, falls back to respstat-based
 * categorization for unknown codes, and always interprets AVS/CVV independently.
 */
export function interpretResponse(input: InterpretInput): ResponseInterpretation {
  const codeMap = getResponseCodeMap();
  const avsMap = getAvsMap();
  const cvvMap = getCvvMap();

  // Extract processor from raw response (CardPointe puts it in respproc)
  const processor = extractProcessor(input.rawResponse);

  // 1. Look up by PROCESSOR:CODE
  let declineCategory: DeclineCategory = 'network_error';
  let userMessage = 'An unexpected error occurred. Please try again.';
  let suggestedAction: SuggestedAction = 'try_again';
  let retryable = true;

  const code = input.responseCode?.trim() ?? '';
  let matched = false;

  if (code && processor) {
    const key = `${processor}:${code}`;
    const entry = codeMap.get(key);
    if (entry) {
      declineCategory = entry.declineCategory;
      userMessage = entry.userMessage;
      suggestedAction = entry.suggestedAction;
      retryable = entry.retryable;
      matched = true;
    }
  }

  // Try without processor prefix (PPS codes are common default)
  if (!matched && code) {
    const ppsKey = `PPS:${code}`;
    const entry = codeMap.get(ppsKey);
    if (entry) {
      declineCategory = entry.declineCategory;
      userMessage = entry.userMessage;
      suggestedAction = entry.suggestedAction;
      retryable = entry.retryable;
      matched = true;
    }
  }

  // 2. Fall back to respstat-based categorization for unknown codes
  if (!matched) {
    const respstat = input.respstat ?? extractRespstat(input.rawResponse);
    if (respstat === 'A') {
      declineCategory = 'approved';
      userMessage = 'Transaction approved.';
      suggestedAction = 'none';
      retryable = false;
    } else if (respstat === 'B') {
      declineCategory = 'soft';
      userMessage = 'Your transaction could not be completed at this time. Please try again in a few minutes.';
      suggestedAction = 'retry_later';
      retryable = true;
    } else if (respstat === 'C') {
      declineCategory = 'hard';
      userMessage = 'Your card was declined. Please try a different payment method.';
      suggestedAction = 'try_different_card';
      retryable = false;
    }
    // else: keep defaults (network_error, try_again, retryable=true)
  }

  // 3. Always interpret AVS and CVV independently
  const avsResult = input.avsResponse ? (avsMap.get(input.avsResponse) ?? null) : null;
  const cvvResult = input.cvvResponse ? (cvvMap.get(input.cvvResponse) ?? null) : null;

  // 4. Extract Visa decline category and MC advice code from raw response
  const visaDeclineCategory = extractVisaDeclineCategory(input.rawResponse);
  const mcAdviceCode = extractMcAdviceCode(input.rawResponse);

  // 5. Build operator message (includes raw codes for staff troubleshooting)
  const operatorMessage = buildOperatorMessage(
    code,
    input.responseText,
    processor,
    declineCategory,
    avsResult,
    cvvResult,
  );

  return {
    declineCategory,
    userMessage,
    operatorMessage,
    suggestedAction,
    retryable,
    avsResult,
    cvvResult,
    visaDeclineCategory,
    mcAdviceCode,
    processor,
  };
}

// ── Helpers ────────────────────────────────────────────────────

function extractProcessor(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  // CardPointe returns respproc in the response
  const respproc = raw.respproc ?? raw.respProc;
  return typeof respproc === 'string' && respproc.length > 0 ? respproc : null;
}

function extractRespstat(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const respstat = raw.respstat ?? raw.respStat;
  return typeof respstat === 'string' ? respstat : null;
}

function extractVisaDeclineCategory(raw: Record<string, unknown> | null): number | null {
  if (!raw) return null;
  // CardPointe may include declineCategory for Visa cards
  const cat = raw.declineCategory ?? raw.declinecategory;
  if (typeof cat === 'number') return cat;
  if (typeof cat === 'string') {
    const parsed = parseInt(cat, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function extractMcAdviceCode(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const code = raw.merchAdviceCode ?? raw.merchadvicecode ?? raw.adviceCode;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function buildOperatorMessage(
  code: string,
  responseText: string | null,
  processor: string | null,
  category: DeclineCategory,
  avsResult: AvsInterpretation | null,
  cvvResult: CvvInterpretation | null,
): string {
  const parts: string[] = [];

  // Category label
  parts.push(`[${DECLINE_CATEGORY_LABELS[category] ?? category}]`);

  // Raw code info
  if (code) {
    parts.push(`Code: ${processor ? `${processor}:` : ''}${code}`);
  }

  // Gateway text
  if (responseText) {
    parts.push(`— ${responseText}`);
  }

  // AVS/CVV details
  if (avsResult && !avsResult.pass) {
    parts.push(`| AVS: ${avsResult.description}`);
  }
  if (cvvResult && !cvvResult.pass) {
    parts.push(`| CVV: ${cvvResult.description}`);
  }

  return parts.join(' ');
}
