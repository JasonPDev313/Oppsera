'use client';

import dynamic from 'next/dynamic';
import AccountsLoading from './loading';

const AccountsContent = dynamic(() => import('./accounts-content'), {
  loading: () => <AccountsLoading />,
  ssr: false,
});

export default function AccountsPage() {
  return <AccountsContent />;
}
