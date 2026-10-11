import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';

export default function Messages() {
  const { username } = useParams(); // who I'm chatting with (from /messages/:username)
  const { user: me } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [chatUser, setChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const bottomRef = useRef(null);

  // 1. Load the list of conversations (left side)
  const loadConversations = () => {
    api('/messages').then((data) => setConversations(data.conversations));
  };
  useEffect(loadConversations, []);

  // 2. When a chat is opened, load that user and our message history
  useEffect(() => {
    if (!username) return;
    api(`/users/${username}`)
      .then((data) => {
        setError('');
        setChatUser(data.user);
        return api(`/messages/${data.user._id}`);
      })
      .then((data) => setMessages(data.messages))
      .catch((err) => setError(err.message));
  }, [username]);

  // 3. Real-time: connect to Socket.IO and listen for new messages.
  //    The server sends "newMessage" to us when someone messages us.
  useEffect(() => {
    const socket = io(); // same server; the login cookie is sent automatically

    socket.on('newMessage', (message) => {
      // Only add it to the open chat if it came from the person we're chatting with
      if (chatUser && message.sender === chatUser._id) {
        setMessages((prev) => [...prev, message]);
      }
      loadConversations(); // update "last message" in the sidebar
    });

    return () => socket.disconnect(); // clean up when leaving the page
  }, [chatUser]);

  // Scroll to the newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const data = await api(`/messages/${chatUser._id}`, { method: 'POST', body: { text } });
      setMessages([...messages, data.message]);
      setText('');
      loadConversations();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card chat-layout">
      <aside className="chat-sidebar">
        <h3>Chats</h3>
        {conversations.length === 0 && (
          <p className="muted">No chats yet. Open someone's profile and click Message.</p>
        )}
        {conversations.map((c) => (
          <Link
            key={c.user._id}
            to={`/messages/${c.user.username}`}
            className={`chat-contact ${c.user.username === username ? 'active' : ''}`}
          >
            <Avatar user={c.user} />
            <div className="chat-contact-info">
              <p className="user-row-name">{c.user.username}</p>
              <p className="muted ellipsis">{c.lastMessage.text}</p>
            </div>
          </Link>
        ))}
      </aside>

      <section className="chat-window">
        {!username && <p className="page-message">Select a chat to start messaging.</p>}
        {error && <p className="error-text">{error}</p>}

        {username && chatUser && (
          <>
            <header className="chat-header">
              <Avatar user={chatUser} />
              <Link to={`/profile/${chatUser.username}`}>{chatUser.username}</Link>
            </header>

            <div className="chat-messages">
              {messages.map((m) => (
                <div key={m._id} className={`bubble ${m.sender === me._id ? 'mine' : 'theirs'}`}>
                  {m.text}
                  <span className="bubble-time">
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <form className="chat-input" onSubmit={handleSend}>
              <input
                className="form-input"
                placeholder="Type a message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button className="btn btn-primary" type="submit">
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
