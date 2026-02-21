'use client';

import dynamic from 'next/dynamic';
import AccountingLoading from './loading';

const AccountingContent = dynamic(() => import('./accounting-content'), {
  loading: () => <AccountingLoading />,
  ssr: false,
});

export default function AccountingPage() {
  return <AccountingContent />;
}
