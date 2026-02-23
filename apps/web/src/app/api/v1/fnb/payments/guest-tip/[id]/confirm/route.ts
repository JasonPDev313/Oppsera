import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Guest Tip Confirm — Coming Soon' } },
    { status: 501 },
  );
}
