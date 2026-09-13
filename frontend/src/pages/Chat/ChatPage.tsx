import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Search, Send, ArrowLeft, UserCircle2 } from 'lucide-react';
import { client } from '../../api/client';
import { useSocketStore } from '../../store/useSocketStore';
import { useAppStore } from '../../store/useAppStore';

const messageSchema = z.object({
  text: z.string().min(1, 'Message cannot be empty'),
});

type MessageFormInputs = z.infer<typeof messageSchema>;

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: string;
}

interface ChatContact {
  id: string;
  name: string;
  role: string;
  lastMessage?: string;
  unreadCount?: number;
}

export const ChatPage: React.FC = () => {
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();
  const socket = useSocketStore((state) => state.socket);
  const currentUser = useAppStore((state) => state.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mock Contacts Data for now, ideally fetched from /api/chat/contacts
  const { data: contacts } = useQuery({
    queryKey: ['chatContacts'],
    queryFn: async () => {
      try {
        const res = await client.get('/chat/contacts');
        return res.data.data as ChatContact[];
      } catch {
        return [
          { id: 'user_1', name: 'John Doe', role: 'Store Manager', unreadCount: 2 },
          { id: 'user_2', name: 'Jane Smith', role: 'Cashier' },
          { id: 'group_all', name: 'All Staff (Branch A)', role: 'Group' },
        ];
      }
    },
    initialData: [],
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['chatMessages', activeContactId],
    queryFn: async () => {
      if (!activeContactId) return [];
      try {
        const res = await client.get(`/chat/${activeContactId}`);
        return res.data.data as ChatMessage[];
      } catch {
        return [];
      }
    },
    enabled: !!activeContactId,
  });

  useEffect(() => {
    if (socket) {
      const handleReceive = (message: ChatMessage) => {
        // Optimistically update if the message belongs to the active conversation
        if (
          message.senderId === activeContactId ||
          message.receiverId === activeContactId
        ) {
          queryClient.setQueryData(
            ['chatMessages', activeContactId],
            (old: ChatMessage[] | undefined) => (old ? [...old, message] : [message])
          );
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      };
      socket.on('receive_message', handleReceive);
      return () => {
        socket.off('receive_message', handleReceive);
      };
    }
  }, [socket, activeContactId, queryClient]);

  // Scroll to bottom on messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const {
    register,
    handleSubmit,
    reset,
  } = useForm<MessageFormInputs>({
    resolver: zodResolver(messageSchema),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!socket || !activeContactId) return;
      const payload = {
        receiverId: activeContactId,
        text,
        senderId: currentUser?.id || 'me',
        timestamp: new Date().toISOString(),
      };
      // Optimistic update
      queryClient.setQueryData(
        ['chatMessages', activeContactId],
        (old: ChatMessage[] | undefined) => {
          const optimisticMsg = { id: Date.now().toString(), ...payload };
          return old ? [...old, optimisticMsg] : [optimisticMsg];
        }
      );
      
      // Emit via socket
      socket.emit('send_message', payload);
      
      // Optional: Backup persist to DB
      try {
        await client.post('/chat', payload);
      } catch {
        // Chat persistence is optional until the backend route is implemented.
      }
    },
    onSuccess: () => {
      reset();
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    },
  });

  const onSubmit: SubmitHandler<MessageFormInputs> = (data) => {
    sendMessageMutation.mutate(data.text);
  };

  const filteredContacts = contacts?.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeContact = contacts?.find((c) => c.id === activeContactId);

  return (
    <div className="h-[calc(100vh-140px)] w-full flex bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden">
      {/* Sidebar - Contacts List */}
      <div
        className={`w-full md:w-80 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900/50 ${
          activeContactId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-xl font-bold text-white mb-4">Messages</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search contacts..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredContacts?.map((contact) => (
            <div
              key={contact.id}
              onClick={() => setActiveContactId(contact.id)}
              className={`p-4 border-b border-slate-800/50 cursor-pointer transition-colors flex items-center gap-3 ${
                activeContactId === contact.id
                  ? 'bg-indigo-500/10'
                  : 'hover:bg-slate-800/50'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                <UserCircle2 className="w-6 h-6 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h3 className={`text-sm truncate ${activeContactId === contact.id ? 'font-bold text-indigo-400' : 'font-medium text-slate-200'}`}>
                    {contact.name}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 truncate">{contact.role}</p>
              </div>
              {contact.unreadCount && contact.unreadCount > 0 && (
                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {contact.unreadCount}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 bg-slate-950 relative ${
          !activeContactId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {activeContactId ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-900/80 backdrop-blur shrink-0">
              <button
                onClick={() => setActiveContactId(null)}
                className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                <UserCircle2 className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">{activeContact?.name}</h3>
                <p className="text-xs text-slate-400">{activeContact?.role}</p>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                  <p className="text-sm">No messages yet.</p>
                  <p className="text-xs">Send a message to start the conversation.</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.senderId === currentUser?.id || msg.senderId === 'me';
                  return (
                    <div
                      key={idx}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                          isMe
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-slate-800 text-slate-200 rounded-bl-sm'
                        }`}
                      >
                        {msg.text}
                        <div
                          className={`text-[10px] mt-1 text-right opacity-70`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Form */}
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="p-4 border-t border-slate-800 bg-slate-900/50 shrink-0"
            >
              <div className="flex items-center gap-2 relative">
                <input
                  type="text"
                  placeholder="Type a message..."
                  autoComplete="off"
                  {...register('text')}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-full py-3 pl-5 pr-12 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-colors"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
              <UserCircle2 className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-400 mb-1">Select a contact</h3>
            <p className="text-sm">Choose a contact from the sidebar to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;
