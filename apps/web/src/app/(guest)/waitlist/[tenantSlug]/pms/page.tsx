import dynamic from 'next/dynamic';

const PmsWaitlistJoinContent = dynamic(() => import('./join-content'), {
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-gray-400">Loading...</div>
    </div>
  ),
});

export default function PmsWaitlistJoinPage() {
  return <PmsWaitlistJoinContent />;
}
