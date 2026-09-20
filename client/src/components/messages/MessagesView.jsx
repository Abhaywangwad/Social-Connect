import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import messageService from '../../services/messageService.js';
import userService from '../../services/userService.js';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import ErrorAlert from '../common/ErrorAlert.jsx';

const formatTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const ConversationListItem = ({ conversation, isActive, onClick, currentUserId }) => {
  const other = (conversation.participants || []).find(
    (p) => (p._id || p) !== currentUserId
  );
  const lastMsg = conversation.lastMessage;

  return (
    <button
      type="button"
      className={`conversation-item${isActive ? ' conversation-item--active' : ''}`}
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
    >
      <div className="avatar avatar-sm avatar-placeholder" aria-hidden="true">
        {(other?.username || '?')[0].toUpperCase()}
      </div>
      <div className="conversation-info">
        <span className="conversation-username">{other?.username || 'Unknown'}</span>
        {lastMsg && (
          <span className="conversation-last-msg">
            {/* Plain text rendering */}
            {lastMsg.content?.slice(0, 50)}{lastMsg.content?.length > 50 ? '…' : ''}
          </span>
        )}
      </div>
      {conversation.unreadCount > 0 && (
        <span className="nav-badge conversation-unread-badge">{conversation.unreadCount}</span>
      )}
    </button>
  );
};

