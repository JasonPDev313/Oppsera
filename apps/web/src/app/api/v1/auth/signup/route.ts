import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getAuthAdapter } from '@oppsera/core/auth/get-adapter';
import { AppError, ValidationError } from '@oppsera/shared';

const signupSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200).transform((v) => v.trim()),
});

export const POST = withMiddleware(
  async (request) => {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const { email, password, name } = parsed.data;
    const adapter = getAuthAdapter();

    try {
      const result = await adapter.signUp(email, password, name);
      return NextResponse.json({ data: result }, { status: 201 });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('AUTH_SIGNUP_FAILED', 'Failed to create account');
    }
  },
  { public: true },
);
