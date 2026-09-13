import type { CookieOptions, Request, Response } from 'express';
import type { RuntimeConfig } from '../config/env.js';
import { REFRESH_SESSION_MAX_AGE_MS } from '../services/sessionService.js';

export const REFRESH_COOKIE_NAME = 'ekavio_refresh';
export const REFRESH_COOKIE_PATH = '/api/auth';

const cookieOptions = (config: RuntimeConfig): CookieOptions => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: 'lax',
  path: REFRESH_COOKIE_PATH,
});

export const setRefreshCookie = (
  response: Response,
  refreshCredential: string,
  config: RuntimeConfig,
): void => {
  response.cookie(REFRESH_COOKIE_NAME, refreshCredential, {
    ...cookieOptions(config),
    maxAge: REFRESH_SESSION_MAX_AGE_MS,
  });
};

export const clearRefreshCookie = (response: Response, config: RuntimeConfig): void => {
  response.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(config));
};

export const readRefreshCookie = (request: Request): string | undefined => {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) {
      continue;
    }

    const name = part.slice(0, separator).trim();
    if (name === REFRESH_COOKIE_NAME) {
      const value = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
};
