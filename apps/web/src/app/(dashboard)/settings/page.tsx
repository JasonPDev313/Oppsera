'use client';

import dynamic from 'next/dynamic';
import SettingsLoading from './loading';

const SettingsContent = dynamic(() => import('./settings-content'), {
  loading: () => <SettingsLoading />,
  ssr: false,
});

export default function SettingsPage() {
  return <SettingsContent />;
}
