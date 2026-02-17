import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import { AppError, ValidationError } from '@oppsera/shared';

const loginSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1),
});

export const POST = withMiddleware(
  async (request) => {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { email, password } = parsed.data;
    const adapter = getAuthAdapter();

    try {
      const result = await adapter.signIn(email, password);
      return NextResponse.json({ data: result });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AUTH_SIGNIN_FAILED', 'Invalid credentials', 401);
    }
  },
  { public: true },
);
