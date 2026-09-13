import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { frontendConfig } from '../config/env';

export interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type: 'alert' | 'info';
  timestamp: string;
  isRead: boolean;
}

export interface SocketState {
  socket: Socket | null;
  isConnected: boolean;
  notifications: NotificationPayload[];
  connectSocket: (token: string, organizationId: string, branchId?: string) => void;
  disconnectSocket: () => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  notifications: [],

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
    socket.on('new_notification', (notification: NotificationPayload) => {
      set((state) => ({ notifications: [notification, ...state.notifications] }));
    });
    set({ socket });
  },

  disconnectSocket: () => {
    const socket = get().socket;
    if (socket) socket.disconnect();
    set({ socket: null, isConnected: false });
  },

  markAsRead: (id) => {
    set((state) => ({
      notifications: state.notifications.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification,
      ),
    }));
  },
  clearNotifications: () => set({ notifications: [] }),
}));

export default useSocketStore;
