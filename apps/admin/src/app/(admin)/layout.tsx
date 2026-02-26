import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { AdminSidebar } from '@/components/AdminSidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen bg-slate-950">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminSidebar />
      <main id="main-content" className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
