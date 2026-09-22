import { z } from 'zod';

const requiredString = z.string({ error: 'is required' }).trim().min(1, 'is required');

const mongoUrlSchema = requiredString.superRefine((value, context) => {
  if (!/^mongodb(?:\+srv)?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value)) {
    context.addIssue({
      code: 'custom',
      message: 'must be a valid MongoDB connection URL',
    });
  }
});

const postgresUrlSchema = requiredString.superRefine((value, context) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    context.addIssue({
      code: 'custom',
      message: 'must be a valid PostgreSQL connection URL',
    });
  }
});

const originListSchema = z
  .string({ error: 'is required' })
  .trim()
  .min(1, 'must contain at least one origin')
  .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
  .superRefine((origins, context) => {
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (
          (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
          parsed.origin !== origin ||
          parsed.username ||
          parsed.password
        ) {
          throw new Error('unsupported protocol');
        }
      } catch {
        context.addIssue({
          code: 'custom',
          message: `contains invalid HTTP origin: ${origin}`,
        });
      }
    }
  })
  .transform((origins) => [...new Set(origins)]);

const hasPostgresTls = (value: string): boolean => {
  const parsed = new URL(value);
  const sslMode = parsed.searchParams.get('sslmode');
  const ssl = parsed.searchParams.get('ssl');
  return ['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '') ||
    ['true', '1'].includes(ssl?.toLowerCase() ?? '');
};

const hasMongoTls = (value: string): boolean => {
  if (value.toLowerCase().startsWith('mongodb+srv://')) return true;
  const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : '';
  const parameters = new URLSearchParams(query);
  const tls = parameters.get('tls') ?? parameters.get('ssl');
  return ['true', '1'].includes(tls?.toLowerCase() ?? '');
};

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGO_URI: mongoUrlSchema,
    DATABASE_URL: postgresUrlSchema,
    JWT_SECRET: requiredString,
    REFRESH_TOKEN_SECRET: requiredString,
    HTTP_ALLOWED_ORIGINS: originListSchema,
    SOCKET_ALLOWED_ORIGINS: originListSchema,
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).optional(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== 'production') {
      return;
    }

    if (environment.JWT_SECRET.length < 32) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'must contain at least 32 characters in production',
      });
    }

    if (environment.REFRESH_TOKEN_SECRET.length < 32) {
      context.addIssue({
        code: 'custom',
        path: ['REFRESH_TOKEN_SECRET'],
        message: 'must contain at least 32 characters in production',
      });
    }

    if (!hasPostgresTls(environment.DATABASE_URL)) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'must enable TLS in production (sslmode=require, verify-ca, or verify-full)',
      });
    }

    if (!hasMongoTls(environment.MONGO_URI)) {
      context.addIssue({
        code: 'custom',
        path: ['MONGO_URI'],
        message: 'must enable TLS in production (mongodb+srv or tls=true)',
      });
    }

    for (const field of ['HTTP_ALLOWED_ORIGINS', 'SOCKET_ALLOWED_ORIGINS'] as const) {
      for (const origin of environment[field]) {
        if (!origin.startsWith('https://')) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'must contain only HTTPS origins in production',
          });
        }
      }
    }

    if (environment.TRUST_PROXY_HOPS === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY_HOPS'],
        message: 'is required in production (use 0 for direct TLS or the reviewed proxy hop count)',
      });
    }
  });

export interface RuntimeConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  mongoUri: string;
  databaseUrl: string;
  jwtSecret: string;
  refreshTokenSecret: string;
  httpAllowedOrigins: string[];
  socketAllowedOrigins: string[];
  trustProxyHops: number;
}

export interface DatabaseConfig {
  databaseUrl: string;
}

export const loadDatabaseConfig = (environment: NodeJS.ProcessEnv): DatabaseConfig => {
  const result = z.object({ DATABASE_URL: postgresUrlSchema }).safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid database configuration: ${details}`);
  }
  return { databaseUrl: result.data.DATABASE_URL };
};

export const loadConfig = (environment: NodeJS.ProcessEnv): RuntimeConfig => {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    mongoUri: result.data.MONGO_URI,
    databaseUrl: result.data.DATABASE_URL,
    jwtSecret: result.data.JWT_SECRET,
    refreshTokenSecret: result.data.REFRESH_TOKEN_SECRET,
    httpAllowedOrigins: result.data.HTTP_ALLOWED_ORIGINS,
    socketAllowedOrigins: result.data.SOCKET_ALLOWED_ORIGINS,
    trustProxyHops: result.data.TRUST_PROXY_HOPS ?? 0,
  };
};

let runtimeConfig: RuntimeConfig | undefined;

export const initializeRuntimeConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeConfig => {
  runtimeConfig = loadConfig(environment);
  return runtimeConfig;
};

export const getRuntimeConfig = (): RuntimeConfig => {
  if (!runtimeConfig) {
    throw new Error('Runtime configuration has not been initialized');
  }

  return runtimeConfig;
};
