'use client';

import { useCallback } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { FileUploadZone } from '@/components/import/FileUploadZone';
import { ReassuranceBanner } from '@/components/import/ReassuranceBanner';
import { BringYourDataHero } from '@/components/import/BringYourDataHero';

interface UploadStepProps {
  isLoading: boolean;
  onFileSelected: (file: File) => void;
}

export function UploadStep({ isLoading, onFileSelected }: UploadStepProps) {
  // Bridge: FileUploadZone returns { name, content, sizeBytes } but the hook expects File
  const handleFileSelected = useCallback(
    (data: { name: string; content: string; sizeBytes: number }) => {
      const file = new File([data.content], data.name, { type: 'text/csv' });
      onFileSelected(file);
    },
    [onFileSelected],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Analyzing file...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BringYourDataHero variant="compact" />

      <FileUploadZone
        onFileSelected={handleFileSelected}
        accept=".csv,.tsv,.txt,.xls,.xlsx"
        maxSizeMb={5}
        instruction="Drop your staff export file here, or"
        subtitle="CSV, TSV, or Excel up to 5MB"
        reassurance=""
      />

      <ReassuranceBanner variant="prominent" />

      {/* Instructions */}
      <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-5">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <FileText className="w-4 h-4" />
          What to upload
        </h3>
        <ul className="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
          <li>Staff / employee export from your legacy POS, ERP, HR, or payroll system</li>
          <li>Must have a header row with column names</li>
          <li>Common columns: Name, Email, Username, Role, Location, Employee ID, PIN</li>
          <li>We&apos;ll intelligently detect and map columns automatically</li>
          <li>Max file size: 5 MB / 5,000 rows</li>
        </ul>
      </div>
    </div>
  );
}
