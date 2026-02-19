/**
 * Computes the business date for a given UTC timestamp, adjusting for
 * the location's timezone and optional day-close-time offset.
 *
 * @param occurredAt - UTC timestamp (ISO 8601 string or Date)
 * @param timezone   - IANA timezone (e.g. 'America/New_York')
 * @param dayCloseTime - 'HH:MM' representing when the business day ends.
 *   Default '00:00' (standard midnight cutover). '02:00' means events
 *   between midnight and 2:00 AM local belong to the previous business day.
 * @returns 'YYYY-MM-DD' business date string
 */
export function computeBusinessDate(
  occurredAt: string | Date,
  timezone: string,
  dayCloseTime?: string,
): string {
  const ts = typeof occurredAt === 'string' ? new Date(occurredAt) : occurredAt;

  // Parse dayCloseTime offset (default '00:00' = no shift)
  const close = dayCloseTime ?? '00:00';
  const [hoursStr, minutesStr] = close.split(':');
  const offsetMs =
    (parseInt(hoursStr!, 10) || 0) * 3_600_000 +
    (parseInt(minutesStr!, 10) || 0) * 60_000;

  // Shift the timestamp backward by the day-close offset.
  // An event at 01:30 local with dayCloseTime '02:00' → shifted to 23:30 previous day.
  const shifted = new Date(ts.getTime() - offsetMs);

  // Format in the target timezone → 'YYYY-MM-DD' (en-CA locale produces this format)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(shifted);
}
