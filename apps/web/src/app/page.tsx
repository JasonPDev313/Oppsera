import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          OppsEra
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">
          The plug-and-play ERP platform for small and medium businesses
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-4">
          <Link
            href="/login"
            className="rounded-lg border border-indigo-600 px-6 py-3 text-sm font-semibold text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
          >
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
