export interface CsvColumn {
  key: string;
  label: string;
}

/**
 * Generates a CSV buffer from structured data with proper escaping and UTF-8 BOM.
 *
 * - Escapes fields containing commas, quotes, or newlines per RFC 4180.
 * - Prepends UTF-8 BOM (\uFEFF) so Excel auto-detects encoding.
 * - Returns a Buffer ready for HTTP response.
 */
export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): Buffer {
  const BOM = '\uFEFF';

  const escapeField = (value: unknown): string => {
    const str = value == null ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const headerLine = columns.map((c) => escapeField(c.label)).join(',');
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(','),
  );

  const csv = BOM + [headerLine, ...dataLines].join('\r\n') + '\r\n';
  return Buffer.from(csv, 'utf-8');
}
