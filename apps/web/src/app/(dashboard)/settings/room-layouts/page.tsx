'use client';

import dynamic from 'next/dynamic';
import RoomLayoutsLoading from './loading';

const RoomLayoutsContent = dynamic(() => import('./room-layouts-content'), {
  loading: () => <RoomLayoutsLoading />,
  ssr: false,
});

export default function RoomLayoutsPage() {
  return <RoomLayoutsContent />;
}
