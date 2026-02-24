/**
 * Target field definitions + deterministic column alias dictionary.
 *
 * Covers common exports from: Lightspeed, Square, Toast, ClubProphet,
 * Jonas, QuickBooks, Salesforce, HubSpot, and generic ERP/CRM systems.
 */

import type { TargetField } from './import-types';

// ── Target Fields ───────────────────────────────────────────────────

export const TARGET_FIELDS: TargetField[] = [
  // Identity
  { key: 'firstName', label: 'First Name', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'lastName', label: 'Last Name', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'fullName', label: 'Full Name (auto-split)', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'organizationName', label: 'Organization / Company', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'prefix', label: 'Name Prefix', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'suffix', label: 'Name Suffix', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'nickname', label: 'Nickname', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'memberNumber', label: 'Member Number', table: 'customers', group: 'identity', required: false, dataType: 'string' },
  { key: 'type', label: 'Customer Type', table: 'customers', group: 'identity', required: false, dataType: 'enum', enumValues: ['person', 'organization'] },

  // Contact
  { key: 'email', label: 'Email', table: 'customers', group: 'contact', required: false, dataType: 'string' },
  { key: 'phone', label: 'Phone / Mobile', table: 'customers', group: 'contact', required: false, dataType: 'string' },
  { key: 'homePhone', label: 'Home Phone', table: 'customers', group: 'contact', required: false, dataType: 'string' },
  { key: 'preferredContactMethod', label: 'Preferred Contact Method', table: 'customers', group: 'contact', required: false, dataType: 'enum', enumValues: ['email', 'phone', 'sms'] },

  // Address
  { key: 'addressLine1', label: 'Address Line 1', table: 'addresses', group: 'address', required: false, dataType: 'string' },
  { key: 'addressLine2', label: 'Address Line 2', table: 'addresses', group: 'address', required: false, dataType: 'string' },
  { key: 'city', label: 'City', table: 'addresses', group: 'address', required: false, dataType: 'string' },
  { key: 'state', label: 'State / Province', table: 'addresses', group: 'address', required: false, dataType: 'string' },
  { key: 'postalCode', label: 'Postal Code', table: 'addresses', group: 'address', required: false, dataType: 'string' },
  { key: 'country', label: 'Country', table: 'addresses', group: 'address', required: false, dataType: 'string' },
  { key: 'combinedCityStateZip', label: 'City, State Zip (auto-split)', table: 'addresses', group: 'address', required: false, dataType: 'string' },

  // Demographics
  { key: 'dateOfBirth', label: 'Date of Birth', table: 'customers', group: 'demographics', required: false, dataType: 'date' },
  { key: 'gender', label: 'Gender', table: 'customers', group: 'demographics', required: false, dataType: 'enum', enumValues: ['male', 'female', 'non_binary', 'prefer_not_to_say', 'other'] },
  { key: 'anniversary', label: 'Anniversary', table: 'customers', group: 'demographics', required: false, dataType: 'date' },

  // Golf
  { key: 'handicapIndex', label: 'Handicap Index', table: 'customers', group: 'golf', required: false, dataType: 'number' },
  { key: 'ghinNumber', label: 'GHIN Number', table: 'customers', group: 'golf', required: false, dataType: 'string' },

  // Financial
  { key: 'houseAccountBalance', label: 'House Account Balance', table: 'billing_accounts', group: 'financial', required: false, dataType: 'number' },
  { key: 'creditLimit', label: 'Credit Limit', table: 'billing_accounts', group: 'financial', required: false, dataType: 'number' },
  { key: 'taxExempt', label: 'Tax Exempt', table: 'customers', group: 'financial', required: false, dataType: 'boolean' },

  // Marketing
  { key: 'marketingConsent', label: 'Marketing Opt-In', table: 'customers', group: 'marketing', required: false, dataType: 'boolean' },
  { key: 'acquisitionSource', label: 'Acquisition Source', table: 'customers', group: 'marketing', required: false, dataType: 'string' },
  { key: 'referralSource', label: 'Referral Source', table: 'customers', group: 'marketing', required: false, dataType: 'string' },
  { key: 'tags', label: 'Tags / Categories', table: 'customers', group: 'marketing', required: false, dataType: 'string' },

  // Membership
  { key: 'membershipType', label: 'Membership Type', table: 'customers', group: 'membership', required: false, dataType: 'string' },
  { key: 'membershipStatus', label: 'Membership Status', table: 'customers', group: 'membership', required: false, dataType: 'string' },
  { key: 'joinDate', label: 'Join Date', table: 'customers', group: 'membership', required: false, dataType: 'date' },
  { key: 'expirationDate', label: 'Expiration Date', table: 'customers', group: 'membership', required: false, dataType: 'date' },

  // Status
  { key: 'status', label: 'Customer Status', table: 'customers', group: 'status', required: false, dataType: 'enum', enumValues: ['active', 'inactive', 'prospect', 'lead', 'suspended', 'banned', 'deceased', 'archived'] },
  { key: 'notes', label: 'Notes / Comments', table: 'customers', group: 'status', required: false, dataType: 'string' },

  // Meta
  { key: 'externalId', label: 'External / Legacy ID', table: 'external_ids', group: 'meta', required: false, dataType: 'string' },
  { key: 'spouseName', label: 'Spouse Name', table: 'customers', group: 'meta', required: false, dataType: 'string' },
];

