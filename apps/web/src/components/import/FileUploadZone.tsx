'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X, Lightbulb, Clock } from 'lucide-react';

interface FileUploadZoneProps {
  onFileSelected: (file: { name: string; content: string; sizeBytes: number }) => void;
  isDisabled?: boolean;
  maxSizeMb?: number;
  instruction?: string;
  subtitle?: string;
  accept?: string;
  reassurance?: string;
  /** Educational tip shown below the upload zone (context-specific) */
  tip?: string;
  /** Estimated time label shown after file selection */
  estimateLabel?: string;
}

export function FileUploadZone({
  onFileSelected,
  isDisabled,
  maxSizeMb = 50,
  instruction,
  subtitle,
  accept = '.csv,.tsv,.txt',
  reassurance = "Your data will be analyzed before anything is imported. You'll review every mapping before we proceed.",
  tip,
  estimateLabel,
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; sizeBytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive allowed extensions from accept prop
  const allowedExtensions = accept.split(',').map((a) => a.trim().replace('.', '').toLowerCase());

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      if (file.size > maxSizeMb * 1024 * 1024) {
        setError(`File too large. Maximum size is ${maxSizeMb}MB.`);
        return;
      }

      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!allowedExtensions.includes(ext ?? '')) {
        setError(`Unsupported file type. Accepted: ${allowedExtensions.join(', ').toUpperCase()}.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        setSelectedFile({ name: file.name, sizeBytes: file.size });
        onFileSelected({ name: file.name, content, sizeBytes: file.size });
      };
      reader.onerror = () => {
        setError('Failed to read file.');
      };
      reader.readAsText(file);
    },
    [maxSizeMb, onFileSelected, allowedExtensions],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const defaultInstruction = 'Drop your CSV file here, or';
  const defaultSubtitle = `${allowedExtensions.join(', ').toUpperCase()} up to ${maxSizeMb}MB`;

  return (
    <div className="space-y-2">
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-border hover:border-muted-foreground'
        } ${isDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {selectedFile ? (
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-indigo-600" />
            <div>
              <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(selectedFile.sizeBytes)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="rounded p-1 hover:bg-accent/50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {instruction ?? defaultInstruction}{' '}
              <span className="text-indigo-500">browse</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {subtitle ?? defaultSubtitle}
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
          disabled={isDisabled}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {reassurance && !selectedFile && !error && (
        <p className="text-xs text-muted-foreground text-center italic">
          {reassurance}
        </p>
      )}
      {/* Contextual tip */}
      {tip && !selectedFile && !error && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/5 px-3 py-2">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p className="text-xs text-amber-500">{tip}</p>
        </div>
      )}
      {/* Estimate label after file selection */}
      {selectedFile && estimateLabel && (
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {estimateLabel}
        </div>
      )}
    </div>
  );
}
