'use client';

interface Option {
  value: string;
  label: string;
  group?: string;
}

interface MappingDropdownProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function MappingDropdown({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled,
  size = 'md',
}: MappingDropdownProps) {
  // Group options if any have a group property
  const groups = new Map<string, Option[]>();
  const ungrouped: Option[] = [];

  for (const opt of options) {
    if (opt.group) {
      const list = groups.get(opt.group) ?? [];
      list.push(opt);
      groups.set(opt.group, list);
    } else {
      ungrouped.push(opt);
    }
  }

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm';

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`rounded-md border border-gray-300 bg-surface text-gray-900 dark:text-gray-100 ${sizeClasses} focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <option value="">{placeholder}</option>
      {ungrouped.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
      {Array.from(groups.entries()).map(([group, opts]) => (
        <optgroup key={group} label={group}>
          {opts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
