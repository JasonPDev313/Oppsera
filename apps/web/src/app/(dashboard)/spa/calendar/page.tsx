'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CalendarContent = dynamic(
  () =>
    import('./calendar-content').catch((err) => {
      console.error('[spa/calendar] Failed to load calendar module:', err);
      // Return a fallback component so the dynamic import resolves
      // instead of leaving the skeleton stuck forever.
      return {
        default: () => (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            Failed to load calendar. Check the browser console for details and try refreshing.
          </div>
        ),
      };
    }),
  {
    loading: () => <PageSkeleton rows={8} />,
    ssr: false,
  },
);

export default function SpaCalendarPage() {
  return <CalendarContent />;
}
