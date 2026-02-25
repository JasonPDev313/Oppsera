'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { usePortalAuth } from '@/hooks/use-portal-auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = usePortalAuth();
  const router = useRouter();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      localStorage.setItem('portal_last_slug', tenantSlug);
      router.push(`/${tenantSlug}/dashboard`);
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--portal-surface)] rounded-xl border border-[var(--portal-border)] p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-center mb-2">Member Portal</h1>
          <p className="text-sm text-[var(--portal-text-muted)] text-center mb-6">
            Sign in to view your membership
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--portal-border)] px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--portal-border)] px-3 py-2 text-sm
                  focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)] focus:border-transparent"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-[var(--portal-primary)] text-white py-2.5 text-sm font-medium
                hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
