'use client';

import { useMemo } from 'react';
import { Select, type SelectOption } from '@/components/ui/select';

interface PeriodSelectorProps {
  value: string;
  onChange: (value: string) => void;
  fiscalYearStartMonth?: number;
  monthCount?: number;
  className?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function generatePeriodOptions(
  fiscalYearStartMonth: number,
  monthCount: number,
): SelectOption[] {
  const now = new Date();
  const options: SelectOption[] = [];

  for (let i = 0; i < monthCount; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 1-based
    const value = `${year}-${String(month).padStart(2, '0')}`;
    const label = `${MONTH_NAMES[d.getMonth()]} ${year}`;

    // Mark fiscal year start
    const isFiscalStart = month === fiscalYearStartMonth;
    options.push({
      value,
      label: isFiscalStart ? `${label} (FY Start)` : label,
    });
  }

  return options;
}

export function PeriodSelector({
  value,
  onChange,
  fiscalYearStartMonth = 1,
  monthCount = 24,
  className,
}: PeriodSelectorProps) {
  const options = useMemo(
    () => generatePeriodOptions(fiscalYearStartMonth, monthCount),
    [fiscalYearStartMonth, monthCount],
  );

  return (
    <Select
      options={options}
      value={value}
      onChange={(v) => onChange(v as string)}
      placeholder="Select period..."
      className={className}
    />
  );
}
