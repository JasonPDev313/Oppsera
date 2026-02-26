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
        <h3 className="text-lg font-semibold text-foreground">
          Upload Customer Data
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Import customers from a CSV or TSV file. We&apos;ll analyze your data and suggest column mappings.
        </p>
      </div>

      <div
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-12 transition-colors ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-border hover:border-muted-foreground'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Drop your file here, or <span className="text-indigo-500">browse</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
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
        <div className="rounded-md bg-red-500/10 p-3">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}
    </div>
  );
}
