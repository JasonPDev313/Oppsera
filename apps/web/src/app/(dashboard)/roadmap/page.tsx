import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RoadmapContent = dynamic(() => import('./roadmap-content'), {
  loading: () => <PageSkeleton />,
});

export default function RoadmapPage() {
  return <RoadmapContent />;
}
