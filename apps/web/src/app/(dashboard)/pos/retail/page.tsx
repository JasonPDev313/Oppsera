'use client';

import dynamic from 'next/dynamic';
import RetailPOSLoading from './loading';

const RetailPOSContent = dynamic(() => import('./retail-pos-content'), {
  loading: () => <RetailPOSLoading />,
  ssr: false,
});

export default function RetailPOSPage() {
  return <RetailPOSContent />;
}