export const MessagesView = ({ onNavigate }) => {
  const { user } = useAuth();
  const { socket, isConnected, getTypingUsers } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [msgNextCursor, setMsgNextCursor] = useState(null);
  const [msgHasMore, setMsgHasMore] = useState(false);
  const [error, setError] = useState(null);
  const [isSending, setIsSending] = useState(false);
  const [newConvUsername, setNewConvUsername] = useState('');
  const [showNewConv, setShowNewConv] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const typingUsers = getTypingUsers(activeConvId);

  // Load conversation list
  useEffect(() => {
    let cancelled = false;
    messageService.getConversations({ limit: 30 })
      .then((res) => {
        if (!cancelled) {
          setConversations(res?.data?.conversations || []);
          setIsLoadingConvs(false);
        }
      })
      .catch((err) => {
        if (!cancelled) { setError(err); setIsLoadingConvs(false); }
      });
    return () => { cancelled = true; };
  }, []);

  // Listen for real-time messages and conversation updates
  useEffect(() => {
    const unsubNew = socket.on('message:new', (message) => {
      if (message.conversation === activeConvId || message.conversation?._id === activeConvId) {
        setMessages((prev) => [...prev, message]);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      setConversations((prev) =>
        prev.map((c) =>
          c._id === (message.conversation?._id || message.conversation)
            ? { ...c, lastMessage: { content: message.content, createdAt: message.createdAt } }
            : c
        )
      );
    });

    const unsubUpdated = socket.on('conversation:updated', (payload) => {
      setConversations((prev) =>
        prev.map((c) => (c._id === payload.conversationId ? { ...c, ...payload } : c))
      );
    });

    return () => {
      unsubNew();
      unsubUpdated();
    };
  }, [socket, activeConvId]);

  // Load messages for active conversation
  const loadMessages = useCallback(async (convId, cursor = null) => {
    if (!convId) return;
    setIsLoadingMsgs(true);
    try {
      const res = await messageService.getMessages(convId, { cursor, limit: 30 });
      const newMsgs = res?.data?.messages || [];
      setMessages((prev) => cursor ? [...newMsgs, ...prev] : newMsgs);
      setMsgNextCursor(res?.data?.nextCursor || null);
      setMsgHasMore(Boolean(res?.data?.nextCursor));
    } catch (err) {
      setError(err);
    } finally {
      setIsLoadingMsgs(false);
    }
  }, []);

  const selectConversation = useCallback(async (convId) => {
    if (activeConvId) socket.leaveConversation(activeConvId);
    setActiveConvId(convId);
    setMessages([]);
    setMsgNextCursor(null);
    socket.joinConversation(convId);
    socket.markConversationRead(convId);
    await loadMessages(convId);
  }, [activeConvId, socket, loadMessages]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmed = newMessage.trim();
    if (!trimmed || !activeConvId || isSending) return;

    setNewMessage('');
    setIsSending(true);
    socket.stopTyping(activeConvId);

    if (isConnected) {
      socket.sendMessage(activeConvId, trimmed, `client-${Date.now()}`, (ack) => {
        if (ack?.success) {
          setMessages((prev) => [...prev, ack.message]);
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
          setError({ message: ack?.error?.message || 'Message could not be sent' });
          setNewMessage(trimmed);
        }
        setIsSending(false);
      });
    } else {
      // REST fallback when socket disconnected
      try {
        const res = await messageService.sendMessage(activeConvId, trimmed);
        setMessages((prev) => [...prev, res?.data?.message]);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } catch (err) {
        setError(err);
        setNewMessage(trimmed);
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (!activeConvId) return;
    socket.startTyping(activeConvId);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => socket.stopTyping(activeConvId), 2000);
  };

  const handleStartConversation = async (e) => {
    e.preventDefault();
    const uname = newConvUsername.trim();
    if (!uname) return;
    try {
      const profileRes = await userService.getUserProfile(uname);
      const recipientId = profileRes?.data?.user?._id;
      if (!recipientId) throw new Error('User not found');
      const res = await messageService.createConversation(recipientId);
      const conv = res?.data?.conversation;
      if (conv) {
        setConversations((prev) => {
          const exists = prev.find((c) => c._id === conv._id);
          return exists ? prev : [conv, ...prev];
        });
        setShowNewConv(false);
        setNewConvUsername('');
        selectConversation(conv._id);
      }
    } catch (err) {
      setError(err);
    }
  };

  if (isLoadingConvs) return <LoadingSpinner message="Loading messages…" size="large" />;

  return (
    <div className="messages-view">
      {/* Conversations Sidebar */}
      <aside className="conversations-sidebar">
        <div className="conversations-header">
          <h2>Messages</h2>
          <button
            id="new-conversation-btn"
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setShowNewConv((v) => !v)}
          >
            + New
          </button>
        </div>

        {showNewConv && (
          <form className="new-conv-form" onSubmit={handleStartConversation}>
            <input
              id="new-conv-username-input"
              type="text"
              className="form-input"
              value={newConvUsername}
              onChange={(e) => setNewConvUsername(e.target.value)}
              placeholder="Enter username…"
            />
            <button type="submit" className="btn btn-sm btn-primary">Start</button>
          </form>
        )}

        <div className="conversations-list">
          {conversations.length === 0 && (
            <p className="empty-state-sm">No conversations yet.</p>
          )}
          {conversations.map((conv) => (
            <ConversationListItem
              key={conv._id}
              conversation={conv}
              isActive={conv._id === activeConvId}
              onClick={() => selectConversation(conv._id)}
              currentUserId={user?._id}
            />
          ))}
        </div>
      </aside>

      {/* Chat Window */}
      <main className="chat-window">
        {!activeConvId ? (
          <div className="chat-empty-state">
            <p>Select a conversation to start messaging.</p>
          </div>
        ) : (
          <>
            {/* Load more messages */}
            {msgHasMore && !isLoadingMsgs && (
              <div className="load-more-center">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => loadMessages(activeConvId, msgNextCursor)}
                >
                  Load earlier messages
                </button>
              </div>
            )}
            {isLoadingMsgs && <LoadingSpinner size="small" />}

            <ErrorAlert error={error} onDismiss={() => setError(null)} />

            {/* Message List */}
            <div className="messages-list" aria-live="polite" aria-label="Messages">
              {messages.map((msg) => {
                const isMine = (msg.sender?._id || msg.sender) === user?._id;
                return (
                  <div
                    key={msg._id || msg.clientMessageId}
                    className={`message-bubble${isMine ? ' message-bubble--mine' : ' message-bubble--theirs'}`}
                  >
                    {/* Plain text rendering — no dangerouslySetInnerHTML */}
                    <p className="message-content">{msg.content}</p>
                    <span className="message-time">{formatTime(msg.createdAt)}</span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
              <div className="typing-indicator" aria-live="polite" aria-label="Typing indicator">
                <span className="typing-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}

            {/* Message Input */}
            <form className="message-input-row" onSubmit={handleSendMessage}>
              <input
                id="message-input"
                type="text"
                className="form-input message-input"
                value={newMessage}
                onChange={handleTyping}
                placeholder="Type a message…"
                maxLength={5000}
                disabled={isSending}
                aria-label="Message input"
              />
              <button
                id="send-message-btn"
                type="submit"
                className="btn btn-primary"
                disabled={isSending || !newMessage.trim()}
                aria-label="Send message"
              >
                {isSending ? '…' : 'Send'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
};

export default MessagesView;
