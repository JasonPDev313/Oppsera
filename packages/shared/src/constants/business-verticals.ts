import type { BusinessTier } from './erp-tiers';

export type VerticalStatus = 'available' | 'coming_soon';

export interface BusinessVertical {
  key: string;
  name: string;
  icon: string;
  description: string;
  status: VerticalStatus;
  category: 'primary' | 'hospitality' | 'health_wellness' | 'professional' | 'other';
  defaultTier: BusinessTier;
  recommendedModules: string[];
}

export const BUSINESS_VERTICALS: readonly BusinessVertical[] = [
  // ── PRIMARY (main signup grid) ────────────────────────────────
  { key: 'retail',     name: 'Retail Store',           icon: 'ShoppingBag',      description: 'Retail POS, inventory, customers',              status: 'available',    category: 'primary',         defaultTier: 'SMB',        recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'restaurant', name: 'Restaurant / Bar',       icon: 'UtensilsCrossed',  description: 'F&B POS, kitchen, tables, tabs',                status: 'available',    category: 'primary',         defaultTier: 'SMB',        recommendedModules: ['catalog', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting', 'room_layouts'] },
  { key: 'hybrid',     name: 'Hybrid (Retail + F&B)',  icon: 'Layers',           description: 'Combined retail and restaurant',                status: 'available',    category: 'primary',         defaultTier: 'SMB',        recommendedModules: ['catalog', 'pos_retail', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting', 'room_layouts'] },

  // ── HOSPITALITY ───────────────────────────────────────────────
  { key: 'hotel',           name: 'Hotel / Resort',       icon: 'Hotel',           description: 'Front desk, reservations, housekeeping',  status: 'coming_soon', category: 'hospitality',     defaultTier: 'MID_MARKET', recommendedModules: ['pms', 'catalog', 'pos_fnb', 'payments', 'customers', 'reporting'] },
  { key: 'golf_club',      name: 'Golf / Country Club',  icon: 'Flag',            description: 'Tee sheet, pro shop, F&B, memberships',   status: 'available',   category: 'hospitality',     defaultTier: 'MID_MARKET', recommendedModules: ['catalog', 'pos_retail', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting', 'room_layouts', 'golf_ops', 'club_membership', 'accounting'] },
  { key: 'event_venue',    name: 'Event Venue',          icon: 'PartyPopper',     description: 'Bookings, catering, event management',    status: 'coming_soon', category: 'hospitality',     defaultTier: 'SMB',        recommendedModules: ['catalog', 'pos_fnb', 'payments', 'customers', 'reporting', 'room_layouts'] },
  { key: 'brewery_winery', name: 'Brewery / Winery',     icon: 'Wine',            description: 'Taproom POS, tours, bottle shop',         status: 'coming_soon', category: 'hospitality',     defaultTier: 'SMB',        recommendedModules: ['catalog', 'pos_retail', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'cafe_bakery',    name: 'Cafe / Bakery',        icon: 'Coffee',          description: 'Quick-serve POS, inventory, loyalty',      status: 'coming_soon', category: 'hospitality',     defaultTier: 'SMB',        recommendedModules: ['catalog', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'food_truck',     name: 'Food Truck',           icon: 'Truck',           description: 'Mobile POS, simple menu, payments',        status: 'coming_soon', category: 'hospitality',     defaultTier: 'SMB',        recommendedModules: ['catalog', 'pos_fnb', 'payments', 'inventory', 'reporting'] },

  // ── HEALTH & WELLNESS ─────────────────────────────────────────
  { key: 'salon',           name: 'Salon / Barbershop',       icon: 'Scissors',    description: 'Appointments, POS, client management',  status: 'coming_soon', category: 'health_wellness', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting'] },
  { key: 'spa',             name: 'Spa / Wellness Center',    icon: 'Sparkles',    description: 'Services, packages, memberships',        status: 'coming_soon', category: 'health_wellness', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting', 'club_membership'] },
  { key: 'fitness',         name: 'Gym / Fitness Studio',     icon: 'Dumbbell',    description: 'Memberships, classes, retail',            status: 'coming_soon', category: 'health_wellness', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting', 'club_membership'] },
  { key: 'veterinary',      name: 'Veterinary Clinic',        icon: 'Heart',       description: 'Patient billing, inventory, POS',         status: 'coming_soon', category: 'health_wellness', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'dental',          name: 'Dental Office',            icon: 'Smile',       description: 'Patient billing, services, insurance',    status: 'coming_soon', category: 'health_wellness', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting'] },
  { key: 'medical_office',  name: 'Medical Office',           icon: 'Stethoscope', description: 'Patient billing, copays, inventory',      status: 'coming_soon', category: 'health_wellness', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'chiropractic',    name: 'Chiropractic / PT',        icon: 'Activity',    description: 'Sessions, billing, patient mgmt',         status: 'coming_soon', category: 'health_wellness', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting'] },

  // ── PROFESSIONAL SERVICES ─────────────────────────────────────
  { key: 'auto_repair',  name: 'Auto Repair Shop',           icon: 'Wrench',        description: 'Service orders, parts, billing',       status: 'coming_soon', category: 'professional', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'car_wash',     name: 'Car Wash',                   icon: 'Droplets',      description: 'Services, memberships, POS',            status: 'coming_soon', category: 'professional', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting', 'club_membership'] },
  { key: 'dry_cleaner',  name: 'Dry Cleaner / Laundry',      icon: 'Shirt',         description: 'Orders, tracking, billing',             status: 'coming_soon', category: 'professional', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting'] },
  { key: 'florist',      name: 'Florist',                    icon: 'Flower2',       description: 'POS, inventory, delivery tracking',     status: 'coming_soon', category: 'professional', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'pet_grooming', name: 'Pet Grooming / Boarding',    icon: 'Dog',           description: 'Appointments, POS, client mgmt',        status: 'coming_soon', category: 'professional', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting'] },
  { key: 'print_shop',   name: 'Print / Copy Shop',          icon: 'Printer',       description: 'Orders, inventory, POS',                status: 'coming_soon', category: 'professional', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'tutoring',     name: 'Tutoring Center',            icon: 'GraduationCap', description: 'Sessions, billing, student mgmt',       status: 'coming_soon', category: 'professional', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting'] },

  // ── OTHER ─────────────────────────────────────────────────────
  { key: 'funeral_home',   name: 'Funeral Home',               icon: 'Landmark',        description: 'Services, billing, inventory',         status: 'coming_soon', category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting', 'accounting'] },
  { key: 'nonprofit',      name: 'Nonprofit / Church',         icon: 'HeartHandshake',  description: 'Donations, events, memberships',       status: 'coming_soon', category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'payments', 'customers', 'reporting', 'club_membership'] },
  { key: 'marina',         name: 'Marina / Boat Rental',       icon: 'Anchor',          description: 'Slips, rentals, pro shop, F&B',        status: 'coming_soon', category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'campground',     name: 'Campground / RV Park',       icon: 'Tent',            description: 'Sites, reservations, retail',           status: 'coming_soon', category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'customers', 'reporting'] },
  { key: 'thrift_store',   name: 'Thrift / Consignment',       icon: 'Recycle',         description: 'POS, inventory, consignment tracking',  status: 'coming_soon', category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'hardware_store', name: 'Hardware Store',              icon: 'Hammer',          description: 'POS, inventory, special orders',        status: 'coming_soon', category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'liquor_store',   name: 'Liquor / Wine Shop',         icon: 'GlassWater',      description: 'POS, inventory, age verification',      status: 'coming_soon', category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
  { key: 'general',        name: 'Other Business',             icon: 'Building2',       description: 'General SMB with POS + back office',    status: 'available',   category: 'other', defaultTier: 'SMB', recommendedModules: ['catalog', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'] },
] as const;

export type VerticalKey = (typeof BUSINESS_VERTICALS)[number]['key'];

export function getVertical(key: string) {
  return BUSINESS_VERTICALS.find((v) => v.key === key);
}

export function getPrimaryVerticals() {
  return BUSINESS_VERTICALS.filter((v) => v.category === 'primary');
}

export function getVerticalsByCategory(cat: string) {
  return BUSINESS_VERTICALS.filter((v) => v.category === cat);
}

export function getAvailableVerticals() {
  return BUSINESS_VERTICALS.filter((v) => v.status === 'available');
}
