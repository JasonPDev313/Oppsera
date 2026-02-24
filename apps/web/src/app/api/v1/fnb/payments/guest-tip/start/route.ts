import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: { code: 'NOT_IMPLEMENTED', message: 'Guest-Facing Tip Screen — Coming Soon' } },
    { status: 501 },
  );
}
