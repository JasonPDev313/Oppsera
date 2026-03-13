import { Suspense } from 'react';
import CustomerBoardContent from './customer-board-content';

export default function CustomerBoardPage() {
  return (
    <Suspense>
      <CustomerBoardContent />
    </Suspense>
  );
}
