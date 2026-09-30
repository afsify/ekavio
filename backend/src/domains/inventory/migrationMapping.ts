import { promises as fs } from 'node:fs';
import { z } from 'zod';
import { inventoryUnitCodes } from '../../schemas/inventorySchemas.js';
import type { InventoryMigrationMapping } from './migrationTypes.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/);

const mappingSchema = z.object({
  version: z.literal(1),
  organizations: z.array(z.object({
    legacyOrganizationId: objectId,
    organizationId: z.uuid(),
    branchResolutions: z.record(objectId, z.uuid()).default({}),
    unitResolutions: z.record(objectId, z.enum(inventoryUnitCodes)).default({}),
  }).strict()).default([]),
}).strict().superRefine((mapping, context) => {
  const legacyIds = new Set<string>();
  const organizationIds = new Set<string>();
  for (const [index, organization] of mapping.organizations.entries()) {
    if (legacyIds.has(organization.legacyOrganizationId)) {
      context.addIssue({
        code: 'custom', path: ['organizations', index, 'legacyOrganizationId'],
        message: 'Legacy organization mapping must be unique',
      });
    }
    legacyIds.add(organization.legacyOrganizationId);
    if (organizationIds.has(organization.organizationId)) {
      context.addIssue({
        code: 'custom', path: ['organizations', index, 'organizationId'],
        message: 'Canonical organization mapping must be unique',
      });
    }
    organizationIds.add(organization.organizationId);
  }
});

export const parseInventoryMigrationMapping = (value: unknown): InventoryMigrationMapping =>
  mappingSchema.parse(value) as InventoryMigrationMapping;

export const loadInventoryMigrationMapping = async (
  filePath: string,
): Promise<InventoryMigrationMapping> =>
  parseInventoryMigrationMapping(JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown);
