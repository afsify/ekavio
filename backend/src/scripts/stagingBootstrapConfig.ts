import { z } from 'zod';
import { loadDatabaseConfig } from '../config/env.js';

const ianaTimezone = z.string().trim().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}, 'must be a valid IANA timezone');

const schema = z.object({
  STAGING_BOOTSTRAP_CONFIRM: z.literal('staging'),
  STAGING_BOOTSTRAP_PHONE: z.string().trim().min(1),
  STAGING_BOOTSTRAP_PASSWORD: z.string().min(12),
  STAGING_BOOTSTRAP_USER_NAME: z.string().trim().min(1),
  STAGING_BOOTSTRAP_ORGANIZATION_NAME: z.string().trim().min(1),
  STAGING_BOOTSTRAP_ORGANIZATION_TYPE: z.string().trim().min(1),
  STAGING_BOOTSTRAP_BRANCH_TIMEZONE: ianaTimezone,
});

export interface StagingBootstrapConfig {
  databaseUrl: string;
  phone: string;
  password: string;
  userName: string;
  organizationName: string;
  organizationType: string;
  branchTimezone: string;
}

export const loadStagingBootstrapConfig = (
  environment: NodeJS.ProcessEnv,
): StagingBootstrapConfig => {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Staging bootstrap refuses NODE_ENV=production');
  }
  const result = schema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid staging bootstrap configuration: ${details}`);
  }

  return {
    databaseUrl: loadDatabaseConfig(environment).databaseUrl,
    phone: result.data.STAGING_BOOTSTRAP_PHONE,
    password: result.data.STAGING_BOOTSTRAP_PASSWORD,
    userName: result.data.STAGING_BOOTSTRAP_USER_NAME,
    organizationName: result.data.STAGING_BOOTSTRAP_ORGANIZATION_NAME,
    organizationType: result.data.STAGING_BOOTSTRAP_ORGANIZATION_TYPE,
    branchTimezone: result.data.STAGING_BOOTSTRAP_BRANCH_TIMEZONE,
  };
};
