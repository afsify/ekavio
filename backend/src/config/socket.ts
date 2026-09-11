import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import jwt, { type JwtPayload } from 'jsonwebtoken';

let io: SocketIOServer;

export const setupSocket = (server: HTTPServer): void => {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*', // Adjust to specific origin in production
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    },
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'fallback_secret'
      ) as JwtPayload;

      // Attach tenantId to the socket object for later access
      socket.data.tenantId = decoded.tenantId;
      socket.data.userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const tenantId = socket.data.tenantId;

    if (tenantId) {
      // Join the room specific to the tenant
      socket.join(tenantId);
      console.log(`Socket ${socket.id} joined tenant room: ${tenantId}`);
    }

    socket.on('disconnect', () => {
      console.log(`Socket ${socket.id} disconnected`);
    });
  });
};

/**
 * Helper function to emit events to a specific tenant room
 */
export const emitToTenant = (tenantId: string, event: string, data: any): void => {
  if (io) {
    io.to(tenantId).emit(event, data);
  } else {
    console.warn('Socket.io not initialized. Cannot emit event.');
  }
};
