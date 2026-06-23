import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import { useChat } from "../ChatContext";
import { searchChatUsers } from "../services/api";

/* ─────────────── helpers ─────────────── */

const otherMember = (conv, meId) =>
  conv?.members?.find((m) => m.user.id !== meId) || conv?.members?.[0] || null;

const convTitle = (conv, meId) => {
  if (!conv) return "";
  if (conv.type === "GROUP") return conv.title || "Группа";
  const o = otherMember(conv, meId);
  return o ? o.user.displayName : "Диалог";
};

const convAvatarUser = (conv, meId) =>
  conv?.type === "GROUP" ? null : otherMember(conv, meId)?.user || null;

const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const fmtDay = (iso) => {
  try { return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }
  catch { return ""; }
};

/* ─────────────── Поиск пользователей ─────────────── */

function UserSearch({ exclude = [], onPick, placeholder = "Поиск по логину или имени…" }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      searchChatUsers(q.trim())
        .then((list) => setResults((list || []).filter((u) => !exclude.includes(u.id))))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, exclude]);

  return (
    <div className="chat-search">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoFocus />
      <div className="chat-search-results">
        {loading && <div className="chat-empty-sm">Поиск…</div>}
        {!loading && q.trim() && results.length === 0 && <div className="chat-empty-sm">Никого не найдено</div>}
        {results.map((u) => (
          <button key={u.id} type="button" className="chat-user-row" onClick={() => onPick(u)}>
            <Avatar url={u.avatarUrl} name={u.displayName} size={34} />
            <div className="chat-user-info">
              <div className="chat-user-name">{u.displayName}</div>
              <div className="chat-user-login">@{u.username}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Модалка «Новый чат» ─────────────── */

function NewChatModal({ onClose, onOpened }) {
  const { openDirect, createGroup } = useChat();
  const [mode, setMode] = useState("direct"); // direct | group
  const [selected, setSelected] = useState([]); // [{id, displayName, ...}]
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const pickDirect = async (u) => {
    setBusy(true);
    try { const conv = await openDirect(u.id); onOpened(conv.id); onClose(); }
    finally { setBusy(false); }
  };

  const toggleSelect = (u) =>
    setSelected((prev) => (prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]));

  const submitGroup = async () => {
    if (!title.trim() || selected.length === 0) return;
    setBusy(true);
    try { const conv = await createGroup(title.trim(), selected.map((u) => u.id)); onOpened(conv.id); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <div className="picker-head-main">
            <div className="picker-icon">＋</div>
            <div>
              <div className="picker-title">Новый чат</div>
              <div className="picker-sub">Личный диалог или группа</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="picker-body">
          <div className="seg" style={{ marginBottom: 14 }}>
            <button className={"seg-btn" + (mode === "direct" ? " on" : "")} onClick={() => setMode("direct")}>
              <span className="seg-title">Личный</span>
              <span className="seg-sub">Диалог 1-на-1</span>
            </button>
            <button className={"seg-btn" + (mode === "group" ? " on" : "")} onClick={() => setMode("group")}>
              <span className="seg-title">Группа</span>
              <span className="seg-sub">Несколько участников</span>
            </button>
          </div>

          {mode === "group" && (
            <>
              <div className="input-group">
                <label className="input-label">Название группы</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Любители Adrenaline" />
              </div>
              {selected.length > 0 && (
                <div className="chat-chips">
                  {selected.map((u) => (
                    <button key={u.id} type="button" className="chat-chip" onClick={() => toggleSelect(u)}>
                      {u.displayName} <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <UserSearch
            exclude={selected.map((u) => u.id)}
            onPick={mode === "direct" ? pickDirect : toggleSelect}
          />
        </div>

        {mode === "group" && (
          <div className="picker-foot">
            <span className="picker-foot-info muted">{selected.length} выбрано</span>
            <button className="btn btn-primary" disabled={busy || !title.trim() || selected.length === 0} onClick={submitGroup}>
              Создать группу
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Модалка «Добавить участников» ─────────────── */

function AddMembersModal({ conv, onClose }) {
  const { addMembers } = useChat();
  const existing = useMemo(() => (conv.members || []).map((m) => m.user.id), [conv]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const toggleSelect = (u) =>
    setSelected((prev) => (prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]));

  const submit = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try { await addMembers(conv.id, selected.map((u) => u.id)); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <div className="picker-head-main">
            <div className="picker-icon">＋</div>
            <div>
              <div className="picker-title">Добавить участников</div>
              <div className="picker-sub">{conv.title}</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="picker-body">
          {selected.length > 0 && (
            <div className="chat-chips">
              {selected.map((u) => (
                <button key={u.id} type="button" className="chat-chip" onClick={() => toggleSelect(u)}>
                  {u.displayName} <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          )}
          <UserSearch exclude={[...existing, ...selected.map((u) => u.id)]} onPick={toggleSelect} />
        </div>
        <div className="picker-foot">
          <span className="picker-foot-info muted">{selected.length} выбрано</span>
          <button className="btn btn-primary" disabled={busy || selected.length === 0} onClick={submit}>Добавить</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Список бесед ─────────────── */

function ConvList({ activeId, onSelect, meId, onNew }) {
  const { conversations } = useChat();
  return (
    <aside className="chat-sidebar">
      <div className="chat-sidebar-head">
        <span className="chat-sidebar-title">Чаты</span>
        <button className="btn btn-primary btn-sm" onClick={onNew}>＋ Новый</button>
      </div>
      <div className="chat-conv-list">
        {conversations.length === 0 && <div className="chat-empty-sm" style={{ padding: 24 }}>Пока нет бесед. Начните новый чат.</div>}
        {conversations.map((c) => {
          const u = convAvatarUser(c, meId);
          return (
            <button key={c.id} type="button"
              className={"chat-conv" + (c.id === activeId ? " active" : "")}
              onClick={() => onSelect(c.id)}>
              <Avatar url={u?.avatarUrl} name={convTitle(c, meId)} size={46} />
              <div className="chat-conv-body">
                <div className="chat-conv-top">
                  <span className="chat-conv-name">{convTitle(c, meId)}</span>
                  {c.lastMessage && <span className="chat-conv-time">{fmtTime(c.lastMessage.createdAt)}</span>}
                </div>
                <div className="chat-conv-bottom">
                  <span className="chat-conv-preview">
                    {c.lastMessage
                      ? (c.type === "GROUP" ? `${c.lastMessage.sender.displayName}: ` : "") + c.lastMessage.content
                      : (c.type === "GROUP" ? "Группа создана" : "Нет сообщений")}
                  </span>
                  {c.unreadCount > 0 && <span className="chat-unread">{c.unreadCount > 99 ? "99+" : c.unreadCount}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* ─────────────── Активная беседа ─────────────── */

function ConvView({ conv, meId, onBack }) {
  const { messages, typing, send, sendTyping, loadMore, leave } = useChat();
  const list = messages[conv.id];
  const [text, setText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const scrollRef = useRef(null);
  const lastTyping = useRef(0);
  const navigate = useNavigate();

  // автопрокрутка вниз при новых сообщениях
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list?.length, conv.id]);

  const onInput = (e) => {
    setText(e.target.value);
    const now = Date.now();
    if (now - lastTyping.current > 1500) { lastTyping.current = now; sendTyping(conv.id); }
  };

  const doSend = useCallback(() => {
    const t = text.trim();
    if (!t) return;
    setText("");
    send(conv.id, t).catch(() => {});
  }, [text, conv.id, send]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
  };

  // статус прочтения для личных чатов (по последнему моему сообщению)
  const otherRead = useMemo(() => {
    if (conv.type !== "DIRECT") return null;
    const o = otherMember(conv, meId);
    return o?.lastReadAt ? new Date(o.lastReadAt).getTime() : 0;
  }, [conv, meId]);

  const typers = Object.values(typing[conv.id] || {}).map((t) => t.name);

  let lastDay = null;
  return (
    <section className="chat-main">
      <header className="chat-main-head">
        <button className="btn-icon chat-back" onClick={onBack} aria-label="Назад">‹</button>
        <Avatar url={convAvatarUser(conv, meId)?.avatarUrl} name={convTitle(conv, meId)} size={38} />
        <div className="chat-main-head-info">
          <div className="chat-main-title">{convTitle(conv, meId)}</div>
          <div className="chat-main-sub">
            {conv.type === "GROUP" ? `${conv.members?.length || 0} участников` : `@${otherMember(conv, meId)?.user.username || ""}`}
          </div>
        </div>
        {conv.type === "GROUP" && (
          <div className="chat-main-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(true)}>Добавить</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { leave(conv.id).then(() => navigate("/chats")); }}>Выйти</button>
          </div>
        )}
      </header>

      <div className="chat-messages" ref={scrollRef}>
        {list === undefined && <div className="chat-empty-sm" style={{ padding: 24 }}>Загрузка…</div>}
        {list && list.length >= 40 && (
          <div className="chat-loadmore"><button className="btn btn-ghost btn-sm" onClick={() => loadMore(conv.id)}>Загрузить ещё</button></div>
        )}
        {list && list.length === 0 && <div className="chat-empty-sm" style={{ padding: 24 }}>Сообщений пока нет — напишите первым.</div>}
        {(list || []).map((m) => {
          const mine = m.sender.id === meId;
          const day = fmtDay(m.createdAt);
          const showDay = day !== lastDay; lastDay = day;
          const read = mine && otherRead != null && otherRead >= new Date(m.createdAt).getTime();
          return (
            <div key={m.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <div className={"chat-msg" + (mine ? " mine" : "")}>
                {!mine && conv.type === "GROUP" && <Avatar url={m.sender.avatarUrl} name={m.sender.displayName} size={28} />}
                <div className="chat-bubble">
                  {!mine && conv.type === "GROUP" && <div className="chat-bubble-author">{m.sender.displayName}</div>}
                  <span className="chat-bubble-text">{m.content}</span>
                  <span className="chat-bubble-meta">
                    {fmtTime(m.createdAt)}
                    {mine && conv.type === "DIRECT" && <span className={"chat-tick" + (read ? " read" : "")}>{read ? "✓✓" : "✓"}</span>}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="chat-typing-line">{typers.length > 0 && `${typers.join(", ")} печатает…`}</div>

      <div className="chat-composer">
        <textarea className="input" rows={1} value={text} onChange={onInput} onKeyDown={onKeyDown} placeholder="Сообщение…" />
        <button className="btn btn-primary chat-send" onClick={doSend} disabled={!text.trim()} aria-label="Отправить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5v-6l8-2-8-2v-6l19 8z" /></svg>
        </button>
      </div>

      {showAdd && <AddMembersModal conv={conv} onClose={() => setShowAdd(false)} />}
    </section>
  );
}

/* ─────────────── Страница ─────────────── */

export default function ChatsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const chat = useChat();
  const meId = chat?.me?.id;
  const [showNew, setShowNew] = useState(false);

  const activeId = id ? Number(id) : null;
  const activeConv = chat?.conversations.find((c) => c.id === activeId) || null;

  // отметить активную беседу + подгрузить сообщения
  useEffect(() => {
    if (activeId) chat?.setActive(activeId);
    return () => chat?.setActive(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const select = (cid) => navigate(`/chats/${cid}`);

  return (
    <>
      <Navbar />
      <div className={"chat-shell" + (activeId ? " has-active" : "")}>
        <ConvList activeId={activeId} onSelect={select} meId={meId} onNew={() => setShowNew(true)} />
        {activeConv ? (
          <ConvView conv={activeConv} meId={meId} onBack={() => navigate("/chats")} />
        ) : (
          <section className="chat-main chat-main-empty">
            <div className="chat-placeholder">
              <div className="chat-placeholder-icon">💬</div>
              <p>Выберите беседу или начните новую</p>
              <button className="btn btn-primary" onClick={() => setShowNew(true)}>＋ Новый чат</button>
            </div>
          </section>
        )}
      </div>
      {showNew && <NewChatModal onClose={() => setShowNew(false)} onOpened={(cid) => navigate(`/chats/${cid}`)} />}
    </>
  );
}
