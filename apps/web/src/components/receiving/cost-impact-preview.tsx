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
        <span className="text-gray-500">Cost:</span>
        <span className="font-medium text-gray-700">{formatMoney(preview.currentCost)}</span>
        <ArrowRight className="h-3 w-3 text-gray-400" />
        <span className="font-semibold text-indigo-600">{formatMoney(preview.newCost)}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-500">On Hand:</span>
        <span className="font-medium text-gray-700">{preview.currentOnHand}</span>
        <ArrowRight className="h-3 w-3 text-gray-400" />
        <span className="font-semibold text-green-600">{preview.newOnHand}</span>
      </div>
      {preview.marginPct !== null && (
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Margin:</span>
          <span className="font-semibold text-gray-700">{preview.marginPct.toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}
