'use client';

import { usePortalStatements } from '@/hooks/use-portal-data';
import { FileText, ChevronRight, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

function formatMoney(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export default function StatementsPage() {
  const { data: statements, isLoading, error } = usePortalStatements();
  const params = useParams();
  const tenantSlug = params?.tenantSlug as string;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/${tenantSlug}/dashboard`}
          className="text-[var(--portal-text-muted)] hover:text-[var(--portal-text)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Statements</h1>
      </div>

      {!statements || statements.length === 0 ? (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-[var(--portal-text-muted)]">No statements available yet.</p>
        </div>
      ) : (
        <div className="bg-[var(--portal-surface)] border border-[var(--portal-border)] rounded-lg divide-y divide-[var(--portal-border)]">
          {statements.map((stmt) => (
            <div key={stmt.id} className="p-4 flex items-center justify-between hover:bg-accent cursor-pointer">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">{stmt.statementNumber ?? 'Statement'}</p>
                  <p className="text-sm text-[var(--portal-text-muted)]">
                    {stmt.periodStart} – {stmt.periodEnd}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-medium">{formatMoney(stmt.totalDueCents)}</p>
                  <p className="text-xs text-[var(--portal-text-muted)] capitalize">{stmt.status}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
