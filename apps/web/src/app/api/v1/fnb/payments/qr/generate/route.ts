import { NextResponse } from 'next/server';

/**
 * Legacy stub — redirects to the new Guest Pay endpoint.
 * POST /api/v1/fnb/payments/qr/generate → POST /api/v1/fnb/guest-pay/sessions
 */
export async function POST() {
  return NextResponse.redirect(new URL('/api/v1/fnb/guest-pay/sessions', 'http://localhost'), {
    status: 308, // Permanent redirect, preserves method
  });
}
