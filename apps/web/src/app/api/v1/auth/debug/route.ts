import { NextResponse } from 'next/server';

/**
 * Auth debug endpoint — REMOVED for production security.
 * Previously used for diagnosing auth chain issues during development.
 */
export async function GET() {
  return NextResponse.json(
    { error: { code: 'GONE', message: 'This endpoint has been removed.' } },
    { status: 410 },
  );
}
