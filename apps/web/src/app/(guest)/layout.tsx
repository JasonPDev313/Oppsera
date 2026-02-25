import '@/app/globals.css';

export const metadata = {
  title: 'Pay Your Check | Powered by OppsEra',
};

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="light min-h-screen bg-gray-100">
      <div className="mx-auto max-w-[480px] min-h-screen bg-white shadow-lg">
        {children}
      </div>
    </div>
  );
}