// ── Column Aliases ──────────────────────────────────────────────────

export const COLUMN_ALIASES: Record<string, string[]> = {
  // ── Identity ──
  firstName: [
    'first_name', 'firstname', 'fname', 'given_name', 'givenname',
    'first', 'customer_first_name', 'contact_first_name',
    'contact_first', 'first_nm', 'name_first', 'first name',
    'given name', 'forename',
  ],
  lastName: [
    'last_name', 'lastname', 'lname', 'surname', 'family_name', 'familyname',
    'last', 'customer_last_name', 'contact_last_name',
    'contact_last', 'last_nm', 'name_last', 'last name',
    'family name',
  ],
  fullName: [
    'full_name', 'fullname', 'name', 'customer_name', 'contact_name',
    'display_name', 'displayname', 'customer name', 'full name',
    'member_name', 'member name',
  ],
  organizationName: [
    'organization_name', 'organizationname', 'org_name', 'orgname',
    'company', 'company_name', 'companyname', 'business_name', 'businessname',
    'club_name', 'corporation', 'entity_name', 'organization',
    'org', 'employer', 'business', 'company name',
  ],
  prefix: [
    'prefix', 'name_prefix', 'title', 'salutation', 'honorific', 'mr_mrs',
  ],
  suffix: [
    'suffix', 'name_suffix', 'generational', 'jr_sr',
  ],
  nickname: [
    'nickname', 'nick_name', 'preferred_name', 'goes_by', 'known_as',
    'preferred name', 'nick name',
  ],
  memberNumber: [
    'member_number', 'membernumber', 'member_no', 'member_id', 'memberid',
    'membership_number', 'membership_no', 'account_number', 'account_no',
    'card_number', 'badge_number', 'badge_id', 'member_code',
    'mbr_no', 'mbr_id', 'member_num', 'member number',
    'membership number', 'acct_no', 'acct_num',
  ],
  type: [
    'customer_type', 'customertype', 'record_type', 'entity_type',
    'person_or_org', 'account_type',
  ],

  // ── Contact ──
  email: [
    'email', 'email_address', 'emailaddress', 'e_mail', 'e-mail',
    'primary_email', 'contact_email', 'mail', 'email1',
    'email address', 'e mail',
  ],
  phone: [
    'phone', 'phone_number', 'phonenumber', 'telephone', 'tel', 'mobile',
    'mobile_phone', 'cell', 'cell_phone', 'cellphone', 'primary_phone',
    'contact_phone', 'phone1', 'mobile_number', 'cell_number',
    'phone number', 'mobile phone', 'cell phone',
  ],
  homePhone: [
    'home_phone', 'homephone', 'home_tel', 'phone2', 'landline',
    'residence_phone', 'evening_phone', 'home phone',
  ],
  preferredContactMethod: [
    'preferred_contact', 'preferred_contact_method', 'contact_preference',
    'best_way_to_reach', 'contact_method',
  ],

  // ── Address ──
  addressLine1: [
    'address', 'address_line_1', 'address_line1', 'addressline1', 'address1',
    'street', 'street_address', 'street_address_1', 'addr1', 'line1',
    'mailing_address', 'primary_address', 'street1',
    'address line 1', 'street address',
  ],
  addressLine2: [
    'address_line_2', 'address_line2', 'addressline2', 'address2',
    'street_address_2', 'addr2', 'line2', 'suite', 'apt', 'unit',
    'street2', 'address line 2',
  ],
  city: [
    'city', 'town', 'municipality', 'locality',
  ],
  state: [
    'state', 'state_province', 'province', 'region', 'state_code',
    'state_or_province', 'state province',
  ],
  postalCode: [
    'postal_code', 'postalcode', 'zip', 'zip_code', 'zipcode', 'postcode',
    'post_code', 'postal code', 'zip code',
  ],
  country: [
    'country', 'country_code', 'countrycode', 'nation',
  ],
  combinedCityStateZip: [
    'city_state_zip', 'citystatezip', 'city_state', 'citystate',
    'location', 'city state zip',
  ],

  // ── Demographics ──
  dateOfBirth: [
    'date_of_birth', 'dateofbirth', 'dob', 'birth_date', 'birthdate',
    'birthday', 'born', 'birth_dt', 'date of birth', 'birth date',
  ],
  gender: [
    'gender', 'sex', 'm_f',
  ],
  anniversary: [
    'anniversary', 'anniversary_date', 'wedding_date', 'wedding_anniversary',
  ],

  // ── Golf ──
  handicapIndex: [
    'handicap_index', 'handicap', 'hdcp', 'hcp', 'handicap_idx',
    'golf_handicap', 'handicap index',
  ],
  ghinNumber: [
    'ghin_number', 'ghin', 'ghin_no', 'ghin_id', 'usga_id',
    'golf_id', 'ghin number',
  ],

  // ── Financial ──
  houseAccountBalance: [
    'house_account_balance', 'house_balance', 'acct_balance', 'account_balance',
    'balance', 'ar_balance', 'receivable_balance', 'outstanding_balance',
    'balance_due', 'house account balance',
  ],
  creditLimit: [
    'credit_limit', 'creditlimit', 'credit_line', 'spending_limit',
    'credit limit',
  ],
  taxExempt: [
    'tax_exempt', 'taxexempt', 'tax_free', 'exempt', 'is_tax_exempt',
    'tax exempt',
  ],

  // ── Marketing ──
  marketingConsent: [
    'marketing_consent', 'marketingconsent', 'opt_in', 'optin',
    'email_opt_in', 'marketing_opt_in', 'receives_marketing',
    'marketing_emails', 'subscribe', 'subscribed', 'marketing consent',
    'email opt in',
  ],
  acquisitionSource: [
    'acquisition_source', 'source', 'lead_source', 'how_heard',
    'referral_type', 'origin', 'channel',
  ],
  referralSource: [
    'referral_source', 'referred_by', 'referrer', 'referral',
  ],
  tags: [
    'tags', 'labels', 'categories', 'groups', 'segments',
    'customer_tags', 'interests', 'keywords',
  ],

  // ── Membership ──
  membershipType: [
    'membership_type', 'membershiptype', 'member_type', 'membertype',
    'class', 'membership_class', 'plan', 'plan_name', 'tier',
    'membership type', 'member type',
  ],
  membershipStatus: [
    'membership_status', 'membershipstatus', 'member_status',
    'membership status', 'member status',
  ],
  joinDate: [
    'join_date', 'joindate', 'joined', 'enrollment_date', 'start_date',
    'member_since', 'date_joined', 'join date', 'start date',
  ],
  expirationDate: [
    'expiration_date', 'expirationdate', 'expiry', 'expiry_date',
    'end_date', 'renewal_date', 'expires', 'expiration date',
    'expiry date', 'end date',
  ],

  // ── Status ──
  status: [
    'status', 'customer_status', 'account_status',
    'active_status', 'record_status',
  ],
  notes: [
    'notes', 'comments', 'memo', 'remarks', 'description', 'internal_notes',
    'comment', 'note',
  ],

  // ── Meta ──
  externalId: [
    'external_id', 'externalid', 'legacy_id', 'old_id', 'previous_id',
    'source_id', 'import_id', 'original_id', 'legacy_customer_id',
    'customer_id', 'customerid', 'record_id',
    'lightspeed_id', 'square_id', 'toast_id', 'club_prophet_id',
    'jonas_id', 'quickbooks_id', 'salesforce_id', 'hubspot_id',
    'external id', 'legacy id',
  ],
  spouseName: [
    'spouse', 'spouse_name', 'partner', 'partner_name',
    'spouse name', 'partner name',
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────

export function getTargetFieldByKey(key: string): TargetField | undefined {
  return TARGET_FIELDS.find((f) => f.key === key);
}

export function getTargetFieldsByGroup(group: string): TargetField[] {
  return TARGET_FIELDS.filter((f) => f.group === group);
}

/** Groups for the mapping dropdown UI */
export const FIELD_GROUPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'contact', label: 'Contact' },
  { key: 'address', label: 'Address' },
  { key: 'demographics', label: 'Demographics' },
  { key: 'golf', label: 'Golf' },
  { key: 'financial', label: 'Financial' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'membership', label: 'Membership' },
  { key: 'status', label: 'Status' },
  { key: 'meta', label: 'Other' },
] as const;
