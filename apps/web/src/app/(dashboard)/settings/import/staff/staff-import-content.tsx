'use client';

import { useStaffImport } from '@/hooks/use-staff-import';
import { UploadStep } from '@/components/import/staff/UploadStep';
import { MappingStep } from '@/components/import/staff/MappingStep';
import { ValueMappingStep } from '@/components/import/staff/ValueMappingStep';
import { PreviewStep } from '@/components/import/staff/PreviewStep';
import { ResultsStep } from '@/components/import/staff/ResultsStep';
import { Upload, Columns3, GitMerge, Eye, Loader2, CheckCircle2 } from 'lucide-react';

const STEPS = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'mapping', label: 'Map Columns', icon: Columns3 },
  { key: 'values', label: 'Roles & Locations', icon: GitMerge },
  { key: 'preview', label: 'Preview', icon: Eye },
  { key: 'results', label: 'Results', icon: CheckCircle2 },
] as const;

export default function StaffImportContent() {
  const wizard = useStaffImport();

  const currentStepIdx = STEPS.findIndex((s) => {
    if (wizard.step === 'executing') return s.key === 'preview';
    if (wizard.step === 'results') return s.key === 'results';
    return s.key === wizard.step;
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Import Staff / Employees
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Bring your existing staff data with you. Upload a CSV or Excel export from any
          system &mdash; we&apos;ll auto-map columns, detect duplicates, and show you a
          preview before anything changes.
        </p>
      </div>

      {/* Step indicator */}
      <nav className="flex items-center gap-2">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const isActive = idx === currentStepIdx;
          const isComplete = idx < currentStepIdx;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {idx > 0 && (
                <div className={`w-8 h-px ${isComplete ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
              )}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : isComplete
                      ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Error banner */}
      {wizard.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {wizard.error}
        </div>
      )}

      {/* Step content */}
      <div className="min-h-[400px]">
        {wizard.step === 'upload' && (
          <UploadStep
            isLoading={wizard.isLoading}
            onFileSelected={wizard.analyzeFile}
          />
        )}

        {wizard.step === 'mapping' && wizard.analysis && (
          <MappingStep
            analysis={wizard.analysis}
            columnMappings={wizard.columnMappings}
            onMappingsChange={wizard.setColumnMappings}
            importMode={wizard.importMode}
            onImportModeChange={wizard.setImportMode}
            autoGenerateUsername={wizard.autoGenerateUsername}
            onAutoGenerateUsernameChange={wizard.setAutoGenerateUsername}
            onNext={wizard.confirmMappings}
            onBack={wizard.reset}
          />
        )}

        {wizard.step === 'values' && wizard.context && (
          <ValueMappingStep
            valueMappings={wizard.valueMappings}
            onValueMappingsChange={wizard.setValueMappings}
            context={wizard.context}
            defaultRoleId={wizard.defaultRoleId}
            onDefaultRoleIdChange={wizard.setDefaultRoleId}
            defaultLocationIds={wizard.defaultLocationIds}
            onDefaultLocationIdsChange={wizard.setDefaultLocationIds}
            isLoading={wizard.isLoading}
            onNext={wizard.validateImport}
            onBack={wizard.goBack}
          />
        )}

        {(wizard.step === 'preview' || wizard.step === 'executing') && wizard.validation && (
          <PreviewStep
            validation={wizard.validation}
            isExecuting={wizard.step === 'executing'}
            isLoading={wizard.isLoading}
            onExecute={() => wizard.executeImport(false)}
            onDryRun={() => wizard.executeImport(true)}
            onBack={wizard.goBack}
          />
        )}

        {wizard.step === 'results' && wizard.result && (
          <ResultsStep
            result={wizard.result}
            onReset={wizard.reset}
          />
        )}
      </div>
    </div>
  );
}
