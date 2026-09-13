import { z } from 'zod';

const requiredString = z.string({ error: 'is required' }).trim().min(1, 'is required');

const originListSchema = z
  .string({ error: 'is required' })
  .trim()
  .min(1, 'must contain at least one origin')
  .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
  .superRefine((origins, context) => {
    for (const origin of origins) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('unsupported protocol');
        }
      } catch {
        context.addIssue({
          code: 'custom',
          message: `contains invalid HTTP origin: ${origin}`,
        });
      }
    }
  });

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGO_URI: requiredString,
    JWT_SECRET: requiredString,
    REFRESH_TOKEN_SECRET: requiredString,
    HTTP_ALLOWED_ORIGINS: originListSchema,
    SOCKET_ALLOWED_ORIGINS: originListSchema,
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
  });

export interface RuntimeConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  mongoUri: string;
  jwtSecret: string;
  refreshTokenSecret: string;
  httpAllowedOrigins: string[];
  socketAllowedOrigins: string[];
}

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
    jwtSecret: result.data.JWT_SECRET,
    refreshTokenSecret: result.data.REFRESH_TOKEN_SECRET,
    httpAllowedOrigins: result.data.HTTP_ALLOWED_ORIGINS,
    socketAllowedOrigins: result.data.SOCKET_ALLOWED_ORIGINS,
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
