'use client';

import { Trash2 } from 'lucide-react';
import { MetricPicker, METRIC_INFO } from './MetricPicker';

export interface SmartTagCondition {
  metric: string;
  operator: string;
  value: unknown;
  unit?: string;
}

const NUMERIC_OPERATORS = [
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'eq', label: '=' },
  { value: 'neq', label: '!=' },
  { value: 'between', label: 'Between' },
];

const BOOLEAN_OPERATORS = [
  { value: 'eq', label: '=' },
];

const STRING_OPERATORS = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '!=' },
  { value: 'contains', label: 'Contains' },
  { value: 'in', label: 'In' },
];

function getOperatorsForMetric(metric: string) {
  const info = METRIC_INFO[metric];
  if (!info) return NUMERIC_OPERATORS;
  switch (info.valueType) {
    case 'boolean':
      return BOOLEAN_OPERATORS;
    case 'string':
      return STRING_OPERATORS;
    default:
      return NUMERIC_OPERATORS;
  }
}

function getMetricUnit(metric: string): string | undefined {
  return METRIC_INFO[metric]?.unit;
}

function getMetricValueType(metric: string): 'number' | 'boolean' | 'string' {
  return METRIC_INFO[metric]?.valueType ?? 'number';
}

interface ConditionRowProps {
  condition: SmartTagCondition;
  onChange: (condition: SmartTagCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function ConditionRow({ condition, onChange, onRemove, canRemove }: ConditionRowProps) {
  const operators = getOperatorsForMetric(condition.metric);
  const valueType = getMetricValueType(condition.metric);
  const unit = getMetricUnit(condition.metric);
  const isBetween = condition.operator === 'between';

  const handleMetricChange = (metric: string) => {
    const newInfo = METRIC_INFO[metric];
    const defaultOp = newInfo?.valueType === 'boolean' ? 'eq' : 'gt';
    const defaultVal = newInfo?.valueType === 'boolean' ? true : '';
    onChange({ metric, operator: defaultOp, value: defaultVal, unit: newInfo?.unit });
  };

  const handleOperatorChange = (operator: string) => {
    const newValue = operator === 'between' ? [condition.value ?? '', ''] : (condition.value ?? '');
    onChange({ ...condition, operator, value: newValue });
  };

  const handleValueChange = (value: unknown) => {
    onChange({ ...condition, value });
  };

  const handleBetweenChange = (index: 0 | 1, val: string) => {
    const arr = Array.isArray(condition.value) ? [...condition.value] : ['', ''];
    arr[index] = val;
    onChange({ ...condition, value: arr });
  };

  return (
    <div className="flex items-start gap-2">
      {/* Metric picker */}
      <div className="w-44 shrink-0">
        <MetricPicker value={condition.metric} onChange={handleMetricChange} />
      </div>

      {/* Operator select */}
      <div className="w-28 shrink-0">
        <select
          value={condition.operator}
          onChange={(e) => handleOperatorChange(e.target.value)}
          disabled={!condition.metric}
          className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:opacity-50"
        >
          {operators.map((op) => (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          ))}
        </select>
      </div>

      {/* Value input */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {valueType === 'boolean' ? (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!condition.value}
              onChange={(e) => handleValueChange(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {condition.value ? 'True' : 'False'}
          </label>
        ) : isBetween ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={String(Array.isArray(condition.value) ? condition.value[0] ?? '' : '')}
              onChange={(e) => handleBetweenChange(0, e.target.value)}
              placeholder="Min"
              className="w-24 rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-xs text-gray-400">and</span>
            <input
              type="number"
              value={String(Array.isArray(condition.value) ? condition.value[1] ?? '' : '')}
              onChange={(e) => handleBetweenChange(1, e.target.value)}
              placeholder="Max"
              className="w-24 rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        ) : valueType === 'number' ? (
          <input
            type="number"
            value={condition.value != null ? String(condition.value) : ''}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Value"
            className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        ) : (
          <input
            type="text"
            value={condition.value != null ? String(condition.value) : ''}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder={condition.operator === 'in' ? 'value1, value2, ...' : 'Value'}
            className="w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
        )}

        {unit && (
          <span className="shrink-0 text-xs text-gray-500">{unit}</span>
        )}
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
        title="Remove condition"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
