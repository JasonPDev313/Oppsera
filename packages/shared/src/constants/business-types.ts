/** Primary SMB business types shown directly on Step 1 */
export const SMB_BUSINESS_TYPES = [
  {
    key: 'retail',
    name: 'Retail Store',
    icon: 'ShoppingBag',
    description: 'Retail shops, boutiques, specialty stores',
    recommendedModules: ['catalog', 'orders', 'pos_retail', 'payments', 'inventory', 'customers', 'reporting'],
    starterHierarchy: [
      {
        department: 'Merchandise',
        subDepartments: [
          { name: 'General', categories: ['Featured', 'New Arrivals', 'Sale'] },
        ],
      },
    ],
  },
  {
    key: 'restaurant',
    name: 'Restaurant / Bar',
    icon: 'UtensilsCrossed',
    description: 'Restaurants, bars, cafes, food trucks',
    recommendedModules: ['catalog', 'orders', 'pos_retail', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting', 'room_layouts'],
    starterHierarchy: [
      {
        department: 'Food',
        subDepartments: [
          { name: 'Appetizers', categories: ['Starters', 'Soups', 'Salads'] },
          { name: 'Entrees', categories: ['Burgers', 'Sandwiches', 'Plates'] },
          { name: 'Desserts', categories: ['Desserts'] },
          { name: 'Sides', categories: ['Sides'] },
        ],
      },
      {
        department: 'Beverage',
        subDepartments: [
          { name: 'Non-Alcoholic', categories: ['Soft Drinks', 'Coffee & Tea', 'Juice'] },
          { name: 'Beer', categories: ['Draft Beer', 'Bottled Beer'] },
          { name: 'Wine', categories: ['Wine by Glass', 'Wine by Bottle'] },
          { name: 'Spirits', categories: ['Cocktails', 'Liquor'] },
        ],
      },
    ],
  },
  {
    key: 'hybrid',
    name: 'Multi-Purpose Venue',
    icon: 'Building2',
    description: 'Venues with mixed operations (restaurant + retail + services)',
    recommendedModules: ['catalog', 'orders', 'pos_retail', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting', 'room_layouts'],
    starterHierarchy: [
      {
        department: 'Retail',
        subDepartments: [
          { name: 'General', categories: ['Featured', 'New Arrivals'] },
        ],
      },
      {
        department: 'Food & Beverage',
        subDepartments: [
          { name: 'Food', categories: ['Entrees', 'Appetizers', 'Desserts'] },
          { name: 'Beverage', categories: ['Non-Alcoholic', 'Alcoholic'] },
        ],
      },
      {
        department: 'Services',
        subDepartments: [
          { name: 'General', categories: ['Services'] },
        ],
      },
    ],
  },
] as const;

/** Specialty business types shown when user picks "Other" */
export const OTHER_BUSINESS_TYPES = [
  {
    key: 'golf',
    name: 'Golf Course / Club',
    icon: 'Flag',
    description: 'Golf courses, country clubs, driving ranges',
    recommendedModules: ['catalog', 'orders', 'pos_retail', 'pos_fnb', 'payments', 'inventory', 'customers', 'reporting', 'room_layouts'],
    starterHierarchy: [
      {
        department: 'Pro Shop',
        subDepartments: [
          { name: 'Equipment', categories: ['Drivers', 'Irons', 'Putters', 'Wedges', 'Bags'] },
          { name: 'Apparel', categories: ['Mens', 'Womens', 'Headwear'] },
          { name: 'Accessories', categories: ['Gloves', 'Balls', 'Tees & Markers', 'Towels'] },
        ],
      },
      {
        department: 'Food & Beverage',
        subDepartments: [
          { name: 'Food', categories: ['Hot Food', 'Cold Food', 'Snacks'] },
          { name: 'Beverage', categories: ['Non-Alcoholic', 'Beer', 'Wine', 'Spirits'] },
        ],
      },
      {
        department: 'Green Fees',
        subDepartments: [
          { name: 'Rates', categories: ['Weekday', 'Weekend', 'Twilight', 'Junior/Senior'] },
        ],
      },
      {
        department: 'Rentals & Services',
        subDepartments: [
          { name: 'Rentals', categories: ['Cart Rental', 'Club Rental', 'Range'] },
          { name: 'Services', categories: ['Lessons', 'Fittings', 'Repairs'] },
        ],
      },
    ],
  },
] as const;

/** All business types combined — backward compatible export */
export const BUSINESS_TYPES = [...SMB_BUSINESS_TYPES, ...OTHER_BUSINESS_TYPES] as const;

export type BusinessTypeKey = (typeof BUSINESS_TYPES)[number]['key'];

export type BusinessTypeConfig = (typeof BUSINESS_TYPES)[number];
