/**
 * Step-up authentication for sensitive operations.
 *
 * Uses HMAC-SHA256-signed tokens (stateless — works across Vercel instances).
 * Token format: base64url(JSON payload) + '.' + base64url(HMAC signature)
 *
 * Flow:
 *   1. Client calls a protected route → gets 403 STEP_UP_REQUIRED
 *   2. Client opens PIN modal → POST /api/v1/auth/step-up with PIN + category
 *   3. Server verifies PIN, returns signed token + expiresAt
 *   4. Client caches token, retries original request with X-Step-Up-Token header
 *   5. Server validates HMAC signature + payload (userId, tenantId, category, expiry)
 */

import { createHmac } from 'crypto';
import { AppError } from '@oppsera/shared';
import { STEP_UP_CATEGORIES } from '@oppsera/shared';
import type { StepUpCategory } from '@oppsera/shared';
import type { RequestContext } from '../auth/context';

// ── Error ───────────────────────────────────────────────────────

export class StepUpRequiredError extends AppError {
  public category: StepUpCategory;

  constructor(category: StepUpCategory) {
    super(
      'STEP_UP_REQUIRED',
      `Re-authentication required for ${STEP_UP_CATEGORIES[category].label}`,
      403,
      [{ field: 'category', message: category }],
    );
    this.category = category;
  }
}

// ── Token Types ─────────────────────────────────────────────────

interface StepUpPayload {
  userId: string;
  tenantId: string;
  category: StepUpCategory;
  expiresAt: number;
  verifiedBy: string;
}

// ── HMAC Helpers ────────────────────────────────────────────────

function getSecret(): string {
  const secret = process.env.STEP_UP_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('STEP_UP_SECRET or NEXTAUTH_SECRET must be set for step-up auth');
  }
  return secret;
}

function base64urlEncode(data: string): string {
  return Buffer.from(data, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(data: string): string {
  const padded = data + '='.repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function computeHmac(payload: string): string {
  return createHmac('sha256', getSecret())
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Assert the request has a valid step-up token for the given category.
 * Throws StepUpRequiredError (403) if:
 *   - The request is impersonated (impersonation never has valid step-up tokens)
 *   - No X-Step-Up-Token header present
 *   - Token signature is invalid
 *   - Token is expired or for wrong user/tenant/category
 */
export function requireStepUp(
  request: Request,
  ctx: RequestContext,
  category: StepUpCategory,
): void {
  // Impersonated sessions always require step-up (admin cannot pass PIN for tenant user)
  if (ctx.impersonation) {
    throw new StepUpRequiredError(category);
  }

  const tokenHeader = request.headers.get('x-step-up-token');
  if (!tokenHeader) {
    throw new StepUpRequiredError(category);
  }

  const parsed = verifyStepUpToken(tokenHeader);
  if (!parsed) {
    throw new StepUpRequiredError(category);
  }

  if (
    parsed.userId !== ctx.user.id ||
    parsed.tenantId !== ctx.tenantId ||
    parsed.category !== category ||
    Date.now() > parsed.expiresAt
  ) {
    throw new StepUpRequiredError(category);
  }
}

/**
 * Create a signed step-up token after successful PIN verification.
 */
export function createStepUpToken(
  userId: string,
  tenantId: string,
  category: StepUpCategory,
  verifiedByUserId: string,
): { token: string; expiresAt: number } {
  const ttlMs = STEP_UP_CATEGORIES[category].ttlMs;
  const expiresAt = Date.now() + ttlMs;

  const payload: StepUpPayload = {
    userId,
    tenantId,
    category,
    expiresAt,
    verifiedBy: verifiedByUserId,
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64urlEncode(payloadStr);
  const signature = computeHmac(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
  };
}

/**
 * Verify a step-up token's HMAC signature and parse its payload.
 * Returns null if the signature is invalid or parsing fails.
 */
function verifyStepUpToken(token: string): StepUpPayload | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  const encodedPayload = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);

  // Verify HMAC
  const expectedSignature = computeHmac(encodedPayload);
  if (providedSignature !== expectedSignature) return null;

  // Parse payload
  try {
    const payloadStr = base64urlDecode(encodedPayload);
    const payload = JSON.parse(payloadStr) as StepUpPayload;

    // Basic shape validation
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      typeof payload.category !== 'string' ||
      typeof payload.expiresAt !== 'number' ||
      !(payload.category in STEP_UP_CATEGORIES)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
