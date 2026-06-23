import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  isAuthenticated, fetchMe,
  fetchChats, fetchChatMessages, sendChatMessage, markChatRead,
  openDirectChat, createGroupChat, addChatMembers, leaveChat,
} from "./services/api";
import { createChatSocket } from "./services/chatSocket";

const ChatContext = createContext(null);

const sortConvs = (arr) =>
  [...arr].sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

export function ChatProvider({ children }) {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState({}); // convId -> ChatMessageDto[]
  const [typing, setTyping] = useState({});      // convId -> { [userId]: { name, at } }
  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState(null);

  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const meRef = useRef(null);
  const msgsRef = useRef({});
  const typingTimers = useRef({});

  useEffect(() => { msgsRef.current = messages; }, [messages]);
  useEffect(() => { meRef.current = me; }, [me]);

  const refresh = useCallback(() => {
    fetchChats().then((list) => setConversations(sortConvs(list || []))).catch(() => {});
  }, []);

  const loadMessages = useCallback((cid) => {
    return fetchChatMessages(cid)
      .then((list) => setMessages((prev) => ({ ...prev, [cid]: list || [] })))
      .catch(() => {});
  }, []);

  const loadMore = useCallback((cid) => {
    const list = msgsRef.current[cid];
    if (!list || !list.length) return Promise.resolve(0);
    return fetchChatMessages(cid, { beforeId: list[0].id })
      .then((older) => {
        if (older && older.length) setMessages((prev) => ({ ...prev, [cid]: [...older, ...(prev[cid] || [])] }));
        return older ? older.length : 0;
      })
      .catch(() => 0);
  }, []);

  const upsertConversation = useCallback((conv) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conv.id);
      let next;
      if (idx === -1) next = [conv, ...prev];
      else { next = [...prev]; next[idx] = { ...next[idx], ...conv }; }
      return sortConvs(next);
    });
  }, []);

  const handleEvent = useCallback((ev) => {
    const cid = ev.conversationId;
    if (ev.kind === "message") {
      const m = ev.message;
      setMessages((prev) => {
        const list = prev[m.conversationId];
        if (!list) return prev; // не загружено — подтянется при открытии
        if (list.some((x) => x.id === m.id)) return prev;
        return { ...prev, [m.conversationId]: [...list, m] };
      });
      setConversations((prev) => {
        let found = false;
        const next = prev.map((c) => {
          if (c.id !== m.conversationId) return c;
          found = true;
          const isMine = meRef.current && m.sender.id === meRef.current.id;
          const isActive = activeRef.current === c.id;
          const unreadCount = isMine || isActive ? 0 : (c.unreadCount || 0) + 1;
          return { ...c, lastMessage: m, lastMessageAt: m.createdAt, unreadCount };
        });
        if (!found) refresh();
        return sortConvs(next);
      });
      setTyping((prev) => {
        const t = prev[m.conversationId];
        if (!t || !t[m.sender.id]) return prev;
        const nt = { ...t }; delete nt[m.sender.id];
        return { ...prev, [m.conversationId]: nt };
      });
      if (activeRef.current === m.conversationId && meRef.current && m.sender.id !== meRef.current.id) {
        markChatRead(m.conversationId).catch(() => {});
      }
    } else if (ev.kind === "typing") {
      const u = ev.user;
      if (meRef.current && u.id === meRef.current.id) return;
      setTyping((prev) => ({ ...prev, [cid]: { ...(prev[cid] || {}), [u.id]: { name: u.displayName, at: Date.now() } } }));
      const key = `${cid}:${u.id}`;
      clearTimeout(typingTimers.current[key]);
      typingTimers.current[key] = setTimeout(() => {
        setTyping((prev) => {
          const t = prev[cid]; if (!t) return prev;
          const nt = { ...t }; delete nt[u.id];
          return { ...prev, [cid]: nt };
        });
      }, 3500);
    } else if (ev.kind === "read") {
      const uid = ev.user.id;
      setConversations((prev) => prev.map((c) => {
        if (c.id !== cid) return c;
        const members = (c.members || []).map((mm) => (mm.user.id === uid ? { ...mm, lastReadAt: ev.lastReadAt } : mm));
        return { ...c, members };
      }));
    } else if (ev.kind === "conversation" && ev.conversation) {
      upsertConversation(ev.conversation);
    }
  }, [refresh, upsertConversation]);

  // Подключение к WS + загрузка данных, когда пользователь авторизован
  useEffect(() => {
    let socket = null;
    const start = () => {
      if (socket) return;
      socket = createChatSocket(handleEvent, setConnected);
      socketRef.current = socket;
      socket.connect();
      fetchMe().then(setMe).catch(() => {});
      refresh();
    };
    const stop = () => {
      if (socket) { socket.disconnect(); socket = null; socketRef.current = null; }
      setConversations([]); setMessages({}); setTyping({}); setMe(null);
      activeRef.current = null;
    };
    if (isAuthenticated()) start();
    const onAuth = () => { if (isAuthenticated()) start(); else stop(); };
    window.addEventListener("ar-auth", onAuth);
    return () => { window.removeEventListener("ar-auth", onAuth); if (socket) socket.disconnect(); };
  }, [handleEvent, refresh]);

  const markActiveRead = useCallback((cid) => {
    markChatRead(cid).then(() => {
      setConversations((prev) => prev.map((c) => {
        if (c.id !== cid) return c;
        const myId = meRef.current?.id;
        const members = (c.members || []).map((mm) => (mm.user.id === myId ? { ...mm, lastReadAt: new Date().toISOString() } : mm));
        return { ...c, unreadCount: 0, members };
      }));
    }).catch(() => {});
  }, []);

  const setActive = useCallback((cid) => {
    activeRef.current = cid;
    if (cid) {
      if (!msgsRef.current[cid]) loadMessages(cid);
      markActiveRead(cid);
    }
  }, [loadMessages, markActiveRead]);

  const send = useCallback((cid, content) => {
    return sendChatMessage(cid, content).then((m) => {
      setMessages((prev) => {
        const l = prev[cid];
        if (l && !l.some((x) => x.id === m.id)) return { ...prev, [cid]: [...l, m] };
        return prev;
      });
      setConversations((prev) => sortConvs(prev.map((c) => (c.id === cid ? { ...c, lastMessage: m, lastMessageAt: m.createdAt } : c))));
      return m;
    });
  }, []);

  const openDirect = useCallback((userId) => openDirectChat(userId).then((conv) => { upsertConversation(conv); return conv; }), [upsertConversation]);
  const createGroup = useCallback((title, ids) => createGroupChat(title, ids).then((conv) => { upsertConversation(conv); return conv; }), [upsertConversation]);
  const addMembers = useCallback((cid, ids) => addChatMembers(cid, ids).then((conv) => { upsertConversation(conv); return conv; }), [upsertConversation]);
  const leave = useCallback((cid) => leaveChat(cid).then(() => {
    setConversations((prev) => prev.filter((c) => c.id !== cid));
    setMessages((prev) => { const n = { ...prev }; delete n[cid]; return n; });
    if (activeRef.current === cid) activeRef.current = null;
  }), []);
  const sendTyping = useCallback((cid) => socketRef.current?.sendTyping(cid), []);

  const unreadTotal = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);

  const value = {
    me, connected, conversations, messages, typing, unreadTotal,
    refresh, loadMessages, loadMore, setActive, send,
    openDirect, createGroup, addMembers, leave, sendTyping,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  return useContext(ChatContext);
}
