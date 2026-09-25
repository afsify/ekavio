import type { NextFunction, Request, Response } from 'express';
import { getRuntimeConfig } from '../config/env.js';

export const createRequirePublicRegistrationAvailable = (
  nodeEnvironment: () => string,
) => (_request: Request, response: Response, next: NextFunction): void => {
  if (nodeEnvironment() === 'production') {
    response.status(404).json({ message: 'Public registration is unavailable' });
    return;
  }
  next();
};

export const requirePublicRegistrationAvailable = createRequirePublicRegistrationAvailable(
  () => getRuntimeConfig().nodeEnv,
);
