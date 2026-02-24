'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploadStepProps {
  onFileSelected: (file: File) => void;
  error: string | null;
}

const ACCEPTED_EXTENSIONS = ['.csv', '.tsv'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function FileUploadStep({ onFileSelected, error }: FileUploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const validateAndSubmit = useCallback((file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return; // silently ignore — user sees accepted types
    }
    if (file.size > MAX_SIZE) {
      return;
    }
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSubmit(file);
  }, [validateAndSubmit]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSubmit(file);
  }, [validateAndSubmit]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Upload Customer Data
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Import customers from a CSV or TSV file. We&apos;ll analyze your data and suggest column mappings.
        </p>
      </div>

      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors ${
          isDragOver
            ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/20'
            : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-10 w-10 text-gray-400" />
        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-300">
          Drop your file here, or <span className="text-indigo-600 dark:text-indigo-400">browse</span>
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          CSV or TSV — up to 10MB, max 10,000 rows
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
