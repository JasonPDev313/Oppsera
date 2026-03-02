/**
 * Calendar link utilities for Google Calendar and Outlook.
 * Pure functions — no dependencies, no side effects.
 */

export interface CalendarEvent {
  title: string;
  startAt: Date;
  endAt: Date;
  description?: string;
  location?: string;
}

/**
 * Format a Date to Google Calendar's required format: YYYYMMDDTHHmmssZ
 */
function toGoogleDateFormat(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Build a Google Calendar "Add Event" URL.
 *
 * @example
 * buildGoogleCalendarUrl({
 *   title: 'Deep Tissue Massage',
 *   startAt: new Date('2026-03-15T14:00:00Z'),
 *   endAt: new Date('2026-03-15T15:00:00Z'),
 *   description: 'Your appointment at Serenity Spa',
 *   location: '123 Main St, Anytown',
 * })
 */
export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGoogleDateFormat(event.startAt)}/${toGoogleDateFormat(event.endAt)}`,
  });

  if (event.description) {
    params.set('details', event.description);
  }
  if (event.location) {
    params.set('location', event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Build an Outlook.com "Add Event" deep link URL.
 */
export function buildOutlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.startAt.toISOString(),
    enddt: event.endAt.toISOString(),
  });

  if (event.description) {
    params.set('body', event.description);
  }
  if (event.location) {
    params.set('location', event.location);
  }

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
