'use client';

interface ZReportData {
  closeBatchId: string;
  businessDate: string;
  grossSalesCents: number;
  netSalesCents: number;
  taxCollectedCents: number;
  discountTotalCents: number;
  compTotalCents: number;
  voidTotalCents: number;
  refundTotalCents: number;
  tenderBreakdown: Record<string, number>;
  tipsTotalCents: number;
  coverCount: number;
  tabCount: number;
  avgCheckCents: number;
}

interface ZReportViewProps {
  data: ZReportData;
}

export function ZReportView({ data }: ZReportViewProps) {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(148, 163, 184, 0.15)', backgroundColor: 'var(--fnb-bg-surface)' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(148, 163, 184, 0.15)' }}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--fnb-text-primary)' }}>
          Z-Report — {data.businessDate}
        </h3>
      </div>

      <div className="p-4 space-y-4 font-mono text-xs" style={{ fontFamily: 'var(--fnb-font-mono)' }}>
        {/* Sales */}
        <div>
          <span className="text-[10px] font-bold uppercase block mb-1" style={{ color: 'var(--fnb-text-muted)' }}>
            Sales
          </span>
          <Row label="Gross Sales" value={fmt(data.grossSalesCents)} />
          <Row label="Discounts" value={`-${fmt(data.discountTotalCents)}`} muted />
          <Row label="Comps" value={`-${fmt(data.compTotalCents)}`} muted />
          <Row label="Voids" value={`-${fmt(data.voidTotalCents)}`} muted />
          <Row label="Refunds" value={`-${fmt(data.refundTotalCents)}`} muted />
          <Row label="Net Sales" value={fmt(data.netSalesCents)} bold />
        </div>

        {/* Tax */}
        <div>
          <span className="text-[10px] font-bold uppercase block mb-1" style={{ color: 'var(--fnb-text-muted)' }}>
            Tax
          </span>
          <Row label="Tax Collected" value={fmt(data.taxCollectedCents)} />
        </div>

        {/* Tenders */}
        <div>
          <span className="text-[10px] font-bold uppercase block mb-1" style={{ color: 'var(--fnb-text-muted)' }}>
            Tenders
          </span>
          {Object.entries(data.tenderBreakdown).map(([type, cents]) => (
            <Row key={type} label={type} value={fmt(cents)} />
          ))}
        </div>

        {/* Tips */}
        <div>
          <span className="text-[10px] font-bold uppercase block mb-1" style={{ color: 'var(--fnb-text-muted)' }}>
            Tips
          </span>
          <Row label="Total Tips" value={fmt(data.tipsTotalCents)} />
        </div>

        {/* Stats */}
        <div>
          <span className="text-[10px] font-bold uppercase block mb-1" style={{ color: 'var(--fnb-text-muted)' }}>
            Statistics
          </span>
          <Row label="Covers" value={String(data.coverCount)} />
          <Row label="Tabs" value={String(data.tabCount)} />
          <Row label="Avg Check" value={fmt(data.avgCheckCents)} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span style={{ color: muted ? 'var(--fnb-text-muted)' : 'var(--fnb-text-secondary)' }}>{label}</span>
      <span
        style={{
          color: bold ? 'var(--fnb-text-primary)' : muted ? 'var(--fnb-text-muted)' : 'var(--fnb-text-secondary)',
          fontWeight: bold ? 700 : 400,
        }}
      >
        {value}
      </span>
    </div>
  );
}
