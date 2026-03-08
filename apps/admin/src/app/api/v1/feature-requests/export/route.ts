import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { sql, desc, eq, and, ilike } from 'drizzle-orm';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { createAdminClient, featureRequests, tenants } from '@oppsera/db';

// ── GET: export feature requests as CSV ──────────────────────────

export const GET = withAdminAuth(async (req: NextRequest) => {
  const db = createAdminClient();
  const sp = new URL(req.url).searchParams;
  const status = sp.get('status') ?? undefined;
  const module = sp.get('module') ?? undefined;
  const search = sp.get('search') ?? undefined;

  const conditions = [];
  if (status) conditions.push(eq(featureRequests.status, status));
  if (module) conditions.push(eq(featureRequests.module, module));
  if (search) {
    conditions.push(
      sql`(${ilike(featureRequests.title, `%${search}%`)} OR ${ilike(featureRequests.description, `%${search}%`)})`,
    );
  }

  const rows = await db
    .select({
      id: featureRequests.id,
      tenantName: tenants.name,
      submittedByName: featureRequests.submittedByName,
      submittedByEmail: featureRequests.submittedByEmail,
      requestType: featureRequests.requestType,
      module: featureRequests.module,
      submodule: featureRequests.submodule,
      title: featureRequests.title,
      description: featureRequests.description,
      businessImpact: featureRequests.businessImpact,
      priority: featureRequests.priority,
      status: featureRequests.status,
      tags: featureRequests.tags,
      adminNotes: featureRequests.adminNotes,
      voteCount: featureRequests.voteCount,
      createdAt: featureRequests.createdAt,
      resolvedAt: featureRequests.resolvedAt,
    })
    .from(featureRequests)
    .leftJoin(tenants, eq(featureRequests.tenantId, tenants.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(featureRequests.createdAt))
    .limit(5000);

  const items = Array.from(rows as Iterable<(typeof rows)[number]>);

  // Build CSV
  const headers = [
    'ID', 'Tenant', 'Submitted By', 'Email', 'Type', 'Module', 'Submodule',
    'Title', 'Description', 'Business Impact', 'Priority', 'Status', 'Tags',
    'Admin Notes', 'Votes', 'Created', 'Resolved',
  ];

  const csvRows = items.map(r => [
    r.id,
    r.tenantName ?? '',
    r.submittedByName ?? '',
    r.submittedByEmail ?? '',
    r.requestType,
    r.module,
    r.submodule ?? '',
    r.title,
    r.description,
    r.businessImpact ?? '',
    r.priority,
    r.status,
    (r.tags ?? []).join('; '),
    r.adminNotes ?? '',
    String(r.voteCount),
    r.createdAt ? new Date(r.createdAt).toISOString() : '',
    r.resolvedAt ? new Date(r.resolvedAt).toISOString() : '',
  ]);

  const escapeCsv = (val: string) => {
    // Prevent formula injection — Excel executes cells starting with =, +, -, @
    if (/^[=+\-@\t\r]/.test(val)) {
      return `"'${val.replace(/"/g, '""')}"`;
    }
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csv = [
    headers.map(escapeCsv).join(','),
    ...csvRows.map(row => row.map(escapeCsv).join(',')),
  ].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="feature-requests-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, 'viewer');
