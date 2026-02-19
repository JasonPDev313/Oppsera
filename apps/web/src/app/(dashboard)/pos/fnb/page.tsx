'use client';

import dynamic from 'next/dynamic';
import FnBPOSLoading from './loading';

const FnBPOSContent = dynamic(() => import('./fnb-pos-content'), {
  loading: () => <FnBPOSLoading />,
  ssr: false,
});

export default function FnbPOSPage() {
  return <FnBPOSContent />;
}
