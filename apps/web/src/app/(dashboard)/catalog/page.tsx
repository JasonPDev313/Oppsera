'use client';

import dynamic from 'next/dynamic';
import CatalogLoading from './loading';

const CatalogContent = dynamic(() => import('./catalog-content'), {
  loading: () => <CatalogLoading />,
  ssr: false,
});

export default function CatalogPage() {
  return <CatalogContent />;
}
