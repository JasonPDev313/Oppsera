import dotenv from 'dotenv';

// --remote flag loads .env.remote first so seed targets production Supabase
const isRemote = process.argv.includes('--remote');
if (isRemote) {
  dotenv.config({ path: '../../.env.remote', override: true });
}
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, sql } from 'drizzle-orm';
import postgres from 'postgres';
import { generateUlid } from '@oppsera/shared';
import {
  tenants,
  catalogCategories,
  catalogItems,
  catalogModifierGroups,
  catalogModifiers,
  catalogItemModifierGroups,
  inventoryItems,
  customers,
  customerIdentifiers,
  customerContacts,
  customerPreferences,
  customerAuthAccounts,
  customerActivityLog,
  membershipPlans,
  customerMemberships,
  billingAccounts,
  billingAccountMembers,
  orders,
  orderLines,
  orderLineTaxes,
  orderCounters,
  tenders,
  pmsRatePlans,
  pmsRatePlanPrices,
  pmsGuests,
  pmsReservations,
  pmsFolios,
  pmsFolioEntries,
} from './schema';

// ══════════════════════════════════════════════════════════════
// ══ COMPREHENSIVE ADDITIVE SEED ══════════════════════════════
// ══════════════════════════════════════════════════════════════
// RULES:
//   1. NO DELETE, NO TRUNCATE — purely additive
//   2. All new data is INSERTED alongside existing data
//   3. Query existing data first, generate new alongside
//   4. Read models use ON CONFLICT ... DO UPDATE (upsert)
//   5. Safe to run multiple times (uses deterministic ULIDs via seeded PRNG)
// ══════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────
const DAYS_BACK = 366;
const TARGET_REVENUE_CENTS = 100_000_000; // ~$1M target
const VOID_RATE = 0.07;
const CASH_RATIO = 0.30;
const CUSTOMER_ASSIGN_RATE = 0.55;
const NEW_CUSTOMER_COUNT = 96; // add 96 to existing 4 = 100
const NEW_GUEST_COUNT = 78; // add 78 to existing 22 = ~100
const NEW_RESERVATION_COUNT = 80; // add 80 to existing 20 = ~100
const BATCH = 100;

// ── PRNG ─────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let t = seed + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260301);
function randBetween(min: number, max: number) { return min + rand() * (max - min); }
function randInt(min: number, max: number) { return Math.floor(randBetween(min, max + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]!; }
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => rand() - 0.5);
  return shuffled.slice(0, n);
}

