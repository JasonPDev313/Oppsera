'use client';

import { useRouter } from 'next/navigation';
import { useCustomerImport } from '@/hooks/use-customer-import';
import { FileUploadStep } from './FileUploadStep';
import { ColumnMappingTable } from './ColumnMappingTable';
import { ValidationSummary } from './ValidationSummary';
import { DuplicateResolutionPanel } from './DuplicateResolutionPanel';
import { ResultsScreen } from './ResultsScreen';
import { ImportWizardShell } from '@/components/import/ImportWizardShell';
import { ImportProgressStep } from '@/components/import/ImportProgressStep';
import { ReassuranceBanner } from '@/components/import/ReassuranceBanner';
import { ReadinessIndicator } from '@/components/import/ReadinessIndicator';

interface CustomerImportWizardProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'mapping', label: 'Map Columns' },
  { key: 'preview', label: 'Preview' },
  { key: 'import', label: 'Import' },
  { key: 'results', label: 'Results' },
];

function resolveStepKey(step: string): string {
  if (step === 'analyzing') return 'upload';
  if (step === 'validating') return 'mapping';
  if (step === 'validation_preview' || step === 'duplicates') return 'preview';
  if (step === 'importing') return 'import';
  return step;
}

export function CustomerImportWizard({ open, onClose }: CustomerImportWizardProps) {
  const router = useRouter();
  const wizard = useCustomerImport();

  const isImporting = wizard.step === 'importing';

  return (
    <ImportWizardShell
      open={open}
      onClose={onClose}
      title="Import Customers"
      subtitle="Upload a CSV and we'll map it to your customer fields"
      steps={STEPS}
      currentStep={resolveStepKey(wizard.step)}
      preventClose={isImporting}
      onReset={wizard.reset}
    >
      {/* Step 1: Upload */}
      {wizard.step === 'upload' && (
        <div className="space-y-4">
          <ReassuranceBanner />
          <FileUploadStep
            onFileSelected={wizard.handleFileSelected}
            error={wizard.error}
          />
        </div>
      )}

      {/* Step 2: Analyzing (spinner) */}
      {wizard.step === 'analyzing' && (
        <ImportProgressStep
          label="Analyzing your data with AI..."
          sublabel="Detecting column types and suggesting mappings"
        />
      )}

      {/* Step 3: Mapping */}
      {wizard.step === 'mapping' && (
        <ColumnMappingTable
          mappings={wizard.mappings}
          transforms={wizard.transforms}
          sampleRows={wizard.sampleRows}
          onUpdateMapping={wizard.updateMapping}
          onContinue={wizard.runValidation}
          onBack={() => { wizard.reset(); }}
        />
      )}

      {/* Step 4: Validating (spinner) */}
      {wizard.step === 'validating' && (
        <ImportProgressStep
          label={`Validating ${wizard.totalRows.toLocaleString()} rows...`}
          sublabel="Checking for duplicates and data issues"
        />
      )}

      {/* Step 5: Validation preview */}
      {wizard.step === 'validation_preview' && (
        <div className="space-y-4">
          <ReadinessIndicator
            readyCount={wizard.validRowCount}
            attentionCount={wizard.totalRows - wizard.validRowCount}
            totalCount={wizard.totalRows}
          />
          <ValidationSummary
          totalRows={wizard.totalRows}
          validRowCount={wizard.validRowCount}
          errors={wizard.validationErrors}
          warnings={wizard.validationWarnings}
          duplicateCount={wizard.duplicates.length}
          preview={wizard.preview}
          hasDuplicates={wizard.duplicates.length > 0}
          onContinue={wizard.duplicates.length > 0 ? wizard.goToDuplicates : wizard.executeImport}
          onBack={wizard.goToMapping}
        />
        </div>
      )}

      {/* Step 6: Duplicate resolution */}
      {wizard.step === 'duplicates' && (
        <DuplicateResolutionPanel
          duplicates={wizard.duplicates}
          resolutions={wizard.duplicateResolutions}
          onSetResolution={wizard.setDuplicateResolution}
          onSetAllResolutions={wizard.setAllDuplicateResolutions}
          onContinue={wizard.executeImport}
          onBack={wizard.goToValidation}
        />
      )}

      {/* Step 7: Importing */}
      {wizard.step === 'importing' && (
        <ImportProgressStep
          label="Importing customers..."
          sublabel={`Processing ${wizard.totalRows.toLocaleString()} records. Please don't close this window.`}
        />
      )}

      {/* Step 8: Results */}
      {wizard.step === 'results' && wizard.importResult && (
        <ResultsScreen
          result={wizard.importResult}
          onClose={onClose}
          onViewCustomers={() => {
            onClose();
            router.push('/customers');
          }}
        />
      )}
    </ImportWizardShell>
  );
}
