import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { generateUlid } from '@oppsera/shared';
import { tenants } from './core';

// ── Role Department Access (merged GF_RoleDepartment + GF_RoleSubDepartment) ──
export const roleDepartmentAccess = pgTable(
  'role_department_access',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roleId: text('role_id').notNull(),
    departmentId: text('department_id').notNull(),
    subDepartmentId: text('sub_department_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_role_dept_access_tenant_role').on(table.tenantId, table.roleId),
    uniqueIndex('uq_role_dept_access_tenant_role_dept_sub').on(
      table.tenantId,
      table.roleId,
      table.departmentId,
      table.subDepartmentId,
    ),
  ],
);

// ── Role Voucher Type Access (from GF_RoleClubVoucherType) ────────
export const roleVoucherTypeAccess = pgTable(
  'role_voucher_type_access',
  {
    id: text('id').primaryKey().$defaultFn(generateUlid),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    roleId: text('role_id').notNull(),
    voucherTypeId: text('voucher_type_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_role_voucher_type_access_tenant_role_voucher').on(
      table.tenantId,
      table.roleId,
      table.voucherTypeId,
    ),
  ],
);
