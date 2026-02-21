'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { useTerminals } from '@/hooks/use-terminals';
import { useProfitCenters } from '@/hooks/use-profit-centers';
import { TerminalCard } from '@/components/settings/TerminalCard';
import { TerminalFormModal } from '@/components/settings/TerminalFormModal';

export default function TerminalsContent() {
  const params = useParams();
  const router = useRouter();
  const profitCenterId = params.id as string;

  const { data: profitCenters } = useProfitCenters();
  const profitCenter = profitCenters?.find((pc) => pc.id === profitCenterId);

  const { data: terminals, isLoading, refetch } = useTerminals(profitCenterId);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/settings/profit-centers')}
          className="rounded-lg p-1.5 hover:bg-gray-200/50"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {profitCenter?.name ?? 'Profit Center'} — Terminals
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage POS terminals for this profit center
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end">
        <button
          onClick={() => { setEditingId(null); setIsModalOpen(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add Terminal
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-gray-100" />
          ))
        ) : terminals?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-gray-500">
            No terminals yet. Add one to get started.
          </div>
        ) : (
          terminals?.map((t) => (
            <TerminalCard
              key={t.id}
              terminal={t}
              onEdit={() => { setEditingId(t.id); setIsModalOpen(true); }}
            />
          ))
        )}
      </div>

      {isModalOpen && (
        <TerminalFormModal
          profitCenterId={profitCenterId}
          terminalId={editingId}
          onClose={() => setIsModalOpen(false)}
          onSaved={() => { setIsModalOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}
