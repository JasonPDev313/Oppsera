import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal-auth';

interface TenantPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantHomePage({ params }: TenantPageProps) {
  const { tenantSlug } = await params;
  const session = await getPortalSession();

  if (session) {
    redirect(`/${tenantSlug}/dashboard`);
  }

  redirect(`/${tenantSlug}/login`);
}
