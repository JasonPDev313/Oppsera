import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OppsEra Admin',
  description: 'OppsEra Super Admin Panel',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-900 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
