import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/portal-auth';

export async function POST() {
  const cookie = clearSessionCookie();
  const response = NextResponse.json({ data: { success: true } });
  response.cookies.set(cookie.name, cookie.value, cookie.options as any);
  return response;
}
