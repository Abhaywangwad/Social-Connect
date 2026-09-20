import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import socketManager from '../socket/socketManager.js';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingMap, setTypingMap] = useState({});

  useEffect(() => {
    if (!isAuthenticated || !token) {
      socketManager.disconnect();
      setIsConnected(false);
      return;
    }

    socketManager.connect(token);

    const unsubConnection = socketManager.on('connection:change', ({ connected }) => {
      setIsConnected(connected);
    });

    const unsubOnline = socketManager.on('presence:online', ({ userId }) => {
      if (userId) {
        setOnlineUsers((prev) => new Set([...prev, userId]));
      }
    });

    const unsubOffline = socketManager.on('presence:offline', ({ userId }) => {
      if (userId) {
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    });

    const unsubTypingStart = socketManager.on('typing:start', ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      setTypingMap((prev) => {
        const current = prev[conversationId] || [];
        if (!current.includes(userId)) {
          return { ...prev, [conversationId]: [...current, userId] };
        }
        return prev;
      });
    });

    const unsubTypingStop = socketManager.on('typing:stop', ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      setTypingMap((prev) => {
        const current = prev[conversationId] || [];
        return {
          ...prev,
          [conversationId]: current.filter((id) => id !== userId),
        };
      });
    });

    return () => {
      unsubConnection();
      unsubOnline();
      unsubOffline();
      unsubTypingStart();
      unsubTypingStop();
      socketManager.disconnect();
      setIsConnected(false);
    };
  }, [isAuthenticated, token]);

  const value = {
    isConnected,
    onlineUsers,
    typingMap,
    socket: socketManager,
    isUserOnline: (userId) => onlineUsers.has(userId),
    getTypingUsers: (conversationId) => typingMap[conversationId] || [],
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export default SocketContext;
