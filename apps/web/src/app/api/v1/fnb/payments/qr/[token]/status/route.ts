import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Legacy stub — redirects to the new Guest Pay status endpoint.
 * GET /api/v1/fnb/payments/qr/:token/status → GET /api/v1/guest-pay/:token/status
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(
    new URL(`/api/v1/guest-pay/${token}/status`, 'http://localhost'),
    { status: 308 },
  );
}
