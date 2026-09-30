import { z } from 'zod';

export const createParentOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  consolidatedBilling: z.boolean().optional(),
}).strict();

export const linkCorporateChildSchema = z.object({
  parentId: z.uuid(),
  childOrgId: z.uuid(),
}).strict();

export const corporateParentIdSchema = z.uuid();
