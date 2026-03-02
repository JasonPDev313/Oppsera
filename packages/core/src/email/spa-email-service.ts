/**
 * Spa Email Service — orchestrates sending booking-related emails.
 *
 * All functions are safe to call with try/catch — email failures
 * should never block booking operations.
 */

import { sendEmail } from './send-email';
import {
  spaBookingConfirmationEmail,
  type SpaConfirmationEmailData,
} from './templates/spa-booking-confirmation';
import {
  spaBookingCancellationEmail,
  type SpaCancellationEmailData,
} from './templates/spa-booking-cancellation';
import {
  spaBookingReminderEmail,
  type SpaReminderEmailData,
} from './templates/spa-booking-reminder';

export type { SpaConfirmationEmailData } from './templates/spa-booking-confirmation';
export type { SpaCancellationEmailData } from './templates/spa-booking-cancellation';
export type { SpaReminderEmailData } from './templates/spa-booking-reminder';

/**
 * Send booking confirmation email to the guest.
 * Non-fatal — logs errors but never throws.
 */
export async function sendSpaConfirmationEmail(
  to: string,
  data: SpaConfirmationEmailData,
): Promise<boolean> {
  try {
    const { subject, html } = spaBookingConfirmationEmail(data);
    await sendEmail(to, subject, html);
    return true;
  } catch (err) {
    console.error('[spa-email] Failed to send confirmation email:', err);
    return false;
  }
}

/**
 * Send cancellation email to the guest.
 * Non-fatal — logs errors but never throws.
 */
export async function sendSpaCancellationEmail(
  to: string,
  data: SpaCancellationEmailData,
): Promise<boolean> {
  try {
    const { subject, html } = spaBookingCancellationEmail(data);
    await sendEmail(to, subject, html);
    return true;
  } catch (err) {
    console.error('[spa-email] Failed to send cancellation email:', err);
    return false;
  }
}

/**
 * Send reminder email to the guest.
 * Non-fatal — logs errors but never throws.
 */
export async function sendSpaReminderEmail(
  to: string,
  data: SpaReminderEmailData,
): Promise<boolean> {
  try {
    const { subject, html } = spaBookingReminderEmail(data);
    await sendEmail(to, subject, html);
    return true;
  } catch (err) {
    console.error('[spa-email] Failed to send reminder email:', err);
    return false;
  }
}
