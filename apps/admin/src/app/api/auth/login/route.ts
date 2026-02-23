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

    const admin = await getAdminByEmail(email);
    if (!admin || !admin.isActive) {
      // Constant-time comparison even on missing user
      await bcrypt.compare(password, '$2b$12$invalidhashpaddingtoconstanttime');
      return NextResponse.json(
        { error: { message: 'Invalid email or password' } },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
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

    // Best-effort last login update
    updateAdminLastLogin(admin.id).catch(() => undefined);

    return res;
  } catch {
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
