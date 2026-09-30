import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { frontendConfig } from '../config/env';

export interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  connectSocket: (token: string, organizationId: string, branchId?: string) => void;
  disconnectSocket: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,

  connectSocket: (token, organizationId, branchId) => {
    const existingSocket = get().socket;
    const auth = { token, organizationId, ...(branchId ? { branchId } : {}) };
    if (existingSocket) {
      // Reconnect is the context-switch primitive: disconnect leaves every old room.
      existingSocket.disconnect();
      existingSocket.auth = auth;
      existingSocket.connect();
      return;
    }

    const socket = io(frontendConfig.socketUrl, { auth });
    socket.on('connect', () => set({ isConnected: true }));
    socket.on('disconnect', () => set({ isConnected: false }));
    set({ socket });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) socket.disconnect();
    set({ socket: null, isConnected: false });
  },
}));

export default useSocketStore;
