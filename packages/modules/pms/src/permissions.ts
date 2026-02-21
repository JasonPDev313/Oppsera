export const PMS_PERMISSIONS = {
  // Property
  PROPERTY_VIEW: 'pms.property.view',
  PROPERTY_MANAGE: 'pms.property.manage',
  // Rooms
  ROOMS_VIEW: 'pms.rooms.view',
  ROOMS_MANAGE: 'pms.rooms.manage',
  // Reservations
  RESERVATIONS_VIEW: 'pms.reservations.view',
  RESERVATIONS_CREATE: 'pms.reservations.create',
  RESERVATIONS_EDIT: 'pms.reservations.edit',
  RESERVATIONS_CANCEL: 'pms.reservations.cancel',
  // Front Desk
  FRONT_DESK_CHECK_IN: 'pms.front_desk.check_in',
  FRONT_DESK_CHECK_OUT: 'pms.front_desk.check_out',
  FRONT_DESK_NO_SHOW: 'pms.front_desk.no_show',
  // Calendar
  CALENDAR_VIEW: 'pms.calendar.view',
  CALENDAR_MOVE: 'pms.calendar.move',
  CALENDAR_RESIZE: 'pms.calendar.resize',
  // Housekeeping
  HOUSEKEEPING_VIEW: 'pms.housekeeping.view',
  HOUSEKEEPING_MANAGE: 'pms.housekeeping.manage',
  // Guests
  GUESTS_VIEW: 'pms.guests.view',
  GUESTS_MANAGE: 'pms.guests.manage',
  // Folio
  FOLIO_VIEW: 'pms.folio.view',
  FOLIO_POST_CHARGES: 'pms.folio.post_charges',
  FOLIO_POST_PAYMENTS: 'pms.folio.post_payments',
  // Rates
  RATES_VIEW: 'pms.rates.view',
  RATES_MANAGE: 'pms.rates.manage',
} as const;

export type PmsPermission = (typeof PMS_PERMISSIONS)[keyof typeof PMS_PERMISSIONS];

// ── Role Definitions ─────────────────────────────────────────────
// 5 roles × 28 permissions

export const PMS_ROLE_PERMISSIONS: Record<string, PmsPermission[]> = {
  'PMS General Manager': Object.values(PMS_PERMISSIONS),

  'PMS Front Desk Agent': [
    PMS_PERMISSIONS.PROPERTY_VIEW,
    PMS_PERMISSIONS.ROOMS_VIEW,
    PMS_PERMISSIONS.RESERVATIONS_VIEW,
    PMS_PERMISSIONS.RESERVATIONS_CREATE,
    PMS_PERMISSIONS.RESERVATIONS_EDIT,
    PMS_PERMISSIONS.RESERVATIONS_CANCEL,
    PMS_PERMISSIONS.FRONT_DESK_CHECK_IN,
    PMS_PERMISSIONS.FRONT_DESK_CHECK_OUT,
    PMS_PERMISSIONS.FRONT_DESK_NO_SHOW,
    PMS_PERMISSIONS.CALENDAR_VIEW,
    PMS_PERMISSIONS.CALENDAR_MOVE,
    PMS_PERMISSIONS.CALENDAR_RESIZE,
    PMS_PERMISSIONS.HOUSEKEEPING_VIEW,
    PMS_PERMISSIONS.GUESTS_VIEW,
    PMS_PERMISSIONS.GUESTS_MANAGE,
    PMS_PERMISSIONS.FOLIO_VIEW,
    PMS_PERMISSIONS.FOLIO_POST_CHARGES,
    PMS_PERMISSIONS.FOLIO_POST_PAYMENTS,
  ],

  'PMS Housekeeping': [
    PMS_PERMISSIONS.ROOMS_VIEW,
    PMS_PERMISSIONS.HOUSEKEEPING_VIEW,
    PMS_PERMISSIONS.HOUSEKEEPING_MANAGE,
  ],

  'PMS Revenue Manager': [
    PMS_PERMISSIONS.PROPERTY_VIEW,
    PMS_PERMISSIONS.ROOMS_VIEW,
    PMS_PERMISSIONS.RESERVATIONS_VIEW,
    PMS_PERMISSIONS.RESERVATIONS_CREATE,
    PMS_PERMISSIONS.RESERVATIONS_EDIT,
    PMS_PERMISSIONS.CALENDAR_VIEW,
    PMS_PERMISSIONS.GUESTS_VIEW,
    PMS_PERMISSIONS.FOLIO_VIEW,
    PMS_PERMISSIONS.RATES_VIEW,
    PMS_PERMISSIONS.RATES_MANAGE,
  ],

  'PMS Read Only': [
    PMS_PERMISSIONS.PROPERTY_VIEW,
    PMS_PERMISSIONS.ROOMS_VIEW,
    PMS_PERMISSIONS.RESERVATIONS_VIEW,
    PMS_PERMISSIONS.CALENDAR_VIEW,
    PMS_PERMISSIONS.HOUSEKEEPING_VIEW,
    PMS_PERMISSIONS.GUESTS_VIEW,
    PMS_PERMISSIONS.FOLIO_VIEW,
    PMS_PERMISSIONS.RATES_VIEW,
  ],
};

export const PMS_ROLES = Object.keys(PMS_ROLE_PERMISSIONS);
