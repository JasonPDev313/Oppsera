import { NextResponse } from 'next/server';

/**
 * Account linking endpoint — REMOVED for production security.
 * For account linking, use the Supabase admin CLI or the scripts in tools/scripts/.
 */
export async function POST() {
  return NextResponse.json(
    { error: { code: 'GONE', message: 'This endpoint has been removed. Use Supabase admin CLI for account linking.' } },
    { status: 410 },
  );
}
