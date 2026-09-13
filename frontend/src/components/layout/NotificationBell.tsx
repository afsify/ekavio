import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Bell, Info, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { client } from '../../api/client';
import { useSocketStore, type NotificationPayload } from '../../store/useSocketStore';

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const socket = useSocketStore((state) => state.socket);
  const socketNotifications = useSocketStore((state) => state.notifications);
  const markSocketNotificationAsRead = useSocketStore((state) => state.markAsRead);

  // Fetch initial notifications
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        const response = await client.get('/notifications');
        return response.data.data as NotificationPayload[];
      } catch {
        // Fallback for missing backend route as discussed
        return [];
      }
    },
    initialData: [],
  });

  const localNotifications = useMemo(() => {
    const socketIds = new Set(socketNotifications.map((notification) => notification.id));
    return [
      ...socketNotifications,
      ...notificationsData.filter((notification) => !socketIds.has(notification.id)),
    ];
  }, [notificationsData, socketNotifications]);

  useEffect(() => {
    if (socket) {
      const handleNewNotification = (notification: NotificationPayload) => {
        toast.custom((t) => (
          <div
            className={`${
              t.visible ? 'animate-enter' : 'animate-leave'
            } max-w-md w-full bg-slate-900 border border-slate-700 shadow-xl rounded-2xl pointer-events-auto flex ring-1 ring-black ring-opacity-5`}
          >
            <div className="flex-1 w-0 p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 pt-0.5">
                  {notification.type === 'alert' ? (
                    <AlertTriangle className="h-10 w-10 text-rose-500 rounded-full bg-rose-500/10 p-2" />
                  ) : (
                    <Info className="h-10 w-10 text-blue-500 rounded-full bg-blue-500/10 p-2" />
                  )}
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-bold text-white">{notification.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{notification.message}</p>
                </div>
              </div>
            </div>
            <div className="flex border-l border-slate-700">
              <button
                onClick={() => toast.dismiss(t.id)}
                className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
              >
                Close
              </button>
            </div>
          </div>
        ));
      };

      socket.on('new_notification', handleNewNotification);
      return () => {
        socket.off('new_notification', handleNewNotification);
      };
    }
  }, [socket]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = localNotifications.filter((n) => !n.isRead).length;

  const markAsRead = async (id: string) => {
    markSocketNotificationAsRead(id);
    queryClient.setQueryData<NotificationPayload[]>(
      ['notifications'],
      (notifications = []) => notifications.map((notification) =>
        notification.id === id ? { ...notification, isRead: true } : notification
      ),
    );
    try {
      await client.patch(`/notifications/${id}/read`);
    } catch {
      // ignore
    }
  };

  const markAllAsRead = async () => {
    socketNotifications.forEach((notification) => markSocketNotificationAsRead(notification.id));
    queryClient.setQueryData<NotificationPayload[]>(
      ['notifications'],
      (notifications = []) => notifications.map((notification) => ({
        ...notification,
        isRead: true,
      })),
    );
    try {
      await client.patch('/notifications/read-all');
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse border-2 border-slate-900"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 z-50 overflow-hidden transform opacity-100 scale-100 transition-all">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm">
            <h3 className="text-lg font-bold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {localNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No new notifications</p>
              </div>
            ) : (
              localNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors cursor-pointer ${
                    !notif.isRead ? 'bg-slate-800/20' : ''
                  }`}
                  onClick={() => !notif.isRead && markAsRead(notif.id)}
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 mt-1">
                      {notif.type === 'alert' ? (
                        <AlertTriangle className="w-5 h-5 text-rose-500" />
                      ) : (
                        <Info className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${!notif.isRead ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                          {notif.title}
                        </p>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${!notif.isRead ? 'text-slate-300' : 'text-slate-500'}`}>
                        {notif.message}
                      </p>
                    </div>
                    {!notif.isRead && (
                      <div className="shrink-0 self-center">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
