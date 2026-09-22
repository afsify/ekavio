import type { Server as HTTPServer } from 'node:http';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import type { RuntimeConfig } from './env.js';
import {
  resolveAuthorizationContext,
  type AccessIdentityClaims,
  type AuthorizationContext,
  type ContextSelection,
} from '../services/requestContextService.js';

let io: SocketIOServer | undefined;

export interface RealtimeAuthorizationDependencies {
  verifyToken(token: string): AccessIdentityClaims;
  resolveContext(
    claims: AccessIdentityClaims,
    selection?: ContextSelection,
  ): Promise<AuthorizationContext>;
}

export const organizationRoom = (organizationId: string): string =>
  `organization:${organizationId}`;
export const branchRoom = (branchId: string): string => `branch:${branchId}`;
export const authorizationRooms = (context: AuthorizationContext): string[] => [
  organizationRoom(context.organizationId),
  ...(context.branchId ? [branchRoom(context.branchId)] : []),
];

export const isSocketOriginAllowed = (
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean => origin === undefined || allowedOrigins.includes(origin);

export const createRealtimeAuthorizer = ({
  verifyToken,
  resolveContext,
}: RealtimeAuthorizationDependencies) => {
  return async (input: {
    token?: unknown;
    organizationId?: unknown;
    branchId?: unknown;
  }): Promise<AuthorizationContext> => {
    if (typeof input.token !== 'string' || !input.token.trim()) {
      throw new Error('Authentication error: Token missing');
    }
    if (input.organizationId !== undefined && typeof input.organizationId !== 'string') {
      throw new Error('Authentication error: Invalid organization context');
    }
    if (input.branchId !== undefined && typeof input.branchId !== 'string') {
      throw new Error('Authentication error: Invalid branch context');
    }
    const claims = verifyToken(input.token);
    return resolveContext(claims, {
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.branchId ? { branchId: input.branchId } : {}),
    });
  };
};

export const setupSocket = (server: HTTPServer, config: RuntimeConfig): void => {
  io = new SocketIOServer(server, {
    cors: {
      origin: config.socketAllowedOrigins,
      methods: ['GET', 'POST'],
      credentials: false,
    },
    allowRequest: (request, callback) => {
      callback(null, isSocketOriginAllowed(request.headers.origin, config.socketAllowedOrigins));
    },
  });

  const authorizeRealtime = createRealtimeAuthorizer({
    verifyToken(token) {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      if (
        typeof decoded.id !== 'string' ||
        typeof decoded.tenantId !== 'string' ||
        typeof decoded.sessionId !== 'string'
      ) {
        throw new Error('Invalid access token claims');
      }
      return {
        userId: decoded.id,
        defaultOrganizationId: decoded.tenantId,
        sessionId: decoded.sessionId,
      };
    },
    resolveContext: resolveAuthorizationContext,
  });

  io.use(async (socket, next) => {
    try {
      const context = await authorizeRealtime({
        token: socket.handshake.auth?.token,
        organizationId: socket.handshake.auth?.organizationId,
        branchId: socket.handshake.auth?.branchId,
      });
      socket.data.authorization = context;
      next();
    } catch {
      next(new Error('Authentication error: Unauthorized context'));
    }
  });

  io.on('connection', (socket) => {
    const context = socket.data.authorization as AuthorizationContext | undefined;
    if (!context) {
      socket.disconnect(true);
      return;
    }

    void socket.join(authorizationRooms(context));
  });
};

export const closeSocket = async (): Promise<void> => {
  const activeServer = io;
  io = undefined;
  if (activeServer) await activeServer.close();
};

export const disconnectUserSockets = (userId: string): void => {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    const context = socket.data.authorization as AuthorizationContext | undefined;
    if (context?.userId === userId) socket.disconnect(true);
  }
};

export const disconnectSessionSockets = (sessionId: string): void => {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    const context = socket.data.authorization as AuthorizationContext | undefined;
    if (context?.sessionId === sessionId) socket.disconnect(true);
  }
};

export const emitToTenant = (tenantId: string, event: string, data: unknown): void => {
  if (io) io.to(organizationRoom(tenantId)).emit(event, data);
};

export const emitToBranch = (branchId: string, event: string, data: unknown): void => {
  if (io) io.to(branchRoom(branchId)).emit(event, data);
};
