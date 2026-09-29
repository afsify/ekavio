import { promises as fs } from 'node:fs';
import { z } from 'zod';
import type { CustomerDuesMigrationMapping } from './migrationTypes.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/);

const mappingSchema = z.object({
  version: z.literal(1),
  organizations: z.array(z.object({
    legacyOrganizationId: objectId,
    organizationId: z.uuid(),
    customerResolutions: z.record(objectId, z.uuid()).default({}),
    branchResolutions: z.record(objectId, z.uuid()).default({}),
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

export const parseCustomerDuesMigrationMapping = (value: unknown): CustomerDuesMigrationMapping =>
  mappingSchema.parse(value) as CustomerDuesMigrationMapping;

export const loadCustomerDuesMigrationMapping = async (
  filePath: string,
): Promise<CustomerDuesMigrationMapping> =>
  parseCustomerDuesMigrationMapping(JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown);
