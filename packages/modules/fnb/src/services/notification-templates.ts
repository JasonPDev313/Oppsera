/**
 * HOST V2: Notification message templates.
 *
 * Templates use `{variableName}` placeholders rendered at send time.
 */

export const NOTIFICATION_TEMPLATES = {
  table_ready: {
    sms: 'Hi {guestName}! Your table at {venueName} is ready. Please return to the host stand within {expiryMinutes} minutes. View status: {statusUrl}',
  },
  reservation_confirmation: {
    sms: 'Confirmed: {guestName}, party of {partySize} at {venueName} on {date} at {time}. Reply CANCEL to cancel.',
  },
  reservation_reminder: {
    sms: 'Reminder: {guestName}, your reservation at {venueName} is today at {time} for {partySize}. Reply CANCEL to cancel.',
  },
  reservation_cancelled: {
    sms: 'Your reservation at {venueName} on {date} at {time} has been cancelled.',
  },
  waitlist_joined: {
    sms: "Hi {guestName}! You're #{position} on the waitlist at {venueName}. Estimated wait: ~{waitMinutes} min. Track your spot: {statusUrl}",
  },
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;

export function renderTemplate(
  templateKey: NotificationTemplateKey,
  variables: Record<string, string | number>,
): string {
  let text: string = NOTIFICATION_TEMPLATES[templateKey].sms;
  for (const [key, value] of Object.entries(variables)) {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return text;
}
