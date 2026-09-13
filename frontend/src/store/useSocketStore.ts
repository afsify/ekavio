import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
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
  connectSocket: (token: string) => void;
  disconnectSocket: () => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  isConnected: false,
  notifications: [],

  connectSocket: (token: string) => {
    if (get().socket?.connected) return;

    const socket = io(frontendConfig.socketUrl, {
      auth: {
        token,
      },
    });

    socket.on('connect', () => {
      console.log('Connected to socket server');
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from socket server');
      set({ isConnected: false });
    });

    socket.on('new_notification', (notification: NotificationPayload) => {
      set((state) => ({
        notifications: [notification, ...state.notifications],
      }));
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  markAsRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }));
  },

  clearNotifications: () => {
    set({ notifications: [] });
  },
}));

export default useSocketStore;
