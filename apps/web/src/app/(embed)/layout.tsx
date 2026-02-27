import '@/app/globals.css';

export const metadata = {
  title: 'OppsEra Embedded Widget',
  robots: 'noindex, nofollow',
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}
