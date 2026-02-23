import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="h-16 w-16 rounded-full bg-[var(--portal-primary-light)] flex items-center justify-center mx-auto mb-4">
          <svg className="h-8 w-8 text-[var(--portal-primary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Club Not Found</h1>
        <p className="text-[var(--portal-text-muted)] mb-6">
          We couldn't find a club at this address. The link may be incorrect or the club may have moved.
        </p>
        <Link
          href="/find-club"
          className="inline-block rounded-lg bg-[var(--portal-primary)] text-white px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Find Your Club
        </Link>
      </div>
    </div>
  );
}
