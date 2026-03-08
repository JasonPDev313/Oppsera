import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const WaitlistContent = dynamic(() => import('./waitlist-content'), {
  loading: () => <PageSkeleton />,
});

export default function PmsWaitlistPage() {
  return <WaitlistContent />;
}
