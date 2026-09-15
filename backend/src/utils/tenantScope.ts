import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import type { AuthorizationContext } from '../services/requestContextService.js';
import { AppError } from './AppError.js';

export const requireAuthorizationContext = (
  request: AuthenticatedRequest,
): AuthorizationContext => {
  if (!request.auth) {
    throw new AppError('Authorization context missing', 401);
  }
  return request.auth;
};
