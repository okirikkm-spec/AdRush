import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { searchChatUsers, shareToChat, isAuthenticated } from "../services/api";
import { useChat } from "../ChatContext";
import Avatar from "./Avatar";

/**
 * Кнопка «⋮» → «Поделиться» для карточки энергетика или отзыва.
 * Открывает модалку выбора получателя (существующие беседы + поиск пользователей).
 * Передаётся ровно одно из: drinkId | reviewId. Гостям не показывается.
 */
export default function ShareControl({ drinkId, reviewId, className = "" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (!isAuthenticated()) return null;

  // карточка часто лежит внутри кликабельного контейнера — гасим всплытие
  const swallow = (e, fn) => { e.stopPropagation(); fn(); };

  return (
    <div className={`share-control ${className}`} ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="share-dots" title="Ещё"
        onClick={(e) => swallow(e, () => setMenuOpen((v) => !v))} aria-label="Меню">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {menuOpen && (
        <div className="share-menu">
          <button type="button" className="share-menu-item"
            onClick={(e) => swallow(e, () => { setMenuOpen(false); setShareOpen(true); })}>
            <span aria-hidden>↗</span> Поделиться
          </button>
        </div>
      )}

      {shareOpen && (
        <ShareModal drinkId={drinkId} reviewId={reviewId} onClose={() => setShareOpen(false)} />
      )}
    </div>
  );
}

function ShareModal({ drinkId, reviewId, onClose }) {
  const navigate = useNavigate();
  const chat = useChat();
  const meId = chat?.me?.id;
  const conversations = chat?.conversations || [];

  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // { conversationId, name }
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(() => {
      searchChatUsers(q.trim()).then((l) => setResults(l || [])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const peer = (c) => (c.type === "GROUP" ? null : c.members?.find((m) => m.user.id !== meId)?.user || null);
  const convLabel = (c) => (c.type === "GROUP" ? (c.title || "Группа") : (peer(c)?.displayName || "Диалог"));
  const isSystemConv = (c) => c.type !== "GROUP" && !!peer(c)?.system;

  const doShare = async (payload, name) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await shareToChat({ ...payload, drinkId, reviewId });
      setDone({ conversationId: res.conversationId, name });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const stop = (e) => e.stopPropagation();

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}
      onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop}>
      <div className="modal modal-picker" onMouseDown={stop} onClick={stop}>
        <div className="picker-head">
          <div className="picker-head-main">
            <div className="picker-icon">↗</div>
            <div>
              <div className="picker-title">Поделиться</div>
              <div className="picker-sub">{reviewId ? "Отзыв" : "Карточка энергетика"}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="picker-body">
          {done ? (
            <div className="share-done">
              <div className="share-done-icon">✓</div>
              <div className="share-done-text">Отправлено{done.name ? ` · ${done.name}` : ""}</div>
              <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
                <button className="btn btn-secondary btn-sm" onClick={onClose}>Закрыть</button>
                <button className="btn btn-primary btn-sm" onClick={() => navigate(`/chats/${done.conversationId}`)}>Открыть чат</button>
              </div>
            </div>
          ) : (
            <>
              {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
              <input className="input" placeholder="Поиск по логину или имени…" value={q}
                onChange={(e) => setQ(e.target.value)} autoFocus />
              <div className="share-list">
                {!q.trim() && conversations.filter((c) => !isSystemConv(c)).map((c) => (
                  <button key={`c${c.id}`} type="button" className="chat-user-row" disabled={busy}
                    onClick={() => doShare({ conversationId: c.id }, convLabel(c))}>
                    <Avatar url={peer(c)?.avatarUrl} name={convLabel(c)} size={34} />
                    <div className="chat-user-info">
                      <div className="chat-user-name">{convLabel(c)}</div>
                      <div className="chat-user-login">{c.type === "GROUP" ? "Группа" : "Личный чат"}</div>
                    </div>
                  </button>
                ))}
                {q.trim() && results.map((u) => (
                  <button key={`u${u.id}`} type="button" className="chat-user-row" disabled={busy}
                    onClick={() => doShare({ recipientUserId: u.id }, u.displayName)}>
                    <Avatar url={u.avatarUrl} name={u.displayName} size={34} />
                    <div className="chat-user-info">
                      <div className="chat-user-name">{u.displayName}</div>
                      <div className="chat-user-login">@{u.username}</div>
                    </div>
                  </button>
                ))}
                {q.trim() && results.length === 0 && <div className="chat-empty-sm">Никого не найдено</div>}
                {!q.trim() && conversations.length === 0 && (
                  <div className="chat-empty-sm">Найдите пользователя выше, чтобы отправить</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
