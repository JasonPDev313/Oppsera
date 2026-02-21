'use client';

import { Badge } from '@/components/ui/badge';
import { ACCOUNTING_STATUS_CONFIG } from '@/types/accounting';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = ACCOUNTING_STATUS_CONFIG[status] ?? { label: status, variant: 'neutral' };
  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}
