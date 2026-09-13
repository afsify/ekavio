import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { getRuntimeConfig } from '../config/env.js';
import type { MembershipRole } from '../models/Membership.js';
import {
  hasPermission,
  type Permission,
} from '../services/authorizationPolicy.js';
import {
  resolveAuthorizationContext,
  type AccessIdentityClaims,
  type AuthorizationContext,
  type ContextSelection,
} from '../services/requestContextService.js';
import { AppError } from '../utils/AppError.js';

export type AuthenticatedRequest = Request & {
  auth?: AuthorizationContext;
  user?: {
    id: string;
    tenantId: string;
    role: MembershipRole;
    sessionId: string;
  };
};

export interface AuthenticationDependencies {
  verifyAccessToken(token: string): AccessIdentityClaims;
  resolveContext(
    claims: AccessIdentityClaims,
    selection?: ContextSelection,
  ): Promise<AuthorizationContext>;
}

const readSelectionHeader = (
  request: Request,
  headerName: 'x-tenant-id' | 'x-branch-id',
): string | undefined => {
  const header = request.headers[headerName];
  if (Array.isArray(header)) {
    throw new AppError(`Invalid ${headerName} header`, 400);
  }

  const value = header?.trim();
  return value || undefined;
};

export const verifyAccessToken = (token: string): AccessIdentityClaims => {
  const decoded = jwt.verify(token, getRuntimeConfig().jwtSecret) as JwtPayload;
  if (
    typeof decoded.id !== 'string' ||
    typeof decoded.tenantId !== 'string' ||
    typeof decoded.sessionId !== 'string'
  ) {
    throw new AppError('Invalid access token claims', 401);
  }

  return {
    userId: decoded.id,
    defaultOrganizationId: decoded.tenantId,
    sessionId: decoded.sessionId,
  };
};

export const createAuthenticate = ({
  verifyAccessToken: verifyToken,
  resolveContext,
}: AuthenticationDependencies) => {
  return async (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        response.status(401).json({ message: 'Authentication required' });
        return;
      }

      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        response.status(401).json({ message: 'Token missing from header' });
        return;
      }

      const claims = verifyToken(token);
      const organizationId = readSelectionHeader(request, 'x-tenant-id');
      const branchId = readSelectionHeader(request, 'x-branch-id');
      const context = await resolveContext(claims, {
        ...(organizationId ? { organizationId } : {}),
        ...(branchId ? { branchId } : {}),
      });

      request.auth = context;
      request.user = {
        id: context.userId,
        tenantId: context.organizationId,
        role: context.role,
        sessionId: context.sessionId,
      };
      next();
    } catch (error: unknown) {
      if (error instanceof AppError) {
        response.status(error.statusCode).json({ message: error.message });
        return;
      }
      response.status(401).json({ message: 'Invalid or expired token' });
    }
  };
};

export const authenticate = createAuthenticate({
  verifyAccessToken,
  resolveContext: resolveAuthorizationContext,
});

export const requirePermission = (permission: Permission) => {
  return (
    request: AuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): void => {
    if (!request.auth || !hasPermission(request.auth.permissions, permission)) {
      response.status(403).json({ message: 'Insufficient permission' });
      return;
    }
    next();
  };
};

export const requirePlatformOperator = (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void => {
  if (!request.auth?.platformOperator) {
    response.status(403).json({ message: 'Platform operator access required' });
    return;
  }
  next();
};
