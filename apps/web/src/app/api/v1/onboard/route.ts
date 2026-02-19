import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  generateUlid,
  generateSlug,
  ValidationError,
  ConflictError,
  BUSINESS_TYPES,
} from '@oppsera/shared';
import type { BusinessTypeKey } from '@oppsera/shared';
import {
  db,
  tenants,
  locations,
  memberships,
  roles,
  rolePermissions,
  roleAssignments,
  entitlements,
  auditLog,
  catalogCategories,
  taxRates,
  taxGroups,
  taxGroupRates,
} from '@oppsera/db';
import type { Database } from '@oppsera/db';

const onboardSchema = z.object({
  businessType: z.enum(['restaurant', 'retail', 'golf', 'hybrid']),
  companyName: z.string().min(1).max(100),
  locationName: z.string().min(1).max(100),
  timezone: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().default('US'),
  modules: z.array(z.string()).min(1),
});

const SYSTEM_ROLES = [
  {
    name: 'Owner',
    description: 'Full access to all features',
    permissions: ['*'],
  },
  {
    name: 'Manager',
    description: 'Full operational control across all modules',
    permissions: [
      'catalog.*',
      'orders.*',
      'inventory.*',
      'customers.*',
      'tenders.*',
      'reports.view',
      'settings.view',
      'price.override',
      'charges.manage',
      'cash.drawer',
      'shift.manage',
      'discounts.apply',
      'returns.create',
    ],
  },
  {
    name: 'Supervisor',
    description: 'Manage orders and POS operations, view catalog and inventory',
    permissions: [
      'catalog.view',
      'orders.*',
      'inventory.view',
      'customers.view',
      'tenders.create',
      'tenders.view',
      'reports.view',
      'price.override',
      'charges.manage',
      'cash.drawer',
      'shift.manage',
      'discounts.apply',
      'returns.create',
    ],
  },
  {
    name: 'Cashier',
    description: 'Ring up sales, process payments, manage cash drawer',
    permissions: [
      'catalog.view',
      'orders.create',
      'orders.view',
      'tenders.create',
      'tenders.view',
      'customers.view',
      'customers.create',
      'discounts.apply',
      'cash.drawer',
      'shift.manage',
    ],
  },
  {
    name: 'Server',
    description: 'F&B order entry, process payments, manage tables',
    permissions: [
      'catalog.view',
      'orders.create',
      'orders.view',
      'tenders.create',
      'tenders.view',
      'customers.view',
      'discounts.apply',
      'cash.drawer',
      'shift.manage',
    ],
  },
  {
    name: 'Staff',
    description: 'View catalog and orders',
    permissions: ['catalog.view', 'orders.view'],
  },
] as const;

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = onboardSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const {
      businessType,
      companyName,
      locationName,
      timezone,
      address,
      city,
      state,
      zip,
      country,
      modules,
    } = parsed.data;

    const result = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;

      // 1. Check for duplicate membership
      const existingMembership = await txDb.query.memberships.findFirst({
        where: eq(memberships.userId, ctx.user.id),
      });

      if (existingMembership) {
        throw new ConflictError('You already belong to a tenant');
      }

      // 2. Generate unique slug
      let slug = generateSlug(companyName);
      const existingTenant = await txDb.query.tenants.findFirst({
        where: eq(tenants.slug, slug),
      });

      if (existingTenant) {
        slug = `${slug}-${generateUlid().slice(0, 8).toLowerCase()}`;
      }

      // 3. Create tenant
      const tenantId = generateUlid();
      await tx.insert(tenants).values({
        id: tenantId,
        name: companyName,
        slug,
        status: 'active',
      }).returning();

      // 4. Create location
      const locationId = generateUlid();
      await tx.insert(locations).values({
        id: locationId,
        tenantId,
        name: locationName,
        timezone,
        addressLine1: address,
        city,
        state,
        postalCode: zip,
        country,
        isActive: true,
      }).returning();

      // 5. Create membership
      await tx.insert(memberships).values({
        id: generateUlid(),
        tenantId,
        userId: ctx.user.id,
        status: 'active',
      }).returning();

      // 6. Create system roles with permissions
      let ownerRoleId = '';

      for (const roleDef of SYSTEM_ROLES) {
        const roleId = generateUlid();

        if (roleDef.name === 'Owner') {
          ownerRoleId = roleId;
        }

        await tx.insert(roles).values({
          id: roleId,
          tenantId,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
        }).returning();

        // Create role permissions
        for (const permission of roleDef.permissions) {
          await tx.insert(rolePermissions).values({
            id: generateUlid(),
            roleId,
            permission,
          }).returning();
        }
      }

      // 7. Assign Owner role to the creating user
      await tx.insert(roleAssignments).values({
        id: generateUlid(),
        tenantId,
        userId: ctx.user.id,
        roleId: ownerRoleId,
      }).returning();

      // 8. Create entitlements
      const moduleSet = new Set([...modules, 'platform_core']);

      for (const moduleKey of moduleSet) {
        await tx.insert(entitlements).values({
          id: generateUlid(),
          tenantId,
          moduleKey,
          planTier: 'free',
          isEnabled: true,
        }).returning();
      }

      // 9. Create starter tax rates
      const salesTaxId = generateUlid();
      const noTaxId = generateUlid();

      await tx.insert(taxRates).values({
        id: salesTaxId,
        tenantId,
        name: 'Sales Tax',
        rateDecimal: '0.0800',
        isActive: true,
      }).returning();

      await tx.insert(taxRates).values({
        id: noTaxId,
        tenantId,
        name: 'No Tax',
        rateDecimal: '0.0000',
        isActive: true,
      }).returning();

      // 10. Create default tax group
      const taxGroupId = generateUlid();

      await tx.insert(taxGroups).values({
        id: taxGroupId,
        tenantId,
        locationId,
        name: 'Standard',
        isActive: true,
      }).returning();

      await tx.insert(taxGroupRates).values({
        id: generateUlid(),
        tenantId,
        taxGroupId,
        taxRateId: salesTaxId,
        sortOrder: 0,
      }).returning();

      // 11. Create catalog hierarchy from business type
      const businessConfig = BUSINESS_TYPES.find(
        (bt) => bt.key === (businessType as BusinessTypeKey),
      );

      if (businessConfig) {
        const hierarchy = businessConfig.starterHierarchy as ReadonlyArray<{
          readonly department: string;
          readonly subDepartments: ReadonlyArray<{
            readonly name: string;
            readonly categories: ReadonlyArray<string>;
          }>;
        }>;

        for (let deptIdx = 0; deptIdx < hierarchy.length; deptIdx++) {
          const dept = hierarchy[deptIdx]!;

          const [deptRow] = await tx.insert(catalogCategories).values({
            id: generateUlid(),
            tenantId,
            parentId: null,
            name: dept.department,
            sortOrder: deptIdx,
          }).returning();

          for (let subIdx = 0; subIdx < dept.subDepartments.length; subIdx++) {
            const subDept = dept.subDepartments[subIdx]!;

            const [subDeptRow] = await tx.insert(catalogCategories).values({
              id: generateUlid(),
              tenantId,
              parentId: deptRow!.id,
              name: subDept.name,
              sortOrder: subIdx,
            }).returning();

            for (let catIdx = 0; catIdx < subDept.categories.length; catIdx++) {
              await tx.insert(catalogCategories).values({
                id: generateUlid(),
                tenantId,
                parentId: subDeptRow!.id,
                name: subDept.categories[catIdx]!,
                sortOrder: catIdx,
              }).returning();
            }
          }
        }
      }

      // 12. Audit log entry
      await tx.insert(auditLog).values({
        id: generateUlid(),
        tenantId,
        actorType: 'user',
        actorUserId: ctx.user.id,
        action: 'tenant.onboarded',
        entityType: 'tenant',
        entityId: tenantId,
        metadata: { businessType, locationId, modules },
        createdAt: new Date(),
      }).returning();

      return { tenantId, slug, locationId };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { authenticated: true, requireTenant: false },
);
