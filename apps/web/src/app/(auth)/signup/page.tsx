'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@/lib/api-client';
import { useAuthContext } from '@/components/auth-provider';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuthContext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // The auth layout already handles stale-session clearing when visiting
  // /signup.  The old ?fresh=1 param is no longer needed — the layout
  // calls logout() automatically.  We still read searchParams to suppress
  // the "unused" warning but take no action.
  void searchParams;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Create the account
      await auth.signup(email, password, name);

      // Auto-login so the user goes straight to onboarding
      const { needsOnboarding } = await auth.login(email, password);
      router.push(needsOnboarding ? '/onboard' : '/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Create your OppsEra account</h1>
      <p className="mt-2 text-sm text-muted-foreground">Get started with your free account today.</p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-foreground">
            Full Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Admin"
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password (min 8 characters)"
            className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-foreground placeholder-muted-foreground shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none sm:text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || auth.isLoggingOut}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:outline-none disabled:opacity-50"
        >
          {isLoading ? 'Creating account...' : 'Get Started'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
