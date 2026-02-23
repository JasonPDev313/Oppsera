import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Member Portal — OppsEra',
  description: 'Your membership account at a glance',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
