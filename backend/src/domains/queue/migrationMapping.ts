import { promises as fs } from 'node:fs';
import { z } from 'zod';
import type { OperationalMigrationMapping } from './migrationTypes.js';

const objectId = z.string().regex(/^[0-9a-f]{24}$/);
const ianaTimezone = z.string().trim().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}, 'must be a valid IANA timezone');
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day;
}, 'must be a valid calendar date');
const session = z.object({
  localBusinessDate: localDate,
  laneKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  status: z.enum(['open', 'closed']),
});

const mappingSchema = z.object({
  version: z.literal(1),
  organizations: z.array(z.object({
    legacyOrganizationId: objectId,
    organizationId: z.uuid(),
    branchId: z.uuid(),
    timezone: ianaTimezone,
    defaultCallingCode: z.string().regex(/^\+?[1-9][0-9]{0,2}$/).optional(),
    defaultServiceDurationMinutes: z.number().int().positive().max(1440),
    customerGroups: z.record(z.string(), z.string().trim().min(1)).default({}),
    serviceResolutions: z.record(z.string(), z.string().trim().min(1)).default({}),
    sessionPolicy: z.object({
      mode: z.literal('created-at-local-date'),
      laneKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
      status: z.enum(['open', 'closed']),
    }),
    queueSessionOverrides: z.record(objectId, session).default({}),
  })).min(1),
}).superRefine((mapping, context) => {
  const ids = new Set<string>();
  const organizationIds = new Set<string>();
  for (const [index, organization] of mapping.organizations.entries()) {
    if (ids.has(organization.legacyOrganizationId)) {
      context.addIssue({
        code: 'custom', path: ['organizations', index, 'legacyOrganizationId'],
        message: 'Legacy organization mapping must be unique',
      });
    }
    ids.add(organization.legacyOrganizationId);
    if (organizationIds.has(organization.organizationId)) {
      context.addIssue({
        code: 'custom', path: ['organizations', index, 'organizationId'],
        message: 'Canonical organization mapping must be unique',
      });
    }
    organizationIds.add(organization.organizationId);
  }
});

export const parseOperationalMigrationMapping = (value: unknown): OperationalMigrationMapping =>
  mappingSchema.parse(value) as OperationalMigrationMapping;

export const loadOperationalMigrationMapping = async (filePath: string): Promise<OperationalMigrationMapping> =>
  parseOperationalMigrationMapping(JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown);
