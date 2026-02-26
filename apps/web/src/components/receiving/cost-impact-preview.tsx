'use client';

import { ArrowRight } from 'lucide-react';
import type { CostPreview } from '@/types/receiving';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

export function CostImpactPreview({ preview }: { preview: CostPreview }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Cost:</span>
        <span className="font-medium text-foreground">{formatMoney(preview.currentCost)}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="font-semibold text-indigo-600">{formatMoney(preview.newCost)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">On Hand:</span>
        <span className="font-medium text-foreground">{preview.currentOnHand}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="font-semibold text-green-500">{preview.newOnHand}</span>
      </div>
      {preview.marginPct !== null && (
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Margin:</span>
          <span className="font-semibold text-foreground">{preview.marginPct.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
