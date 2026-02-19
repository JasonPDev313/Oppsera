'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCustomReport } from '@/hooks/use-custom-reports';
import { ReportBuilder } from '@/components/reports/custom/report-builder';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function EditReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const reportId = params.reportId as string;
  const mode = searchParams.get('mode') || 'view';

  const { data: report, isLoading } = useCustomReport(reportId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <LoadingSpinner size="lg" label="Loading report..." />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 text-center text-gray-500">
        Report not found
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <ReportBuilder reportId={reportId} initialData={report} />
    </div>
  );
}
