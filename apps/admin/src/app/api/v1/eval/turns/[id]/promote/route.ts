import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { promoteToExample, promoteExampleSchema } from '@oppsera/module-semantic';

export const POST = withAdminAuth(
  async (req: NextRequest, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { message: 'Missing turn id' } }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const parsed = promoteExampleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Validation error', details: parsed.error.errors } },
        { status: 400 },
      );
    }

    const exampleId = await promoteToExample(id, session.adminId, {
      category: parsed.data.category,
      difficulty: parsed.data.difficulty,
    });

    return NextResponse.json({ data: { exampleId } }, { status: 201 });
  },
  'admin',
);
