'use client';

import { Badge } from '@/components/ui/badge';

export function VendorStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'success' : 'error'}>
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}
