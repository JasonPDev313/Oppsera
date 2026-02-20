import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, users } from '@oppsera/db';
import { createSupabaseAdmin } from '@oppsera/core/auth/supabase-client';

/**
 * One-time admin endpoint: links an existing DB user to a new Supabase Auth account.
 * Creates the Supabase Auth account (auto-confirmed) and updates authProviderId.
 *
 * TODO: Remove this endpoint once all accounts are linked.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'email and password required' } },
        { status: 400 },
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Step 1: Find existing user in our DB
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No user found with email: ${normalizedEmail}` } },
        { status: 404 },
      );
    }

    // Step 2: Create Supabase Auth account (auto-confirmed)
    const supabase = createSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (error) {
      // If user already exists in Supabase, try to get their ID
      if (error.message.includes('already been registered') || error.message.includes('already exists')) {
        const { data: listData } = await supabase.auth.admin.listUsers();
        const supaUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === normalizedEmail,
        );

        if (supaUser) {
          // Update password and link
          await supabase.auth.admin.updateUserById(supaUser.id, {
            password,
            email_confirm: true,
          });

          await db
            .update(users)
            .set({ authProviderId: supaUser.id })
            .where(eq(users.id, existingUser.id));

          return NextResponse.json({
            data: {
              message: 'Existing Supabase account linked and password updated',
              userId: existingUser.id,
              email: normalizedEmail,
              authProviderId: supaUser.id,
            },
          });
        }
      }

      return NextResponse.json(
        { error: { code: 'AUTH_ERROR', message: error.message } },
        { status: 400 },
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { error: { code: 'AUTH_ERROR', message: 'No user returned from Supabase' } },
        { status: 500 },
      );
    }

    // Step 3: Update authProviderId in our users table
    await db
      .update(users)
      .set({ authProviderId: data.user.id })
      .where(eq(users.id, existingUser.id));

    return NextResponse.json({
      data: {
        message: 'Account linked successfully',
        userId: existingUser.id,
        email: normalizedEmail,
        authProviderId: data.user.id,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unknown error' } },
      { status: 500 },
    );
  }
}
