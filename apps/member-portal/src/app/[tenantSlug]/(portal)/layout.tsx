import { redirect } from 'next/navigation';
import { getPortalSession } from '@/lib/portal-auth';
import { PortalHeader } from '@/components/portal-header';
import { PortalNav } from '@/components/portal-nav';

interface PortalLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function PortalLayout({ children, params }: PortalLayoutProps) {
  const { tenantSlug } = await params;
  const session = await getPortalSession();

  if (!session) {
    redirect(`/${tenantSlug}/login`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <PortalHeader />
      <PortalNav />
      <main id="main-content" className="flex-1">
        {children}
      </main>
    </div>
  );
}