// ── DATE HELPERS ─────────────────────────────────────────────
function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function bizDate(d: Date): string { return d.toISOString().slice(0, 10); }
function pastTimestamp(baseDate: Date, hourOfDay: number): Date {
  const d = new Date(baseDate);
  d.setHours(hourOfDay, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
  return d;
}
function getSeason(month: number): string {
  if (month >= 5 && month <= 7) return 'summer';
  if (month === 3 || month === 4 || month === 8 || month === 9) return 'shoulder';
  return 'winter';
}

// Seasonal revenue targets per day (dollars)
const SEASON_BASE: Record<string, number> = {
  summer: 4200,
  shoulder: 2900,
  winter: 1800,
};
const TOURNAMENT_DAYS = new Set([30, 75, 120, 165, 210, 255, 300, 345]);

// Tax rates matching seed.ts
const RETAIL_TAX_RATE = 0.075;
const FOOD_TAX_RATE = 0.0825;
const ALCOHOL_TAX_RATE = 0.0825;

// ══════════════════════════════════════════════════════════════
// ══ NAME DATA ════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
const FIRST_NAMES_M = ['Michael','David','Robert','James','William','Thomas','Daniel','Christopher','Matthew','Andrew','Joseph','Anthony','Steven','Kevin','Brian','Timothy','Mark','Paul','Eric','Jason','Scott','Raymond','Gregory','Nathan','Peter','Kenneth','Jeffrey','Benjamin','Patrick','George','Douglas','Vincent','Russell','Dennis','Philip','Harold','Henry','Lawrence','Gerald','Albert','Frank','Howard','Norman','Stanley','Carl','Eugene','Samuel','Arthur','Roy','Ralph','Roger','Bruce','Keith','Wayne','Craig','Alan','Terry','Leonard','Fred','Jerry','Glenn','Warren','Derek','Martin','Victor','Clifford','Luis','Ricardo','Miguel','Omar','Rafael','Eduardo','Alejandro','Marco','Oscar','Ramon','Pablo','Sergio','Carlos','Roberto','Fernando','Diego','Andres','Javier','Hector','Ivan','Hugo','Cesar','Ernesto','Alfredo','Julio','Raul'];
const FIRST_NAMES_F = ['Mary','Patricia','Jennifer','Linda','Sarah','Karen','Sandra','Barbara','Jessica','Nancy','Betty','Margaret','Lisa','Ashley','Emily','Donna','Michelle','Dorothy','Carol','Amanda','Susan','Stephanie','Rebecca','Teresa','Helen','Catherine','Diane','Ann','Sharon','Christina','Victoria','Nicole','Rachel','Carolyn','Ruth','Frances','Brenda','Angela','Katherine','Theresa','Alice','Martha','Marie','Deborah','Laura','Gloria','Grace','Jean','Evelyn','Joyce','Maria','Ana','Lucia','Carmen','Isabel','Elena','Sofia','Rosa','Adriana','Gabriela','Mariana','Valentina','Natalia','Catalina','Fernanda','Valeria','Camila','Daniela','Paula','Andrea','Diana','Silvia','Claudia','Monica','Alicia','Teresa','Luz','Pilar','Beatriz','Dolores','Irene','Yolanda'];
const LAST_NAMES = ['Anderson','Baker','Campbell','Davis','Evans','Franklin','Garcia','Harris','Ingram','Jackson','Kelly','Lopez','Mitchell','Nelson','O\'Brien','Patterson','Quinn','Robinson','Sullivan','Thompson','Underwood','Vasquez','Williams','Xiong','Young','Zhang','Aaronson','Bergman','Cho','DeLuca','Espinoza','Fontaine','Gutierrez','Hoffman','Ibarra','Jensen','Katz','Lambert','Morales','Novak','Ochoa','Petrov','Ramos','Schmidt','Takahashi','Uribe','Volkov','Watanabe','Xavier','Yamamoto','Zimmerman','Ashworth','Bradford','Cartwright','Donovan','Ellsworth','Fairbanks','Goldberg','Hawthorne','Ironside','Jameson','Kirkwood','Lawson','Montgomery','Northcott','Pemberton','Radcliffe','Sherwood','Townsend','Wentworth','Prescott','Thornton','Whitfield','Calloway','Hargrove','Kingsley','Livingston','Merriweather','Sinclair','Woodward','Blackwell','Chandler','Davenport','Fairchild','Hartwell','Lockwood','Pemberton','Rockwell','Stanhope','Vanderbilt','Wellington','Ashford','Brighton','Crawford','Dunmore','Eastwood','Foxworth'];

const EMAIL_DOMAINS = ['gmail.com','outlook.com','yahoo.com','icloud.com','proton.me','hotmail.com','aol.com'];
const AREA_CODES = ['910','704','919','336','252','843','770','404','678','305','212','617','415','310','469','202','813','508','786','856','504'];

const GENDERS = ['male','female','non_binary','prefer_not_to_say'];
const ACQUISITION_SOURCES = ['walk_in','referral','website','social_media','event','tournament','hotel_guest','golf_outing','corporate','advertising'];
const LOYALTY_TIERS = ['bronze','silver','gold','platinum',null,null,null,null]; // most have none

// ══════════════════════════════════════════════════════════════
// ══ CATALOG DATA ═════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════

// 3-level hierarchy: Departments (top-level) → SubDepartments → Categories
// We add these alongside the existing flat 5 categories
interface CatDef { key: string; name: string; sortOrder: number; children: Array<{ key: string; name: string; sortOrder: number; children?: Array<{ key: string; name: string; sortOrder: number }> }> }
const CATALOG_HIERARCHY: CatDef[] = [
  {
    key: 'food_bev', name: 'Food & Beverage', sortOrder: 10,
    children: [
      { key: 'grill', name: 'Grill Menu', sortOrder: 1, children: [
        { key: 'appetizers', name: 'Appetizers', sortOrder: 1 },
        { key: 'entrees', name: 'Entrees', sortOrder: 2 },
        { key: 'sandwiches', name: 'Sandwiches & Wraps', sortOrder: 3 },
        { key: 'sides', name: 'Sides', sortOrder: 4 },
        { key: 'desserts', name: 'Desserts', sortOrder: 5 },
      ]},
      { key: 'bar', name: 'Bar', sortOrder: 2, children: [
        { key: 'cocktails', name: 'Cocktails', sortOrder: 1 },
        { key: 'wine', name: 'Wine', sortOrder: 2 },
        { key: 'spirits', name: 'Spirits', sortOrder: 3 },
      ]},
      { key: 'snack_bar', name: 'Snack Bar', sortOrder: 3 },
    ],
  },
  {
    key: 'pro_shop', name: 'Pro Shop', sortOrder: 20,
    children: [
      { key: 'mens_apparel', name: "Men's Apparel", sortOrder: 1 },
      { key: 'womens_apparel', name: "Women's Apparel", sortOrder: 2 },
      { key: 'headwear', name: 'Headwear', sortOrder: 3 },
      { key: 'clubs', name: 'Clubs & Equipment', sortOrder: 4 },
      { key: 'accessories', name: 'Accessories', sortOrder: 5 },
      { key: 'footwear', name: 'Footwear', sortOrder: 6 },
    ],
  },
  {
    key: 'golf_ops', name: 'Golf Operations', sortOrder: 30,
    children: [
      { key: 'green_fees_dept', name: 'Green Fees', sortOrder: 1 },
      { key: 'lessons', name: 'Lessons & Clinics', sortOrder: 2 },
      { key: 'rentals', name: 'Rentals', sortOrder: 3 },
      { key: 'range', name: 'Driving Range', sortOrder: 4 },
    ],
  },
  {
    key: 'spa_wellness', name: 'Spa & Wellness', sortOrder: 40,
    children: [
      { key: 'massages', name: 'Massages', sortOrder: 1 },
      { key: 'facials', name: 'Facials & Skin Care', sortOrder: 2 },
      { key: 'fitness', name: 'Fitness Center', sortOrder: 3 },
    ],
  },
  {
    key: 'activities', name: 'Activities & Events', sortOrder: 50,
    children: [
      { key: 'water_sports', name: 'Water Sports', sortOrder: 1 },
      { key: 'kids_club', name: "Kids' Club", sortOrder: 2 },
      { key: 'event_space', name: 'Event Space Rental', sortOrder: 3 },
    ],
  },
];

// New items to add alongside existing 10
interface ItemDef {
  key: string; catKey: string; sku: string; name: string;
  desc?: string; type: string; price: string; cost: string;
  taxType: 'retail' | 'food' | 'alcohol' | 'exempt';
  trackable?: boolean; barcode?: string;
}

const NEW_ITEMS: ItemDef[] = [
  // ── Grill Menu ──
  { key: 'wings', catKey: 'appetizers', sku: 'FOOD-010', name: 'Buffalo Wings', desc: '10 crispy wings with ranch', type: 'food', price: '12.99', cost: '4.00', taxType: 'food' },
  { key: 'nachos', catKey: 'appetizers', sku: 'FOOD-011', name: 'Loaded Nachos', desc: 'Tortilla chips with queso, jalapeños, salsa', type: 'food', price: '10.99', cost: '3.50', taxType: 'food' },
  { key: 'shrimp_cocktail', catKey: 'appetizers', sku: 'FOOD-012', name: 'Shrimp Cocktail', type: 'food', price: '15.99', cost: '7.00', taxType: 'food' },
  { key: 'steak', catKey: 'entrees', sku: 'FOOD-020', name: 'NY Strip Steak', desc: '12oz NY Strip with seasonal vegetables', type: 'food', price: '38.99', cost: '16.00', taxType: 'food' },
  { key: 'salmon', catKey: 'entrees', sku: 'FOOD-021', name: 'Grilled Atlantic Salmon', desc: 'With lemon butter and rice pilaf', type: 'food', price: '28.99', cost: '12.00', taxType: 'food' },
  { key: 'chicken', catKey: 'entrees', sku: 'FOOD-022', name: 'Herb Roasted Chicken', desc: 'Half chicken with roasted potatoes', type: 'food', price: '22.99', cost: '8.00', taxType: 'food' },
  { key: 'fish_tacos', catKey: 'entrees', sku: 'FOOD-023', name: 'Fish Tacos', desc: 'Three blackened mahi tacos with slaw', type: 'food', price: '16.99', cost: '6.00', taxType: 'food' },
  { key: 'club_sandwich', catKey: 'sandwiches', sku: 'FOOD-030', name: 'Club Sandwich', desc: 'Turkey, bacon, lettuce, tomato on sourdough', type: 'food', price: '13.99', cost: '4.50', taxType: 'food' },
  { key: 'blt_wrap', catKey: 'sandwiches', sku: 'FOOD-031', name: 'BLT Wrap', type: 'food', price: '11.99', cost: '3.50', taxType: 'food' },
  { key: 'grilled_cheese', catKey: 'sandwiches', sku: 'FOOD-032', name: 'Grilled Cheese & Tomato Soup', type: 'food', price: '10.99', cost: '3.00', taxType: 'food' },
  { key: 'fries', catKey: 'sides', sku: 'FOOD-040', name: 'French Fries', type: 'food', price: '4.99', cost: '1.00', taxType: 'food' },
  { key: 'onion_rings', catKey: 'sides', sku: 'FOOD-041', name: 'Onion Rings', type: 'food', price: '5.99', cost: '1.50', taxType: 'food' },
  { key: 'side_salad', catKey: 'sides', sku: 'FOOD-042', name: 'House Side Salad', type: 'food', price: '5.99', cost: '1.50', taxType: 'food' },
  { key: 'cheesecake', catKey: 'desserts', sku: 'FOOD-050', name: 'NY Cheesecake', type: 'food', price: '9.99', cost: '3.00', taxType: 'food' },
  { key: 'brownie', catKey: 'desserts', sku: 'FOOD-051', name: 'Chocolate Brownie Sundae', type: 'food', price: '8.99', cost: '2.50', taxType: 'food' },
  // ── Bar ──
  { key: 'margarita', catKey: 'cocktails', sku: 'BAR-010', name: 'Classic Margarita', type: 'beverage', price: '12.99', cost: '3.50', taxType: 'alcohol' },
  { key: 'mojito', catKey: 'cocktails', sku: 'BAR-011', name: 'Mojito', type: 'beverage', price: '13.99', cost: '3.50', taxType: 'alcohol' },
  { key: 'old_fashioned', catKey: 'cocktails', sku: 'BAR-012', name: 'Old Fashioned', type: 'beverage', price: '14.99', cost: '4.00', taxType: 'alcohol' },
  { key: 'house_wine', catKey: 'wine', sku: 'BAR-020', name: 'House Wine (Glass)', type: 'beverage', price: '10.99', cost: '3.00', taxType: 'alcohol' },
  { key: 'premium_wine', catKey: 'wine', sku: 'BAR-021', name: 'Premium Wine (Glass)', type: 'beverage', price: '16.99', cost: '5.00', taxType: 'alcohol' },
  { key: 'wine_bottle', catKey: 'wine', sku: 'BAR-022', name: 'Wine Bottle (House Selection)', type: 'beverage', price: '39.99', cost: '14.00', taxType: 'alcohol' },
  { key: 'well_spirit', catKey: 'spirits', sku: 'BAR-030', name: 'Well Spirit', type: 'beverage', price: '8.99', cost: '2.00', taxType: 'alcohol' },
  { key: 'premium_spirit', catKey: 'spirits', sku: 'BAR-031', name: 'Premium Spirit', type: 'beverage', price: '14.99', cost: '4.50', taxType: 'alcohol' },
  // ── Snack Bar ──
  { key: 'trail_mix', catKey: 'snack_bar', sku: 'SNK-001', name: 'Trail Mix', type: 'food', price: '3.99', cost: '1.00', taxType: 'food' },
  { key: 'energy_bar', catKey: 'snack_bar', sku: 'SNK-002', name: 'Energy Bar', type: 'food', price: '2.99', cost: '0.80', taxType: 'food' },
  { key: 'water_bottle', catKey: 'snack_bar', sku: 'SNK-003', name: 'Bottled Water', type: 'beverage', price: '2.49', cost: '0.30', taxType: 'exempt' },
  { key: 'sports_drink', catKey: 'snack_bar', sku: 'SNK-004', name: 'Sports Drink', type: 'beverage', price: '3.49', cost: '0.75', taxType: 'food' },
  // ── Pro Shop ──
  { key: 'mens_polo', catKey: 'mens_apparel', sku: 'APP-M01', name: "Men's Performance Polo", type: 'retail', price: '69.99', cost: '28.00', taxType: 'retail', trackable: true },
  { key: 'mens_shorts', catKey: 'mens_apparel', sku: 'APP-M02', name: "Men's Golf Shorts", type: 'retail', price: '59.99', cost: '22.00', taxType: 'retail', trackable: true },
  { key: 'mens_pullover', catKey: 'mens_apparel', sku: 'APP-M03', name: "Men's Quarter-Zip Pullover", type: 'retail', price: '89.99', cost: '35.00', taxType: 'retail', trackable: true },
  { key: 'womens_polo', catKey: 'womens_apparel', sku: 'APP-W01', name: "Women's Performance Polo", type: 'retail', price: '64.99', cost: '26.00', taxType: 'retail', trackable: true },
  { key: 'womens_skort', catKey: 'womens_apparel', sku: 'APP-W02', name: "Women's Golf Skort", type: 'retail', price: '69.99', cost: '28.00', taxType: 'retail', trackable: true },
  { key: 'womens_vest', catKey: 'womens_apparel', sku: 'APP-W03', name: "Women's Quilted Vest", type: 'retail', price: '79.99', cost: '32.00', taxType: 'retail', trackable: true },
  { key: 'visor', catKey: 'headwear', sku: 'HAT-001', name: 'Logo Visor', type: 'retail', price: '24.99', cost: '8.00', taxType: 'retail', trackable: true },
  { key: 'cap', catKey: 'headwear', sku: 'HAT-002', name: 'Logo Golf Cap', type: 'retail', price: '29.99', cost: '10.00', taxType: 'retail', trackable: true },
  { key: 'bucket_hat', catKey: 'headwear', sku: 'HAT-003', name: 'Bucket Hat (UV Protection)', type: 'retail', price: '34.99', cost: '12.00', taxType: 'retail', trackable: true },
  { key: 'driver', catKey: 'clubs', sku: 'CLB-001', name: 'TaylorMade Qi35 Driver', type: 'retail', price: '599.99', cost: '380.00', taxType: 'retail', trackable: true },
  { key: 'putter', catKey: 'clubs', sku: 'CLB-002', name: 'Odyssey White Hot Putter', type: 'retail', price: '249.99', cost: '160.00', taxType: 'retail', trackable: true },
  { key: 'wedge', catKey: 'clubs', sku: 'CLB-003', name: 'Callaway Jaws Wedge', type: 'retail', price: '179.99', cost: '110.00', taxType: 'retail', trackable: true },
  { key: 'bag', catKey: 'accessories', sku: 'ACC-001', name: 'Stand Bag', type: 'retail', price: '199.99', cost: '90.00', taxType: 'retail', trackable: true },
  { key: 'rangefinder', catKey: 'accessories', sku: 'ACC-002', name: 'Bushnell Rangefinder', type: 'retail', price: '299.99', cost: '180.00', taxType: 'retail', trackable: true },
  { key: 'umbrella', catKey: 'accessories', sku: 'ACC-003', name: 'Logo Golf Umbrella', type: 'retail', price: '39.99', cost: '12.00', taxType: 'retail', trackable: true },
  { key: 'tees_pack', catKey: 'accessories', sku: 'ACC-004', name: 'Wooden Tees (50 pack)', type: 'retail', price: '4.99', cost: '1.00', taxType: 'retail' },
  { key: 'divot_tool', catKey: 'accessories', sku: 'ACC-005', name: 'Logo Divot Tool & Ball Marker', type: 'retail', price: '14.99', cost: '4.00', taxType: 'retail' },
  { key: 'towel', catKey: 'accessories', sku: 'ACC-006', name: 'Microfiber Golf Towel', type: 'retail', price: '19.99', cost: '5.00', taxType: 'retail', trackable: true },
  { key: 'golf_shoes', catKey: 'footwear', sku: 'SHO-001', name: 'Nike Air Max 90 Golf Shoes', type: 'retail', price: '159.99', cost: '80.00', taxType: 'retail', trackable: true },
  { key: 'sandals', catKey: 'footwear', sku: 'SHO-002', name: 'After-Round Slide Sandals', type: 'retail', price: '34.99', cost: '10.00', taxType: 'retail', trackable: true },
  // ── Golf Operations ──
  { key: 'twilight_18', catKey: 'green_fees_dept', sku: 'GF-TWI', name: 'Twilight 18 Holes', type: 'green_fee', price: '55.00', cost: '0', taxType: 'exempt' },
  { key: 'junior_9', catKey: 'green_fees_dept', sku: 'GF-JR9', name: 'Junior 9 Holes', type: 'green_fee', price: '25.00', cost: '0', taxType: 'exempt' },
  { key: 'replay_rate', catKey: 'green_fees_dept', sku: 'GF-RPL', name: 'Replay Rate (Same Day)', type: 'green_fee', price: '35.00', cost: '0', taxType: 'exempt' },
  { key: 'lesson_30', catKey: 'lessons', sku: 'LES-030', name: '30-Min Private Lesson', type: 'service', price: '75.00', cost: '0', taxType: 'exempt' },
  { key: 'lesson_60', catKey: 'lessons', sku: 'LES-060', name: '60-Min Private Lesson', type: 'service', price: '125.00', cost: '0', taxType: 'exempt' },
  { key: 'group_clinic', catKey: 'lessons', sku: 'LES-GRP', name: 'Group Clinic (per person)', type: 'service', price: '45.00', cost: '0', taxType: 'exempt' },
  { key: 'club_rental', catKey: 'rentals', sku: 'RNT-CLB', name: 'Club Rental Set', type: 'rental', price: '55.00', cost: '0', taxType: 'exempt' },
  { key: 'push_cart', catKey: 'rentals', sku: 'RNT-PSH', name: 'Push Cart Rental', type: 'rental', price: '10.00', cost: '0', taxType: 'exempt' },
  { key: 'range_small', catKey: 'range', sku: 'RNG-SM', name: 'Range Bucket (Small)', type: 'service', price: '8.00', cost: '1.00', taxType: 'exempt' },
  { key: 'range_large', catKey: 'range', sku: 'RNG-LG', name: 'Range Bucket (Large)', type: 'service', price: '14.00', cost: '2.00', taxType: 'exempt' },
  // ── Spa & Wellness ──
  { key: 'swedish_massage', catKey: 'massages', sku: 'SPA-001', name: 'Swedish Massage (60 min)', type: 'service', price: '120.00', cost: '0', taxType: 'exempt' },
  { key: 'deep_tissue', catKey: 'massages', sku: 'SPA-002', name: 'Deep Tissue Massage (60 min)', type: 'service', price: '140.00', cost: '0', taxType: 'exempt' },
  { key: 'couples_massage', catKey: 'massages', sku: 'SPA-003', name: 'Couples Massage (60 min)', type: 'service', price: '250.00', cost: '0', taxType: 'exempt' },
  { key: 'facial_basic', catKey: 'facials', sku: 'SPA-010', name: 'Classic Facial', type: 'service', price: '95.00', cost: '0', taxType: 'exempt' },
  { key: 'facial_anti_aging', catKey: 'facials', sku: 'SPA-011', name: 'Anti-Aging Facial', type: 'service', price: '135.00', cost: '0', taxType: 'exempt' },
  { key: 'day_pass', catKey: 'fitness', sku: 'FIT-001', name: 'Fitness Center Day Pass', type: 'service', price: '15.00', cost: '0', taxType: 'exempt' },
  // ── Activities ──
  { key: 'kayak', catKey: 'water_sports', sku: 'ACT-001', name: 'Kayak Rental (1 hr)', type: 'rental', price: '35.00', cost: '0', taxType: 'exempt' },
  { key: 'paddleboard', catKey: 'water_sports', sku: 'ACT-002', name: 'Paddleboard Rental (1 hr)', type: 'rental', price: '30.00', cost: '0', taxType: 'exempt' },
  { key: 'kids_half', catKey: 'kids_club', sku: 'ACT-010', name: "Kids' Club (Half Day)", type: 'service', price: '40.00', cost: '0', taxType: 'exempt' },
  { key: 'kids_full', catKey: 'kids_club', sku: 'ACT-011', name: "Kids' Club (Full Day)", type: 'service', price: '65.00', cost: '0', taxType: 'exempt' },
  { key: 'event_room_sm', catKey: 'event_space', sku: 'EVT-001', name: 'Event Room (Small, 4 hr)', type: 'service', price: '500.00', cost: '0', taxType: 'exempt' },
  { key: 'event_room_lg', catKey: 'event_space', sku: 'EVT-002', name: 'Event Room (Large, 4 hr)', type: 'service', price: '1200.00', cost: '0', taxType: 'exempt' },
];

// New modifier groups
interface ModGroupDef { key: string; name: string; selType: string; req: boolean; min: number; max: number; mods: Array<{ name: string; price: string }> }
const NEW_MOD_GROUPS: ModGroupDef[] = [
  { key: 'steak_temp', name: 'Steak Temperature', selType: 'single', req: true, min: 1, max: 1, mods: [
    { name: 'Rare', price: '0' }, { name: 'Medium Rare', price: '0' }, { name: 'Medium', price: '0' },
    { name: 'Medium Well', price: '0' }, { name: 'Well Done', price: '0' },
  ]},
  { key: 'steak_sides', name: 'Steak Side', selType: 'single', req: true, min: 1, max: 1, mods: [
    { name: 'Baked Potato', price: '0' }, { name: 'Mashed Potatoes', price: '0' },
    { name: 'Seasonal Vegetables', price: '0' }, { name: 'Caesar Salad', price: '2.00' },
    { name: 'Upgrade to Lobster Tail', price: '18.00' },
  ]},
  { key: 'protein_add', name: 'Add Protein', selType: 'single', req: false, min: 0, max: 1, mods: [
    { name: 'Grilled Chicken', price: '5.00' }, { name: 'Shrimp (6 pc)', price: '8.00' },
    { name: 'Salmon Fillet', price: '10.00' },
  ]},
  { key: 'wing_sauce', name: 'Wing Sauce', selType: 'single', req: true, min: 1, max: 1, mods: [
    { name: 'Buffalo', price: '0' }, { name: 'BBQ', price: '0' }, { name: 'Garlic Parmesan', price: '0' },
    { name: 'Honey Sriracha', price: '0' }, { name: 'Lemon Pepper (Dry)', price: '0' },
  ]},
  { key: 'wine_pour', name: 'Wine Pour Size', selType: 'single', req: true, min: 1, max: 1, mods: [
    { name: '5 oz Pour', price: '0' }, { name: '8 oz Pour', price: '4.00' },
  ]},
  { key: 'cocktail_mods', name: 'Cocktail Options', selType: 'multiple', req: false, min: 0, max: 3, mods: [
    { name: 'Extra Shot', price: '3.00' }, { name: 'Top Shelf Upgrade', price: '5.00' },
    { name: 'Salt Rim', price: '0' }, { name: 'Sugar Rim', price: '0' },
  ]},
  { key: 'massage_add', name: 'Massage Add-Ons', selType: 'multiple', req: false, min: 0, max: 3, mods: [
    { name: 'Hot Stones', price: '25.00' }, { name: 'Aromatherapy', price: '15.00' },
    { name: 'CBD Oil Upgrade', price: '20.00' }, { name: 'Extended 30 min', price: '60.00' },
  ]},
  { key: 'lesson_focus', name: 'Lesson Focus Area', selType: 'single', req: false, min: 0, max: 1, mods: [
    { name: 'Full Swing', price: '0' }, { name: 'Short Game', price: '0' },
    { name: 'Putting', price: '0' }, { name: 'Course Management', price: '0' },
  ]},
];

// Item→ModGroup links
const ITEM_MOD_LINKS: Array<{ itemKey: string; modKey: string }> = [
  { itemKey: 'steak', modKey: 'steak_temp' },
  { itemKey: 'steak', modKey: 'steak_sides' },
  { itemKey: 'wings', modKey: 'wing_sauce' },
  { itemKey: 'side_salad', modKey: 'protein_add' },
  { itemKey: 'margarita', modKey: 'cocktail_mods' },
  { itemKey: 'mojito', modKey: 'cocktail_mods' },
  { itemKey: 'old_fashioned', modKey: 'cocktail_mods' },
  { itemKey: 'house_wine', modKey: 'wine_pour' },
  { itemKey: 'premium_wine', modKey: 'wine_pour' },
  { itemKey: 'swedish_massage', modKey: 'massage_add' },
  { itemKey: 'deep_tissue', modKey: 'massage_add' },
  { itemKey: 'lesson_30', modKey: 'lesson_focus' },
  { itemKey: 'lesson_60', modKey: 'lesson_focus' },
];

// ── NEW MEMBERSHIP PLANS ─────────────────────────────────────
const NEW_PLANS = [
  { key: 'platinum', name: 'Platinum Membership', desc: 'All-inclusive VIP membership with unlimited golf', interval: 'monthly' as const, priceCents: 49900, privs: { discount_percentage: 20, free_range_balls: true, guest_passes: 4, unlimited_golf: true, spa_discount: 15 } },
  { key: 'social', name: 'Social Membership', desc: 'Dining and social privileges — no golf', interval: 'monthly' as const, priceCents: 9900, privs: { discount_percentage: 10, dining_only: true } },
  { key: 'junior', name: 'Junior Membership', desc: 'Golf membership for players under 30', interval: 'monthly' as const, priceCents: 7900, privs: { discount_percentage: 15, free_range_balls: true, age_limit: 30 } },
  { key: 'corporate', name: 'Corporate Membership', desc: 'Multi-user corporate account', interval: 'monthly' as const, priceCents: 99900, privs: { discount_percentage: 20, free_range_balls: true, guest_passes: 10, max_authorized_users: 5 } },
];

// ── NEW RATE PLANS ───────────────────────────────────────────
const NEW_RATE_PLANS = [
  { code: 'WEEKEND', name: 'Weekend Getaway', desc: 'Friday-Sunday premium with late checkout' },
  { code: 'ROMANCE', name: 'Romance Package', desc: 'Room + champagne + couples massage' },
  { code: 'FAMILY', name: 'Family Fun', desc: 'Room + kids club + breakfast included' },
  { code: 'LONG_STAY', name: 'Extended Stay (7+ nights)', desc: '20% off rack for stays of 7+ nights' },
  { code: 'MILITARY', name: 'Military/First Responder', desc: '15% off rack with valid ID' },
  { code: 'SEASONAL', name: 'Peak Season Premium', desc: 'Summer premium rate — May through August' },
];

// ══════════════════════════════════════════════════════════════
// ══ MAIN ═════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
async function seedComprehensive() {
  const connectionString = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_ADMIN or DATABASE_URL environment variable is required');

  const target = isRemote ? 'REMOTE' : 'LOCAL';
  const masked = connectionString.replace(/:[^:@]+@/, ':***@');
  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`══ Comprehensive Additive Seed ══════════════════════`);
  console.log(`══════════════════════════════════════════════════════`);
  console.log(`Target: ${target} (${masked})`);
  console.log(`Mode: ADDITIVE ONLY — no deletes, truncates, or drops\n`);

  const client = postgres(connectionString, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    // ══════════════════════════════════════════════════════════
    // ══ 1. QUERY EXISTING DATA ═══════════════════════════════
    // ══════════════════════════════════════════════════════════
    console.log('── 1. Querying existing data...');

    const [tenant] = await db.select().from(tenants).limit(1);
    if (!tenant) throw new Error('No tenant found. Run pnpm db:seed first.');
    const tenantId = tenant.id;
    console.log(`  Tenant: ${tenant.name} (${tenantId})`);

    const allLocs = await db.execute(sql`
      SELECT id, name, location_type FROM locations WHERE tenant_id = ${tenantId} ORDER BY name
    `) as Array<{ id: string; name: string; location_type: string | null }>;
    const venues = allLocs.filter(l => l.location_type === 'venue');
    const locs = venues.length >= 2 ? venues : allLocs;
    if (locs.length < 2) throw new Error('Need at least 2 locations.');
    const locationIds = locs.map(l => l.id);
    console.log(`  Locations: ${locs.map(l => l.name).join(', ')}`);

    const userRows = await db.execute(sql`
      SELECT id FROM users WHERE tenant_id = ${tenantId} LIMIT 1
    `) as Array<{ id: string }>;
    if (userRows.length === 0) throw new Error('No user found.');
    const userId = userRows[0]!.id;

    const terminalRows = await db.execute(sql`
      SELECT id, location_id FROM terminals WHERE tenant_id = ${tenantId} LIMIT 10
    `) as Array<{ id: string; location_id: string }>;
    const terminalForLoc: Record<string, string | null> = {};
    for (const loc of locationIds) {
      terminalForLoc[loc] = terminalRows.find(t => t.location_id === loc)?.id ?? null;
    }

    // Get existing customers
    const existingCusts = await db.execute(sql`
      SELECT id FROM customers WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string }>;
    console.log(`  Existing customers: ${existingCusts.length}`);

    // Get existing catalog items
    const existingItems = await db.execute(sql`
      SELECT id, name, sku, item_type, default_price, category_id
      FROM catalog_items WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; name: string; sku: string | null; item_type: string | null; default_price: string | null; category_id: string | null }>;
    console.log(`  Existing catalog items: ${existingItems.length}`);

    // Get existing categories
    const existingCats = await db.execute(sql`
      SELECT id, name, parent_id FROM catalog_categories WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; name: string; parent_id: string | null }>;
    console.log(`  Existing categories: ${existingCats.length}`);

    // Get existing PMS property
    const propRows = await db.execute(sql`
      SELECT id FROM pms_properties WHERE tenant_id = ${tenantId} LIMIT 1
    `) as Array<{ id: string }>;
    const propertyId = propRows[0]?.id;
    console.log(`  PMS property: ${propertyId ? 'found' : 'NOT FOUND — skipping PMS'}`);

    // Get existing room types
    const rtRows = propertyId ? await db.execute(sql`
      SELECT id, code FROM pms_room_types WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; code: string }> : [];
    const roomTypeByCode: Record<string, string> = {};
    for (const rt of rtRows) roomTypeByCode[rt.code] = rt.id;
    console.log(`  Room types: ${rtRows.length}`);

    // Get existing rooms
    const roomRows = propertyId ? await db.execute(sql`
      SELECT id, room_number, room_type_id FROM pms_rooms WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; room_number: string; room_type_id: string }> : [];
    const roomByNumber: Record<string, { id: string; typeId: string }> = {};
    for (const r of roomRows) roomByNumber[r.room_number] = { id: r.id, typeId: r.room_type_id };
    console.log(`  Rooms: ${roomRows.length}`);

    // Get existing rate plans
    const existingRPRows = propertyId ? await db.execute(sql`
      SELECT id, code FROM pms_rate_plans WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; code: string }> : [];
    const existingRatePlanCodes = new Set(existingRPRows.map(r => r.code));
    const ratePlanIdByCode: Record<string, string> = {};
    for (const rp of existingRPRows) ratePlanIdByCode[rp.code] = rp.id;

    // Get existing billing accounts
    const existingBillingRows = await db.execute(sql`
      SELECT id, primary_customer_id FROM billing_accounts WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; primary_customer_id: string }>;

    // ══════════════════════════════════════════════════════════
    // ══ 2. CATALOG: HIERARCHICAL CATEGORIES + NEW ITEMS ══════
    // ══════════════════════════════════════════════════════════
    console.log('\n── 2. Adding catalog hierarchy + items...');

    const catIdMap: Record<string, string> = {};
    const catInserts: Array<Record<string, unknown>> = [];

    // Build hierarchical categories
    let globalSort = 100; // start above existing categories
    for (const dept of CATALOG_HIERARCHY) {
      const deptId = generateUlid();
      catIdMap[dept.key] = deptId;
      catInserts.push({ id: deptId, tenantId, name: dept.name, sortOrder: globalSort++, parentId: null });

      for (const sub of dept.children) {
        const subId = generateUlid();
        catIdMap[sub.key] = subId;
        catInserts.push({ id: subId, tenantId, name: sub.name, sortOrder: globalSort++, parentId: deptId });

        if (sub.children) {
          for (const leaf of sub.children) {
            const leafId = generateUlid();
            catIdMap[leaf.key] = leafId;
            catInserts.push({ id: leafId, tenantId, name: leaf.name, sortOrder: globalSort++, parentId: subId });
          }
        }
      }
    }

    // Insert categories in batches
    for (let i = 0; i < catInserts.length; i += BATCH) {
      await db.insert(catalogCategories).values(catInserts.slice(i, i + BATCH) as any);
    }
    console.log(`  Categories: ${catInserts.length} new hierarchical categories added`);

    // Build tax type map
    const taxRateForType = (t: string) => {
      if (t === 'retail') return RETAIL_TAX_RATE;
      if (t === 'food') return FOOD_TAX_RATE;
      if (t === 'alcohol') return ALCOHOL_TAX_RATE;
      return 0;
    };

    // Get existing tax categories for item assignment
    const taxCatRows = await db.execute(sql`
      SELECT id, name FROM tax_categories WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; name: string }>;
    const taxCatByName: Record<string, string> = {};
    for (const tc of taxCatRows) {
      const lower = tc.name.toLowerCase();
      if (lower.includes('sales')) taxCatByName['retail'] = tc.id;
      if (lower.includes('food') || lower.includes('prepared')) taxCatByName['food'] = tc.id;
      if (lower.includes('alcohol')) taxCatByName['alcohol'] = tc.id;
      if (lower.includes('exempt')) taxCatByName['exempt'] = tc.id;
    }

    // Insert new items
    const newItemIdMap: Record<string, string> = {};
    const itemInserts: Array<Record<string, unknown>> = [];

    for (const item of NEW_ITEMS) {
      const catId = catIdMap[item.catKey];
      if (!catId) { console.warn(`  WARN: category key ${item.catKey} not found, skipping ${item.sku}`); continue; }
      const itemId = generateUlid();
      newItemIdMap[item.key] = itemId;
      itemInserts.push({
        id: itemId,
        tenantId,
        categoryId: catId,
        sku: item.sku,
        name: item.name,
        description: item.desc ?? null,
        itemType: item.type,
        defaultPrice: item.price,
        cost: item.cost,
        taxCategoryId: taxCatByName[item.taxType] ?? null,
        isTrackable: item.trackable ?? false,
        barcode: item.barcode ?? null,
        createdBy: userId,
      });
    }

    for (let i = 0; i < itemInserts.length; i += BATCH) {
      await db.insert(catalogItems).values(itemInserts.slice(i, i + BATCH) as any);
    }
    console.log(`  Items: ${itemInserts.length} new items added`);

    // Insert modifier groups + modifiers + links
    const modGroupIdMap: Record<string, string> = {};
    for (const mg of NEW_MOD_GROUPS) {
      const mgId = generateUlid();
      modGroupIdMap[mg.key] = mgId;
      await db.insert(catalogModifierGroups).values({
        id: mgId,
        tenantId,
        name: mg.name,
        selectionType: mg.selType,
        isRequired: mg.req,
        minSelections: mg.min,
        maxSelections: mg.max,
      } as any);

      const modInserts = mg.mods.map((m, idx) => ({
        tenantId,
        modifierGroupId: mgId,
        name: m.name,
        priceAdjustment: m.price,
        sortOrder: idx + 1,
      }));
      await db.insert(catalogModifiers).values(modInserts as any);
    }
    console.log(`  Modifier Groups: ${NEW_MOD_GROUPS.length} new groups`);

    // Link items to modifier groups
    const linkInserts: Array<{ catalogItemId: string; modifierGroupId: string }> = [];
    for (const link of ITEM_MOD_LINKS) {
      const itemId = newItemIdMap[link.itemKey];
      const mgId = modGroupIdMap[link.modKey];
      if (itemId && mgId) linkInserts.push({ catalogItemId: itemId, modifierGroupId: mgId });
    }
    if (linkInserts.length > 0) {
      await db.insert(catalogItemModifierGroups).values(linkInserts as any);
    }
    console.log(`  Item-Modifier links: ${linkInserts.length}`);

    // Insert inventory items for trackable new items
    const trackableNew = NEW_ITEMS.filter(i => i.trackable);
    const invInserts: Array<Record<string, unknown>> = [];
    for (const item of trackableNew) {
      const catItemId = newItemIdMap[item.key];
      if (!catItemId) continue;
      for (const loc of locationIds) {
        invInserts.push({
          tenantId,
          locationId: loc,
          catalogItemId: catItemId,
          name: item.name,
          itemType: item.type,
          trackInventory: true,
          reorderPoint: String(randInt(3, 10)),
          reorderQuantity: String(randInt(10, 30)),
        });
      }
    }
    if (invInserts.length > 0) {
      for (let i = 0; i < invInserts.length; i += BATCH) {
        await db.insert(inventoryItems).values(invInserts.slice(i, i + BATCH) as any);
      }
    }
    console.log(`  Inventory items: ${invInserts.length} new (${trackableNew.length} items × ${locationIds.length} locations)`);

    // ══════════════════════════════════════════════════════════
    // ══ 3. CUSTOMERS (96 new) ════════════════════════════════
    // ══════════════════════════════════════════════════════════
    console.log('\n── 3. Adding customers...');

    const newCustIds: string[] = [];
    const custInserts: Array<Record<string, unknown>> = [];
    const contactInserts: Array<Record<string, unknown>> = [];
    const prefInserts: Array<Record<string, unknown>> = [];
    const identInserts: Array<Record<string, unknown>> = [];
    const authInserts: Array<Record<string, unknown>> = [];
    const activityInserts: Array<Record<string, unknown>> = [];

    const portalPasswordHash = '$2a$12$Y8t.gvYUXTSSakAeeeDG2ujzHJms6Kp.JyG/BGlQzWNnpNCNk7ei2'; // member123

    for (let i = 0; i < NEW_CUSTOMER_COUNT; i++) {
      const custId = generateUlid();
      newCustIds.push(custId);

      const isMale = rand() < 0.5;
      const firstName = isMale ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F);
      const lastName = pick(LAST_NAMES);
      const isOrg = i >= 90; // last 6 are organizations
      const areaCode = pick(AREA_CODES);
      const phone = `${areaCode}-555-${String(1000 + i).padStart(4, '0')}`;
      const emailDomain = pick(EMAIL_DOMAINS);
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/'/g, '')}${i}@${emailDomain}`;

      // Stagger creation dates over past 2 years
      const daysAgoCreated = randInt(1, 730);
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgoCreated);

      // Generate date of birth (ages 18-82)
      const age = randInt(18, 82);
      const dob = new Date();
      dob.setFullYear(dob.getFullYear() - age);
      dob.setMonth(randInt(0, 11));
      dob.setDate(randInt(1, 28));

      const gender = pick(GENDERS);
      const handicap = rand() < 0.6 ? (randBetween(2, 36)).toFixed(1) : null;
      const memberNumber = i < 50 ? `MEM-${String(100 + i).padStart(4, '0')}` : null;
      const loyaltyTier = pick(LOYALTY_TIERS);
      const loyaltyPoints = loyaltyTier ? randInt(100, 50000) : 0;
      const source = pick(ACQUISITION_SOURCES);

      if (isOrg) {
        const orgNames = ['Coastal Properties LLC','Blue Ridge Corp','Harbor Industries','Sunrise Ventures','Tech Solutions Inc','Palmetto Group'];
        const orgName = orgNames[i - 90] ?? `Company ${i}`;
        custInserts.push({
          id: custId, tenantId, type: 'organization',
          organizationName: orgName, displayName: orgName,
          email: `billing@${orgName.toLowerCase().replace(/[^a-z]/g, '')}.com`,
          phone, status: 'active', createdBy: userId, createdAt,
          acquisitionSource: 'corporate',
          loyaltyTier: null, loyaltyPointsBalance: 0,
        });
      } else {
        custInserts.push({
          id: custId, tenantId, type: 'person',
          firstName, lastName,
          displayName: `${firstName} ${lastName}`,
          email, phone, status: 'active',
          dateOfBirth: dob.toISOString().slice(0, 10),
          gender,
          handicapIndex: handicap,
          memberNumber,
          loyaltyTier,
          loyaltyPointsBalance: loyaltyPoints,
          acquisitionSource: source,
          notes: rand() < 0.3 ? pick([
            'Prefers early tee times', 'Regular Saturday player', 'Member referral from Johnson family',
            'Frequent diner at the grill', 'Joined after corporate outing', 'Snowbird — visits Nov-Mar',
            'Active tournament participant', 'Prefers quiet seating area', 'Birthday celebration regular',
            'Interested in golf lessons', 'Prefers cart path only', 'VIP — handles with care',
          ]) : null,
          createdBy: userId, createdAt,
        });
      }

      // Contacts
      contactInserts.push({ tenantId, customerId: custId, contactType: 'email', value: email, isPrimary: true, isVerified: rand() < 0.7 });
      contactInserts.push({ tenantId, customerId: custId, contactType: 'phone', value: phone, isPrimary: true, isVerified: rand() < 0.4 });
      if (rand() < 0.3 && !isOrg) {
        contactInserts.push({ tenantId, customerId: custId, contactType: 'phone', label: 'Home', value: `${areaCode}-555-${String(5000 + i).padStart(4, '0')}`, isPrimary: false, isVerified: false });
      }

      // Preferences (40% of customers)
      if (rand() < 0.4 && !isOrg) {
        const prefs = [
          { cat: 'golf', key: 'preferred_tee_time', val: pick(['7:00 AM','7:30 AM','8:00 AM','8:30 AM','9:00 AM','10:00 AM','2:00 PM']) },
          { cat: 'food_beverage', key: 'favorite_drink', val: pick(['Draft Beer','Margarita','Iced Tea','Water','Old Fashioned','House Wine','Bourbon']) },
          { cat: 'dietary', key: 'allergy', val: pick(['None','Gluten-free','Shellfish','Nuts','Dairy','Vegetarian','Vegan']) },
          { cat: 'golf', key: 'preferred_course', val: pick(['North Course','South Course','No preference']) },
          { cat: 'communication', key: 'contact_preference', val: pick(['email','phone','text']) },
        ];
        const selectedPrefs = pickN(prefs, randInt(1, 3));
        for (const p of selectedPrefs) {
          prefInserts.push({ tenantId, customerId: custId, category: p.cat, key: p.key, value: p.val, source: 'manual', updatedBy: userId });
        }
      }

      // Identifiers (member cards, barcodes)
      if (memberNumber) {
        identInserts.push({ tenantId, customerId: custId, type: 'member_number', value: memberNumber, isActive: true });
      }
      if (rand() < 0.25) {
        identInserts.push({ tenantId, customerId: custId, type: 'barcode', value: `978${String(randInt(1000000, 9999999))}${String(randInt(100, 999))}`, isActive: true });
      }

      // Portal auth accounts (35% of customers)
      if (rand() < 0.35) {
        authInserts.push({ tenantId, customerId: custId, provider: 'portal', passwordHash: portalPasswordHash, isActive: true });
      }

      // Activity log
      activityInserts.push({ tenantId, customerId: custId, activityType: 'system', title: 'Customer created', createdBy: userId, createdAt });
    }

    // Batch insert customers
    for (let i = 0; i < custInserts.length; i += BATCH) {
      await db.insert(customers).values(custInserts.slice(i, i + BATCH) as any);
    }
    console.log(`  Customers: ${custInserts.length} new`);

    for (let i = 0; i < contactInserts.length; i += BATCH) {
      await db.insert(customerContacts).values(contactInserts.slice(i, i + BATCH) as any);
    }
    console.log(`  Contacts: ${contactInserts.length}`);

    if (prefInserts.length > 0) {
      for (let i = 0; i < prefInserts.length; i += BATCH) {
        await db.insert(customerPreferences).values(prefInserts.slice(i, i + BATCH) as any);
      }
    }
    console.log(`  Preferences: ${prefInserts.length}`);

    if (identInserts.length > 0) {
      for (let i = 0; i < identInserts.length; i += BATCH) {
        await db.insert(customerIdentifiers).values(identInserts.slice(i, i + BATCH) as any);
      }
    }
    console.log(`  Identifiers: ${identInserts.length}`);

    if (authInserts.length > 0) {
      await db.insert(customerAuthAccounts).values(authInserts as any);
    }
    console.log(`  Auth accounts: ${authInserts.length}`);

    for (let i = 0; i < activityInserts.length; i += BATCH) {
      await db.insert(customerActivityLog).values(activityInserts.slice(i, i + BATCH) as any);
    }
    console.log(`  Activity log: ${activityInserts.length}`);

    // ══════════════════════════════════════════════════════════
    // ══ 4. MEMBERSHIPS & BILLING ═════════════════════════════
    // ══════════════════════════════════════════════════════════
    console.log('\n── 4. Adding membership plans & billing...');

    // Add new plans
    const newPlanIds: Record<string, string> = {};
    for (const plan of NEW_PLANS) {
      const planId = generateUlid();
      newPlanIds[plan.key] = planId;
      await db.insert(membershipPlans).values({
        id: planId,
        tenantId,
        name: plan.name,
        description: plan.desc,
        billingInterval: plan.interval,
        priceCents: plan.priceCents,
        privileges: plan.privs,
        isActive: true,
      } as any);
    }
    console.log(`  Plans: ${NEW_PLANS.length} new plans added`);

    // Create billing accounts & memberships for ~35% of new customers
    const memberCandidates = newCustIds.filter((_, idx) => idx < 90); // persons only
    const memberCount = Math.floor(memberCandidates.length * 0.35);
    const memberCusts = pickN(memberCandidates, memberCount);

    // Get all plan IDs (existing + new)
    const allPlanRows = await db.execute(sql`
      SELECT id, name FROM membership_plans WHERE tenant_id = ${tenantId}
    `) as Array<{ id: string; name: string }>;
    const allPlanIds = allPlanRows.map(p => p.id);

    const billingInserts: Array<Record<string, unknown>> = [];
    const billingMemberInserts: Array<Record<string, unknown>> = [];
    const membershipInserts: Array<Record<string, unknown>> = [];
    const newBillingIds: string[] = [];

    for (const custId of memberCusts) {
      const billingId = generateUlid();
      newBillingIds.push(billingId);
      const creditLimit = pick([250000, 500000, 1000000, 2000000, 5000000]);
      const balance = randInt(0, Math.floor(creditLimit * 0.3));

      billingInserts.push({
        id: billingId, tenantId, primaryCustomerId: custId,
        name: `Account ${billingId.slice(-6)}`,
        creditLimitCents: creditLimit,
        currentBalanceCents: balance,
        status: 'active',
      });

      billingMemberInserts.push({
        tenantId, billingAccountId: billingId, customerId: custId,
        role: 'owner', chargeAllowed: true,
      });

      // Random plan assignment
      const planId = pick(allPlanIds);
      const startMonthsAgo = randInt(1, 18);
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - startMonthsAgo);
      const renewalDate = new Date(startDate);
      renewalDate.setFullYear(renewalDate.getFullYear() + 1);

      const status = rand() < 0.85 ? 'active' : pick(['paused','canceled']);

      membershipInserts.push({
        tenantId, customerId: custId, planId,
        billingAccountId: billingId,
        status,
        startDate: startDate.toISOString().slice(0, 10),
        renewalDate: renewalDate.toISOString().slice(0, 10),
        endDate: status === 'canceled' ? dateStr(-randInt(1, 60)) : null,
      });
    }

    // Also add some corporate billing + authorized users
    const orgCusts = newCustIds.slice(90); // organizations
    for (const custId of orgCusts) {
      const billingId = generateUlid();
      newBillingIds.push(billingId);
      billingInserts.push({
        id: billingId, tenantId, primaryCustomerId: custId,
        name: `Corporate Account ${billingId.slice(-6)}`,
        creditLimitCents: pick([5000000, 10000000, 20000000]),
        currentBalanceCents: randInt(0, 500000),
        status: 'active',
        accountType: 'house_account',
      });
      billingMemberInserts.push({
        tenantId, billingAccountId: billingId, customerId: custId,
        role: 'owner', chargeAllowed: true,
      });
      // Add 1-3 authorized users from other customers
      const authUsers = pickN(newCustIds.slice(0, 90), randInt(1, 3));
      for (const authUser of authUsers) {
        billingMemberInserts.push({
          tenantId, billingAccountId: billingId, customerId: authUser,
          role: 'authorized_user', chargeAllowed: true,
          spendingLimitCents: pick([50000, 100000, 250000]),
        });
      }
      // Corporate membership
      if (newPlanIds['corporate']) {
        membershipInserts.push({
          tenantId, customerId: custId, planId: newPlanIds['corporate'],
          billingAccountId: billingId,
          status: 'active',
          startDate: dateStr(-randInt(30, 365)),
          renewalDate: dateStr(randInt(30, 365)),
        });
      }
    }

    for (let i = 0; i < billingInserts.length; i += BATCH) {
      await db.insert(billingAccounts).values(billingInserts.slice(i, i + BATCH) as any);
    }
    for (let i = 0; i < billingMemberInserts.length; i += BATCH) {
      await db.insert(billingAccountMembers).values(billingMemberInserts.slice(i, i + BATCH) as any);
    }
    for (let i = 0; i < membershipInserts.length; i += BATCH) {
      await db.insert(customerMemberships).values(membershipInserts.slice(i, i + BATCH) as any);
    }
    console.log(`  Billing accounts: ${billingInserts.length}`);
    console.log(`  Billing members: ${billingMemberInserts.length}`);
    console.log(`  Memberships: ${membershipInserts.length}`);

    // ══════════════════════════════════════════════════════════
    // ══ 5. TRANSACTIONS (366 days, ~$1M) ═════════════════════
    // ══════════════════════════════════════════════════════════
    console.log('\n── 5. Generating transactions (366 days)...');

    // Build orderable items pool from ALL items (existing + new)
    const allItemRows = await db.execute(sql`
      SELECT ci.id, ci.name, ci.sku, ci.item_type, ci.default_price, ci.category_id,
             cc.parent_id as cat_parent_id, cc.name as cat_name
      FROM catalog_items ci
      LEFT JOIN catalog_categories cc ON ci.category_id = cc.id
      WHERE ci.tenant_id = ${tenantId} AND ci.archived_at IS NULL
    `) as Array<{
      id: string; name: string; sku: string | null; item_type: string | null;
      default_price: string | null; category_id: string | null;
      cat_parent_id: string | null; cat_name: string | null;
    }>;

    const orderableItems = allItemRows.map(item => {
      const priceCents = Math.round(parseFloat(item.default_price ?? '0') * 100);
      const subDeptId = item.cat_parent_id ?? item.category_id ?? null;
      const t = item.item_type ?? 'retail';
      return {
        id: item.id, name: item.name, sku: item.sku ?? 'ITEM', type: t,
        priceCents, taxRate: taxRateForType(t === 'food' || t === 'beverage' ? t : t === 'retail' ? 'retail' : 'exempt'),
        catName: item.cat_name ?? 'General', catId: subDeptId,
      };
    }).filter(i => i.priceCents > 0 && i.priceCents < 100000); // exclude event rooms etc

    console.log(`  Orderable items: ${orderableItems.length}`);

    // Build order templates from available items by type
    const foodBevItems = orderableItems.filter(i => i.type === 'food' || i.type === 'beverage');
    const retailProShopItems = orderableItems.filter(i => i.type === 'retail');
    const golfFeeItems = orderableItems.filter(i => i.type === 'green_fee');
    const rentalServiceItems = orderableItems.filter(i => i.type === 'rental' || i.type === 'service');

    type OrderTemplate = { items: Array<{ item: typeof orderableItems[0]; qty: number }>; weight: number };
    const orderTemplates: OrderTemplate[] = [];

    // Golf + cart + food combos (most common, highest value)
    for (let i = 0; i < Math.min(3, golfFeeItems.length); i++) {
      const gf = golfFeeItems[i]!;
      const cart = rentalServiceItems.find(r => r.name.toLowerCase().includes('cart') && r.priceCents < 3000);
      if (cart && foodBevItems.length >= 2) {
        orderTemplates.push({ items: [{ item: gf, qty: 1 }, { item: cart, qty: 1 }, { item: pick(foodBevItems), qty: 1 }, { item: pick(foodBevItems), qty: 2 }], weight: 6 });
      }
      if (cart) {
        orderTemplates.push({ items: [{ item: gf, qty: 1 }, { item: cart, qty: 1 }], weight: 4 });
      }
      orderTemplates.push({ items: [{ item: gf, qty: 1 }], weight: 2 });
    }

    // Foursome combos
    if (golfFeeItems.length > 0 && foodBevItems.length > 0) {
      const gf = golfFeeItems[0]!;
      const cart = rentalServiceItems.find(r => r.name.toLowerCase().includes('cart') && r.priceCents < 3000);
      if (cart) {
        orderTemplates.push({ items: [{ item: gf, qty: 2 }, { item: cart, qty: 2 }, { item: pick(foodBevItems), qty: 4 }], weight: 3 });
        orderTemplates.push({ items: [{ item: gf, qty: 4 }, { item: cart, qty: 2 }], weight: 2 });
      }
    }

    // F&B only combos
    for (let i = 0; i < Math.min(5, foodBevItems.length); i++) {
      const f = foodBevItems[i]!;
      orderTemplates.push({ items: [{ item: f, qty: 1 }], weight: 1 });
    }
    if (foodBevItems.length >= 3) {
      orderTemplates.push({ items: [{ item: foodBevItems[0]!, qty: 1 }, { item: foodBevItems[1]!, qty: 1 }, { item: foodBevItems[2]!, qty: 2 }], weight: 3 });
      orderTemplates.push({ items: [{ item: pick(foodBevItems), qty: 2 }, { item: pick(foodBevItems), qty: 2 }], weight: 2 });
    }

    // Retail combos
    for (let i = 0; i < Math.min(4, retailProShopItems.length); i++) {
      orderTemplates.push({ items: [{ item: retailProShopItems[i]!, qty: 1 }], weight: 1 });
    }
    if (retailProShopItems.length >= 2) {
      orderTemplates.push({ items: [{ item: retailProShopItems[0]!, qty: 1 }, { item: retailProShopItems[1]!, qty: 1 }], weight: 2 });
    }

    // Big day: golf + retail + food
    if (golfFeeItems.length > 0 && retailProShopItems.length > 0 && foodBevItems.length >= 2) {
      orderTemplates.push({ items: [
        { item: golfFeeItems[0]!, qty: 1 },
        { item: pick(retailProShopItems), qty: 1 },
        { item: pick(foodBevItems), qty: 2 },
        { item: pick(foodBevItems), qty: 3 },
      ], weight: 2 });
    }

    // Services
    for (const svc of rentalServiceItems.filter(s => s.priceCents >= 5000)) {
      orderTemplates.push({ items: [{ item: svc, qty: 1 }], weight: 1 });
    }

    // Build weighted array
    const weightedTemplates: OrderTemplate[] = [];
    for (const t of orderTemplates) {
      for (let w = 0; w < t.weight; w++) weightedTemplates.push(t);
    }

    // Compute avg order value
    let templateTotal = 0;
    for (const t of weightedTemplates) {
      for (const li of t.items) templateTotal += li.item.priceCents * li.qty;
    }
    const avgOrderCents = Math.round(templateTotal / weightedTemplates.length);
    console.log(`  Order templates: ${orderTemplates.length} combos, avg $${(avgOrderCents / 100).toFixed(2)}`);

    // Get existing order counters
    const existingCounters = await db.select().from(orderCounters).where(eq(orderCounters.tenantId, tenantId));
    const orderNumberCounters: Record<string, number> = {};
    for (const loc of locationIds) {
      const counterRow = existingCounters.find(c => c.locationId === loc);
      const [maxRow] = await db.execute(sql`
        SELECT MAX(CAST(REPLACE(order_number, 'ORD-', '') AS INTEGER)) as max_num
        FROM orders WHERE tenant_id = ${tenantId} AND location_id = ${loc}
      `) as Array<{ max_num: number | null }>;
      const fromCounter = counterRow ? counterRow.lastNumber : 0;
      const fromOrders = maxRow?.max_num ?? 0;
      orderNumberCounters[loc] = Math.max(fromCounter, fromOrders);
    }

    // All customer IDs for assignment
    const allCustIds = [...existingCusts.map(c => c.id), ...newCustIds];
    const custIdPoolWithNulls = [...allCustIds, null, null, null]; // 75% chance of assignment when triggered

    // Generation accumulators
    const allOrderInserts: Array<Record<string, unknown>> = [];
    const allLineInserts: Array<Record<string, unknown>> = [];
    const allTaxInserts: Array<Record<string, unknown>> = [];
    const allTenderInserts: Array<Record<string, unknown>> = [];

    const dailyAgg: Record<string, {
      orderCount: number; grossSales: number; taxTotal: number; netSales: number;
      discountTotal: number; tenderCash: number; tenderCard: number;
      voidCount: number; voidTotal: number; locationId: string;
    }> = {};
    const itemAgg: Record<string, {
      catalogItemId: string; catalogItemName: string; categoryName: string;
      quantitySold: number; grossRevenue: number; locationId: string;
    }> = {};

    let totalRevenueCents = 0;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - DAYS_BACK);

    for (let dayOffset = 0; dayOffset < DAYS_BACK; dayOffset++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + dayOffset);
      const bd = bizDate(currentDate);
      const month = currentDate.getMonth();
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      const season = getSeason(month);
      const baseRevenue = SEASON_BASE[season]!;
      const weekendMult = isWeekend ? 1.45 : 1.0;
      const noise = randBetween(0.7, 1.3);
      const isTournament = TOURNAMENT_DAYS.has(dayOffset);
      const tournamentMult = isTournament ? randBetween(3.5, 5.0) : 1.0;

      let dailyTargetDollars = baseRevenue * weekendMult * noise * tournamentMult;
      dailyTargetDollars = Math.max(1500, Math.min(25000, dailyTargetDollars));
      const dailyTargetCents = Math.round(dailyTargetDollars * 100);
      const ordersThisDay = Math.max(5, Math.min(200, Math.ceil(dailyTargetCents / avgOrderCents)));

      for (let orderIdx = 0; orderIdx < ordersThisDay; orderIdx++) {
        const isMain = rand() < 0.70;
        const locId = isMain ? locationIds[0]! : locationIds[1]!;
        const termId = terminalForLoc[locId] ?? null;

        const template = weightedTemplates[Math.floor(rand() * weightedTemplates.length)]!;
        const isVoided = rand() < VOID_RATE;
        const custId = rand() < CUSTOMER_ASSIGN_RATE
          ? custIdPoolWithNulls[Math.floor(rand() * custIdPoolWithNulls.length)] ?? null
          : null;

        orderNumberCounters[locId]!++;
        const orderNum = `ORD-${String(orderNumberCounters[locId]).padStart(5, '0')}`;
        const orderId = generateUlid();
        const hourOfDay = 7 + Math.floor(rand() * 13);
        const ts = pastTimestamp(currentDate, hourOfDay);

        let orderSubtotal = 0;
        let orderTaxTotal = 0;
        let sortOrder = 0;

        for (const lineSpec of template.items) {
          const item = lineSpec.item;
          const lineId = generateUlid();
          const lineSubtotal = item.priceCents * lineSpec.qty;
          const lineTax = Math.round(lineSubtotal * item.taxRate);
          const lineTotal = lineSubtotal + lineTax;
          orderSubtotal += lineSubtotal;
          orderTaxTotal += lineTax;

          allLineInserts.push({
            id: lineId, tenantId, locationId: locId, orderId, sortOrder: sortOrder++,
            catalogItemId: item.id, catalogItemName: item.name, catalogItemSku: item.sku,
            itemType: item.type, qty: String(lineSpec.qty), unitPrice: item.priceCents,
            lineSubtotal, lineTax, lineTotal,
            subDepartmentId: item.catId, taxGroupId: null, createdAt: ts,
          });

          if (item.taxRate > 0) {
            allTaxInserts.push({
              tenantId, orderLineId: lineId,
              taxName: item.type === 'retail' ? 'Retail Sales Tax' : item.type === 'beverage' ? 'Alcohol Tax' : 'Food & Bev Tax',
              rateDecimal: item.taxRate.toFixed(4), amount: lineTax,
            });
          }

          const itemAggKey = `${bd}|${locId}|${item.id}`;
          if (!itemAgg[itemAggKey]) {
            itemAgg[itemAggKey] = { catalogItemId: item.id, catalogItemName: item.name, categoryName: item.catName, quantitySold: 0, grossRevenue: 0, locationId: locId };
          }
          if (!isVoided) {
            itemAgg[itemAggKey]!.quantitySold += lineSpec.qty;
            itemAgg[itemAggKey]!.grossRevenue += lineSubtotal / 100;
          }
        }

        const orderTotal = orderSubtotal + orderTaxTotal;
        const status = isVoided ? 'voided' : 'paid';

        allOrderInserts.push({
          id: orderId, tenantId, locationId: locId, orderNumber: orderNum,
          status, source: 'pos', version: 1, customerId: custId,
          subtotal: orderSubtotal, taxTotal: orderTaxTotal, discountTotal: 0,
          serviceChargeTotal: 0, roundingAdjustment: 0, total: orderTotal,
          taxExempt: false, businessDate: bd, terminalId: termId,
          employeeId: userId, createdBy: userId, updatedBy: userId,
          placedAt: ts,
          paidAt: isVoided ? null : new Date(ts.getTime() + 120_000),
          voidedAt: isVoided ? new Date(ts.getTime() + 300_000) : null,
          voidReason: isVoided ? pick(['Customer changed their mind','Wrong item','Duplicate order','Price dispute']) : null,
          voidedBy: isVoided ? userId : null,
        });

        if (!isVoided) {
          const isCash = rand() < CASH_RATIO;
          const tipRate = isCash ? 0 : randBetween(0.15, 0.22);
          const tipAmount = isCash ? 0 : Math.round(orderTotal * tipRate);
          const tenderAmount = orderTotal + tipAmount;
          const amountGiven = isCash ? Math.ceil(orderTotal / 100) * 100 : tenderAmount;
          const changeGiven = isCash ? amountGiven - orderTotal : 0;

          allTenderInserts.push({
            id: generateUlid(), tenantId, locationId: locId, orderId,
            tenderType: isCash ? 'cash' : 'card', tenderSequence: 1,
            amount: orderTotal, tipAmount, changeGiven, amountGiven,
            currency: 'USD', status: 'captured', businessDate: bd,
            source: 'pos', employeeId: userId, terminalId: termId,
            createdBy: userId, createdAt: new Date(ts.getTime() + 120_000),
          });
          totalRevenueCents += orderTotal;
        }

        // Daily aggregation
        const dailyKey = `${bd}|${locId}`;
        if (!dailyAgg[dailyKey]) {
          dailyAgg[dailyKey] = { orderCount: 0, grossSales: 0, taxTotal: 0, netSales: 0, discountTotal: 0, tenderCash: 0, tenderCard: 0, voidCount: 0, voidTotal: 0, locationId: locId };
        }
        const day = dailyAgg[dailyKey]!;
        if (isVoided) {
          day.voidCount++;
          day.voidTotal += orderTotal / 100;
        } else {
          day.orderCount++;
          day.grossSales += orderSubtotal / 100;
          day.taxTotal += orderTaxTotal / 100;
          day.netSales += orderSubtotal / 100;
          const lastT = allTenderInserts[allTenderInserts.length - 1] as Record<string, unknown>;
          if (lastT && lastT.orderId === orderId) {
            if (lastT.tenderType === 'cash') day.tenderCash += (lastT.amount as number) / 100;
            else day.tenderCard += (lastT.amount as number) / 100;
          }
        }
      }

      if (dayOffset % 50 === 0 || dayOffset === DAYS_BACK - 1) {
        console.log(`  Day ${dayOffset + 1}/${DAYS_BACK}: ${allOrderInserts.length} orders, $${(totalRevenueCents / 100).toLocaleString()}`);
      }
    }

    console.log(`\n  Summary: ${allOrderInserts.length} orders, ${allLineInserts.length} lines, $${(totalRevenueCents / 100).toLocaleString()} revenue`);

    // Batch insert
    console.log('  Inserting orders...');
    for (let i = 0; i < allOrderInserts.length; i += BATCH) {
      await db.insert(orders).values(allOrderInserts.slice(i, i + BATCH) as any);
    }
    console.log('  Inserting lines...');
    for (let i = 0; i < allLineInserts.length; i += BATCH) {
      await db.insert(orderLines).values(allLineInserts.slice(i, i + BATCH) as any);
    }
    console.log('  Inserting taxes...');
    for (let i = 0; i < allTaxInserts.length; i += BATCH) {
      await db.insert(orderLineTaxes).values(allTaxInserts.slice(i, i + BATCH) as any);
    }
    console.log('  Inserting tenders...');
    for (let i = 0; i < allTenderInserts.length; i += BATCH) {
      await db.insert(tenders).values(allTenderInserts.slice(i, i + BATCH) as any);
    }

    // Update order counters
    console.log('  Updating order counters...');
    for (const [locId, lastNum] of Object.entries(orderNumberCounters)) {
      const existing = existingCounters.find(c => c.locationId === locId);
      if (existing) {
        await db.execute(sql`UPDATE order_counters SET last_number = ${lastNum} WHERE tenant_id = ${tenantId} AND location_id = ${locId}`);
      } else {
        await db.insert(orderCounters).values({ tenantId, locationId: locId, lastNumber: lastNum });
      }
    }

    // ══════════════════════════════════════════════════════════
    // ══ 6. READ MODELS (upsert) ══════════════════════════════
    // ══════════════════════════════════════════════════════════
    console.log('\n── 6. Upserting read models...');

    // Daily sales
    const dailySalesRows = Object.entries(dailyAgg).map(([key, agg]) => {
      const [bd2] = key.split('|');
      const avgOrderValue = agg.orderCount > 0 ? agg.netSales / agg.orderCount : 0;
      return { tenantId, locationId: agg.locationId, businessDate: bd2!, orderCount: agg.orderCount, grossSales: agg.grossSales.toFixed(4), discountTotal: agg.discountTotal.toFixed(4), taxTotal: agg.taxTotal.toFixed(4), netSales: agg.netSales.toFixed(4), tenderCash: agg.tenderCash.toFixed(4), tenderCard: agg.tenderCard.toFixed(4), voidCount: agg.voidCount, voidTotal: agg.voidTotal.toFixed(4), avgOrderValue: avgOrderValue.toFixed(4) };
    });

    for (const row of dailySalesRows) {
      await db.execute(sql`
        INSERT INTO rm_daily_sales (tenant_id, location_id, business_date, order_count, gross_sales, discount_total, tax_total, net_sales, tender_cash, tender_card, void_count, void_total, avg_order_value)
        VALUES (${row.tenantId}, ${row.locationId}, ${row.businessDate}, ${row.orderCount}, ${row.grossSales}, ${row.discountTotal}, ${row.taxTotal}, ${row.netSales}, ${row.tenderCash}, ${row.tenderCard}, ${row.voidCount}, ${row.voidTotal}, ${row.avgOrderValue})
        ON CONFLICT (tenant_id, location_id, business_date)
        DO UPDATE SET
          order_count = EXCLUDED.order_count,
          gross_sales = EXCLUDED.gross_sales,
          discount_total = EXCLUDED.discount_total,
          tax_total = EXCLUDED.tax_total,
          net_sales = EXCLUDED.net_sales,
          tender_cash = EXCLUDED.tender_cash,
          tender_card = EXCLUDED.tender_card,
          void_count = EXCLUDED.void_count,
          void_total = EXCLUDED.void_total,
          avg_order_value = EXCLUDED.avg_order_value
      `);
    }
    console.log(`  rm_daily_sales: ${dailySalesRows.length} rows`);

    // Item sales
    const itemSalesRows = Object.entries(itemAgg).filter(([, a]) => a.quantitySold > 0).map(([key, agg]) => {
      const [bd2] = key.split('|');
      return { tenantId, locationId: agg.locationId, businessDate: bd2!, catalogItemId: agg.catalogItemId, catalogItemName: agg.catalogItemName, categoryName: agg.categoryName, quantitySold: agg.quantitySold, grossRevenue: agg.grossRevenue.toFixed(4) };
    });

    for (const row of itemSalesRows) {
      await db.execute(sql`
        INSERT INTO rm_item_sales (tenant_id, location_id, business_date, catalog_item_id, catalog_item_name, category_name, quantity_sold, gross_revenue)
        VALUES (${row.tenantId}, ${row.locationId}, ${row.businessDate}, ${row.catalogItemId}, ${row.catalogItemName}, ${row.categoryName}, ${row.quantitySold}, ${row.grossRevenue})
        ON CONFLICT (tenant_id, location_id, business_date, catalog_item_id)
        DO UPDATE SET
          catalog_item_name = EXCLUDED.catalog_item_name,
          category_name = EXCLUDED.category_name,
          quantity_sold = EXCLUDED.quantity_sold,
          gross_revenue = EXCLUDED.gross_revenue
      `);
    }
    console.log(`  rm_item_sales: ${itemSalesRows.length} rows`);

    // ══════════════════════════════════════════════════════════
    // ══ 7. PMS: RATE PLANS + GUESTS + RESERVATIONS ═══════════
    // ══════════════════════════════════════════════════════════
    if (propertyId) {
      console.log('\n── 7. Adding PMS data...');

      // ── New Rate Plans ──
      const newRPIds: Record<string, string> = {};
      const rpInserts: Array<Record<string, unknown>> = [];
      for (const rp of NEW_RATE_PLANS) {
        if (existingRatePlanCodes.has(rp.code)) continue;
        const rpId = generateUlid();
        newRPIds[rp.code] = rpId;
        ratePlanIdByCode[rp.code] = rpId;
        rpInserts.push({ id: rpId, tenantId, propertyId, code: rp.code, name: rp.name, description: rp.desc });
      }
      if (rpInserts.length > 0) {
        await db.insert(pmsRatePlans).values(rpInserts as any);
      }
      console.log(`  Rate plans: ${rpInserts.length} new`);

      // Rate plan prices for new plans
      const rackRates: Record<string, number> = {
        STD: 15900, DLX: 21900, OCS: 32900, FAM: 28900, PH: 59900,
      };
      const ratePriceInserts: Array<Record<string, unknown>> = [];
      const seasonStart2 = dateStr(-90);
      const seasonEnd2 = dateStr(365);

      for (const [code, rpId] of Object.entries(newRPIds)) {
        for (const [rtCode, rtId] of Object.entries(roomTypeByCode)) {
          const rack = rackRates[rtCode] ?? 15900;
          let nightlyRate = rack;
          if (code === 'WEEKEND') nightlyRate = Math.round(rack * 1.15);
          else if (code === 'ROMANCE') nightlyRate = Math.round(rack * 1.20);
          else if (code === 'FAMILY') nightlyRate = Math.round(rack * 1.05);
          else if (code === 'LONG_STAY') nightlyRate = Math.round(rack * 0.80);
          else if (code === 'MILITARY') nightlyRate = Math.round(rack * 0.85);
          else if (code === 'SEASONAL') nightlyRate = Math.round(rack * 1.25);

          ratePriceInserts.push({
            tenantId, ratePlanId: rpId, roomTypeId: rtId,
            startDate: seasonStart2, endDate: seasonEnd2, nightlyBaseCents: nightlyRate,
          });
        }
      }
      if (ratePriceInserts.length > 0) {
        for (let i = 0; i < ratePriceInserts.length; i += BATCH) {
          await db.insert(pmsRatePlanPrices).values(ratePriceInserts.slice(i, i + BATCH) as any);
        }
      }
      console.log(`  Rate prices: ${ratePriceInserts.length}`);

      // ── New Guests ──
      const newGuestIds: string[] = [];
      const guestInserts: Array<Record<string, unknown>> = [];

      for (let i = 0; i < NEW_GUEST_COUNT; i++) {
        const gid = generateUlid();
        newGuestIds.push(gid);
        const isMale = rand() < 0.5;
        const firstName = isMale ? pick(FIRST_NAMES_M) : pick(FIRST_NAMES_F);
        const lastName = pick(LAST_NAMES);
        const areaCode = pick(AREA_CODES);
        const isVip = rand() < 0.12;
        const stays = isVip ? randInt(3, 12) : randInt(0, 3);

        guestInserts.push({
          id: gid, tenantId, propertyId,
          firstName, lastName,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/'/g, '')}${100+i}@${pick(EMAIL_DOMAINS)}`,
          phone: `${areaCode}-555-${String(3000 + i).padStart(4, '0')}`,
          isVip,
          totalStays: stays,
          lastStayDate: stays > 0 ? dateStr(-randInt(1, 180)) : null,
          preferencesJson: isVip ? {
            preferred_floor: pick(['high', 'low', 'any']),
            pillow_type: pick(['firm', 'soft', 'hypoallergenic']),
            minibar: pick(['stock', 'remove_alcohol', 'empty']),
          } : {},
          // Link some guests to customers
          customerId: rand() < 0.3 && allCustIds.length > 0 ? pick(allCustIds) : null,
        });
      }

      for (let i = 0; i < guestInserts.length; i += BATCH) {
        await db.insert(pmsGuests).values(guestInserts.slice(i, i + BATCH) as any);
      }
      console.log(`  Guests: ${guestInserts.length} new`);

      // ── New Reservations ──
      const allGuestRows = await db.execute(sql`
        SELECT id FROM pms_guests WHERE tenant_id = ${tenantId}
      `) as Array<{ id: string }>;
      const allGuestIds = allGuestRows.map(g => g.id);

      const allRPIds = Object.values(ratePlanIdByCode);
      const allRoomNumbers = Object.keys(roomByNumber);
      const allRoomTypeIds = Object.values(roomTypeByCode);

      const resInserts: Array<Record<string, unknown>> = [];
      const folioInserts: Array<Record<string, unknown>> = [];
      const folioEntryInserts: Array<Record<string, unknown>> = [];

      const statuses = ['CONFIRMED','CONFIRMED','CONFIRMED','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW'];
      const sources = ['DIRECT','DIRECT','DIRECT','OTA','OTA','AGENT','CORPORATE'];

      // Spread reservations: -90 days to +270 days
      for (let i = 0; i < NEW_RESERVATION_COUNT; i++) {
        const resId = generateUlid();
        const guestId = pick(allGuestIds);
        const roomNumber = pick(allRoomNumbers);
        const room = roomByNumber[roomNumber]!;
        const ratePlanId = pick(allRPIds);
        const nights = pick([1,2,2,3,3,3,4,5,5,7,7,10,14]);
        const adults = pick([1,1,2,2,2,2,3,4]);
        const children = pick([0,0,0,0,0,1,1,2,3]);
        const source = pick(sources);

        // Determine check-in offset
        let checkInOffset: number;
        if (i < 10) checkInOffset = randInt(-90, -30); // past
        else if (i < 25) checkInOffset = randInt(-30, -1); // recent past
        else if (i < 35) checkInOffset = randInt(0, 3); // imminent
        else if (i < 55) checkInOffset = randInt(4, 30); // near future
        else if (i < 75) checkInOffset = randInt(31, 120); // medium future
        else checkInOffset = randInt(121, 270); // far future

        let status: string;
        if (checkInOffset < -nights) {
          // Already checked out or no-show
          status = rand() < 0.15 ? 'NO_SHOW' : (rand() < 0.1 ? 'CANCELLED' : 'CHECKED_OUT');
        } else if (checkInOffset < 0 && checkInOffset >= -nights) {
          // Currently in house
          status = 'CHECKED_IN';
        } else {
          // Future
          status = rand() < 0.08 ? 'CANCELLED' : 'CONFIRMED';
        }

        const nightlyRate = randInt(13000, 60000);
        const subtotal = nightlyRate * nights;
        const tax = Math.round(subtotal * 0.12);
        const total = subtotal + tax;
        const confNum = `SBG-${20260300 + i}`;

        const checkInDate = dateStr(checkInOffset);
        const checkOutDate = dateStr(checkInOffset + nights);

        resInserts.push({
          id: resId, tenantId, propertyId,
          guestId,
          primaryGuestJson: {},
          roomTypeId: room.typeId,
          roomId: room.id,
          ratePlanId,
          checkInDate, checkOutDate,
          status, sourceType: source,
          adults, children, nights,
          nightlyRateCents: nightlyRate,
          subtotalCents: subtotal,
          taxCents: tax,
          totalCents: total,
          confirmationNumber: confNum,
          internalNotes: rand() < 0.3 ? pick([
            'Guest requested late checkout','Anniversary trip','Corporate event attendee',
            'Loyalty member — complimentary upgrade','Early arrival requested',
            'Golf package includes 2 rounds','Special dietary needs noted',
            'Birthday celebration — arrange cake','Requires accessible room',
            'VIP — previous stays 5+, high spender','Group booking — 3 rooms total',
          ]) : null,
          checkedInAt: status === 'CHECKED_IN' || status === 'CHECKED_OUT'
            ? new Date(new Date(checkInDate).getTime() + 15 * 3600000) : null,
          checkedInBy: status === 'CHECKED_IN' || status === 'CHECKED_OUT' ? userId : null,
          checkedOutAt: status === 'CHECKED_OUT'
            ? new Date(new Date(checkOutDate).getTime() + 11 * 3600000) : null,
          checkedOutBy: status === 'CHECKED_OUT' ? userId : null,
          createdBy: userId,
        });

        // Create folios for checked-in and checked-out reservations
        if (status === 'CHECKED_IN' || status === 'CHECKED_OUT') {
          const folioId = generateUlid();
          const nightsCharged = status === 'CHECKED_OUT' ? nights : Math.max(1, -checkInOffset);
          const roomChargeTotal = nightlyRate * nightsCharged;
          const roomTax = Math.round(roomChargeTotal * 0.12);
          const incidentalAmount = randInt(0, 15000);
          const incidentalTax = Math.round(incidentalAmount * 0.12);
          const folioSubtotal = roomChargeTotal + incidentalAmount;
          const folioTax = roomTax + incidentalTax;
          const folioTotal = folioSubtotal + folioTax;
          const paymentsMade = status === 'CHECKED_OUT' ? folioTotal : 0;

          folioInserts.push({
            id: folioId, tenantId, propertyId,
            reservationId: resId, guestId,
            status: status === 'CHECKED_OUT' ? 'CLOSED' : 'OPEN',
            subtotalCents: folioSubtotal, taxCents: folioTax,
            totalCents: folioTotal, paymentCents: paymentsMade,
            balanceCents: folioTotal - paymentsMade,
            closedAt: status === 'CHECKED_OUT' ? new Date() : null,
            closedBy: status === 'CHECKED_OUT' ? userId : null,
            createdBy: userId,
          });

          // Room charge entries
          for (let n = 0; n < nightsCharged; n++) {
            folioEntryInserts.push({
              tenantId, folioId, entryType: 'ROOM_CHARGE',
              description: `Room ${roomNumber} — Night ${n + 1}`,
              amountCents: nightlyRate,
              businessDate: dateStr(checkInOffset + n),
            });
            folioEntryInserts.push({
              tenantId, folioId, entryType: 'TAX',
              description: `Room Tax — Night ${n + 1}`,
              amountCents: Math.round(nightlyRate * 0.12),
              businessDate: dateStr(checkInOffset + n),
            });
          }

          if (incidentalAmount > 0) {
            folioEntryInserts.push({
              tenantId, folioId, entryType: 'CHARGE',
              description: pick(['Room Service','Mini Bar','Spa Treatment','Restaurant Charge','Golf Shop Charge','Laundry Service']),
              amountCents: incidentalAmount,
              businessDate: dateStr(checkInOffset + Math.min(1, nightsCharged - 1)),
            });
          }

          if (status === 'CHECKED_OUT') {
            folioEntryInserts.push({
              tenantId, folioId, entryType: 'PAYMENT',
              description: `Credit Card Payment — ${pick(['Visa ****4242','MC ****5555','Amex ****1001','Visa ****9876'])}`,
              amountCents: -folioTotal,
              businessDate: dateStr(checkInOffset + nights),
            });
          }
        }
      }

      // Insert reservations
      for (let i = 0; i < resInserts.length; i += BATCH) {
        await db.insert(pmsReservations).values(resInserts.slice(i, i + BATCH) as any);
      }
      console.log(`  Reservations: ${resInserts.length} new`);

      // Insert folios
      if (folioInserts.length > 0) {
        for (let i = 0; i < folioInserts.length; i += BATCH) {
          await db.insert(pmsFolios).values(folioInserts.slice(i, i + BATCH) as any);
        }
        for (let i = 0; i < folioEntryInserts.length; i += BATCH) {
          await db.insert(pmsFolioEntries).values(folioEntryInserts.slice(i, i + BATCH) as any);
        }
      }
      console.log(`  Folios: ${folioInserts.length} with ${folioEntryInserts.length} entries`);
    }

    // ══════════════════════════════════════════════════════════
    // ══ 8. FINAL SUMMARY ════════════════════════════════════
    // ══════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════');
    console.log('══ COMPREHENSIVE SEED COMPLETE ══════════════════════');
    console.log('══════════════════════════════════════════════════════');
    console.log(`  Tenant: ${tenant.name}`);
    console.log(`  Mode: ADDITIVE ONLY (no deletes)`);
    console.log('');
    console.log('  ── Catalog ──');
    console.log(`  Categories: ${catInserts.length} new hierarchical`);
    console.log(`  Items: ${itemInserts.length} new`);
    console.log(`  Modifier Groups: ${NEW_MOD_GROUPS.length} new`);
    console.log(`  Inventory Items: ${invInserts.length} new`);
    console.log('');
    console.log('  ── Customers ──');
    console.log(`  Customers: ${custInserts.length} new (total ~${existingCusts.length + custInserts.length})`);
    console.log(`  Contacts: ${contactInserts.length}`);
    console.log(`  Preferences: ${prefInserts.length}`);
    console.log(`  Identifiers: ${identInserts.length}`);
    console.log(`  Auth Accounts: ${authInserts.length}`);
    console.log('');
    console.log('  ── Memberships & Billing ──');
    console.log(`  Plans: ${NEW_PLANS.length} new`);
    console.log(`  Billing Accounts: ${billingInserts.length} new`);
    console.log(`  Memberships: ${membershipInserts.length} new`);
    console.log('');
    console.log('  ── Transactions ──');
    console.log(`  Orders: ${allOrderInserts.length}`);
    console.log(`  Lines: ${allLineInserts.length}`);
    console.log(`  Tenders: ${allTenderInserts.length}`);
    console.log(`  Revenue: $${(totalRevenueCents / 100).toLocaleString()}`);
    console.log(`  Daily Sales RM: ${dailySalesRows.length} rows`);
    console.log(`  Item Sales RM: ${itemSalesRows.length} rows`);
    console.log('');
    if (propertyId) {
      console.log('  ── PMS ──');
      console.log(`  Rate Plans: 6 new (total ${Object.keys(ratePlanIdByCode).length})`);
      console.log(`  Guests: ${NEW_GUEST_COUNT} new`);
      console.log(`  Reservations: 80 new`);
      console.log(`  Folios: created with entries`);
    }
    console.log('══════════════════════════════════════════════════════\n');

  } finally {
    await client.end();
  }
}

seedComprehensive().catch((err) => {
  console.error('Comprehensive seed failed:', err);
  process.exit(1);
});
