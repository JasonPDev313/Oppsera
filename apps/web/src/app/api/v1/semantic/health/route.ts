import { NextResponse } from 'next/server';
import { buildRegistryCatalog } from '@oppsera/module-semantic';

/**
 * GET /api/v1/semantic/health
 *
 * Lightweight health check for the semantic pipeline.
 * Verifies the registry cache is loaded and has metrics/dimensions.
 * Does NOT require authentication — used by frontend to gate the chat UI
 * and by monitoring to detect registry initialization issues.
 *
 * Returns 200:
 *   { healthy: true, metrics: N, dimensions: N }
 * Returns 503:
 *   { healthy: false, reason: '...', metrics: 0, dimensions: 0 }
 */
export async function GET() {
  try {
    const catalog = await buildRegistryCatalog().catch(() => ({
      metrics: [] as unknown[],
      dimensions: [] as unknown[],
      lenses: [] as unknown[],
      generatedAt: '',
    }));

    const metricsCount = catalog.metrics.length;
    const dimensionsCount = catalog.dimensions.length;

    if (metricsCount === 0) {
      return NextResponse.json({
        healthy: false,
        reason: 'Registry has 0 metrics. Run: pnpm --filter @oppsera/module-semantic semantic:sync',
        metrics: 0,
        dimensions: 0,
      }, { status: 503 });
    }

    return NextResponse.json({
      healthy: true,
      metrics: metricsCount,
      dimensions: dimensionsCount,
    });
  } catch (err) {
    console.error('[semantic/health] Health check failed:', err);
    return NextResponse.json({
      healthy: false,
      reason: 'Health check failed — database may be unavailable',
      metrics: 0,
      dimensions: 0,
    }, { status: 503 });
  }
}
