/**
 * Simple mustache-style template renderer.
 * Replaces {{variable}} and {{nested.variable}} placeholders.
 */

export function renderTemplate(
  template: string,
  data: Record<string, unknown>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmedKey = key.trim();
    const value = resolveNestedValue(data, trimmedKey);
    return value != null ? String(value) : '';
  });
}

function resolveNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Build template data from a reservation + guest for message rendering.
 */
export function buildReservationTemplateData(
  reservation: {
    confirmationNumber?: string;
    checkInDate: string;
    checkOutDate: string;
    roomTypeName?: string;
    roomNumber?: string;
    totalCents?: number;
  },
  guest: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  },
  property: {
    name: string;
    checkInTime?: string;
    checkOutTime?: string;
  },
): Record<string, unknown> {
  return {
    guest: {
      firstName: guest.firstName ?? '',
      lastName: guest.lastName ?? '',
      fullName: [guest.firstName, guest.lastName].filter(Boolean).join(' '),
      email: guest.email ?? '',
      phone: guest.phone ?? '',
    },
    reservation: {
      confirmationNumber: reservation.confirmationNumber ?? '',
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      roomType: reservation.roomTypeName ?? '',
      roomNumber: reservation.roomNumber ?? '',
      total: reservation.totalCents != null ? `$${(reservation.totalCents / 100).toFixed(2)}` : '',
    },
    property: {
      name: property.name,
      checkInTime: property.checkInTime ?? '15:00',
      checkOutTime: property.checkOutTime ?? '11:00',
    },
  };
}
