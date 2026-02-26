'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { VendorForm } from '@/components/vendors/vendor-form';
import { useVendorMutations } from '@/hooks/use-vendors';
import type { VendorFormInput } from '@/types/vendors';

export default function NewVendorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { createVendor, isSubmitting } = useVendorMutations();

  const handleSubmit = async (input: VendorFormInput) => {
    try {
      const vendor = await createVendor(input);
      toast.success(`Vendor "${vendor.name}" created`);
      router.push(`/vendors/${vendor.id}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create vendor');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/vendors')}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">New Vendor</h1>
          <p className="mt-1 text-sm text-muted-foreground">Add a new supplier to your system</p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6">
        <VendorForm
          onSubmit={handleSubmit}
          onCancel={() => router.push('/vendors')}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
}
