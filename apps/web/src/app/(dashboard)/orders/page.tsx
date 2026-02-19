'use client';

import dynamic from 'next/dynamic';
import OrdersLoading from './loading';

const OrdersContent = dynamic(() => import('./orders-content'), {
  loading: () => <OrdersLoading />,
  ssr: false,
});

export default function OrdersPage() {
  return <OrdersContent />;
}
