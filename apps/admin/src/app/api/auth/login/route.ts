import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {
  getAdminByEmail,
  createAdminToken,
  makeSessionCookie,
  updateAdminLastLogin,
} from '@/lib/auth';
import { resolveGeo, recordAdminLoginEvent } from '@oppsera/core/security';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Invalid request body' } },
        { status: 400 },
      );
    }

    const { email, password } = parsed.data;
    const ip = req.headers.get('x-forwarded-for') ?? undefined;
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const admin = await getAdminByEmail(email);
    if (!admin || !admin.isActive) {
      // Constant-time comparison even on missing user
      await bcrypt.compare(password, '$2b$12$invalidhashpaddingtoconstanttime');

      // Await login event recording before returning — fire-and-forget on Vercel
      // leaves connections stuck in ClientRead (gotcha #466)
      try {
        const geo = await resolveGeo(req.headers, ip);
        await recordAdminLoginEvent({
          adminId: null, email, outcome: 'failed', ipAddress: ip, userAgent, geo,
          failureReason: admin ? 'Account inactive' : 'Unknown email',
        });
      } catch { /* non-fatal — login response takes priority */ }

      return NextResponse.json(
        { error: { message: 'Invalid email or password' } },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      // Await login event recording before returning
      try {
        const geo = await resolveGeo(req.headers, ip);
        await recordAdminLoginEvent({
          adminId: admin.id, email, outcome: 'failed', ipAddress: ip, userAgent, geo,
          failureReason: 'Invalid password',
        });
      } catch { /* non-fatal */ }

      return NextResponse.json(
        { error: { message: 'Invalid email or password' } },
        { status: 401 },
      );
    }

    const token = await createAdminToken({
      adminId: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role as 'super_admin' | 'admin' | 'viewer',
    });

    const cookie = makeSessionCookie(token);
    const res = NextResponse.json({
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      },
    });

    res.cookies.set(cookie.name, cookie.value, cookie.options as Parameters<typeof res.cookies.set>[2]);

    // Await all DB writes before returning — fire-and-forget on Vercel
    // leaves connections stuck in ClientRead (gotcha #466)
    try { await updateAdminLastLogin(admin.id); } catch { /* non-fatal */ }
    try {
      const geo = await resolveGeo(req.headers, ip);
      await recordAdminLoginEvent({
        adminId: admin.id, email, outcome: 'success', ipAddress: ip, userAgent, geo,
      });
    } catch { /* non-fatal */ }

    return res;
  } catch {
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
