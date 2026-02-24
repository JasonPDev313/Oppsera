import '@/app/globals.css';

export const metadata = {
  title: 'Pay Your Check | Powered by OppsEra',
};

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[480px] min-h-screen bg-white shadow-sm">
        {children}
      </div>
    </div>
  );
}
