import { notFound } from 'next/navigation';
import { resolveTenantSlug } from '@/lib/resolve-tenant-slug';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantLayout({ children, params }: TenantLayoutProps) {
  const { tenantSlug } = await params;
  const tenant = await resolveTenantSlug(tenantSlug);

  if (!tenant) {
    notFound();
  }

  return (
    <>
      {/* Inject tenant info as a data attribute for client components to read */}
      <div data-tenant-id={tenant.id} data-tenant-name={tenant.name} data-tenant-slug={tenant.slug}>
        {children}
      </div>
    </>
  );
}
