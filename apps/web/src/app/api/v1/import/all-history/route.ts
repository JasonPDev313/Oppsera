import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listCustomerImportLogs } from '@oppsera/module-customers/queries/list-customer-import-logs';
import { listCatalogImportLogs } from '@oppsera/module-catalog';
import { listCoaImportLogs } from '@oppsera/module-accounting';

/**
 * Unified import log shape returned by this aggregation route.
 */
interface UnifiedImportLog {
  id: string;
  module: 'customers' | 'catalog' | 'accounting';
  moduleLabel: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

// GET /api/v1/import/all-history
// Aggregates import logs from customers, catalog, and accounting modules.
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;

    // Fetch from all three modules in parallel (best-effort — one failing doesn't block others)
    const [customerResult, catalogResult, coaResult] = await Promise.allSettled([
      listCustomerImportLogs({ tenantId: ctx.tenantId, limit }),
      listCatalogImportLogs({ tenantId: ctx.tenantId, limit }),
      listCoaImportLogs({ tenantId: ctx.tenantId, limit }),
    ]);

    const items: UnifiedImportLog[] = [];

    // Normalize customer logs
    if (customerResult.status === 'fulfilled') {
      for (const log of customerResult.value.items) {
        items.push({
          id: log.id,
          module: 'customers',
          moduleLabel: 'Customers',
          fileName: log.fileName,
          totalRows: log.totalRows,
          successRows: log.successRows,
          errorRows: log.errorRows,
          status: log.status,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
        });
      }
    }

    // Normalize catalog logs
    if (catalogResult.status === 'fulfilled') {
      for (const log of catalogResult.value.items) {
        items.push({
          id: log.id,
          module: 'catalog',
          moduleLabel: 'Inventory',
          fileName: log.fileName,
          totalRows: log.totalRows,
          successRows: log.successRows,
          errorRows: log.errorRows,
          status: log.status,
          startedAt: log.startedAt,
          completedAt: log.completedAt,
        });
      }
    }

    // Normalize COA logs
    if (coaResult.status === 'fulfilled') {
      for (const log of coaResult.value) {
        items.push({
          id: log.id,
          module: 'accounting',
          moduleLabel: 'Chart of Accounts',
          fileName: log.fileName,
          totalRows: log.totalRows,
          successRows: log.successRows,
          errorRows: log.errorRows,
          status: log.status,
          startedAt:
            log.startedAt instanceof Date
              ? log.startedAt.toISOString()
              : String(log.startedAt),
          completedAt:
            log.completedAt instanceof Date
              ? log.completedAt.toISOString()
              : log.completedAt
                ? String(log.completedAt)
                : null,
        });
      }
    }

    // Sort merged results by startedAt DESC
    items.sort((a, b) => {
      const dateA = new Date(a.startedAt).getTime();
      const dateB = new Date(b.startedAt).getTime();
      return dateB - dateA;
    });

    // Trim to limit
    const trimmed = items.slice(0, limit);

    return NextResponse.json({ data: trimmed });
  },
  { authenticated: true },
);
