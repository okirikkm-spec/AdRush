import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import { useChat } from "../ChatContext";
import { useTheme } from "../ThemeContext";
import { searchChatUsers, mediaUrl } from "../services/api";

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

/** URL аватара беседы: фото группы или аватар собеседника в личке. */
const convAvatarUrl = (conv, meId) =>
  conv?.type === "GROUP" ? conv?.avatarUrl : convAvatarUser(conv, meId)?.avatarUrl;

/** Беседа со служебным аккаунтом «Система» (уведомления) — только для чтения. */
const isSystemConv = (conv, meId) =>
  conv?.type === "DIRECT" && !!otherMember(conv, meId)?.user?.system;

const fmtTime = (iso) => {
  try { return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const fmtDay = (iso) => {
  try { return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }
  catch { return ""; }
};

/** Короткое превью сообщения для списка бесед (картинки/карточки без текста). */
const msgPreview = (m) => {
  if (!m) return "";
  if (m.imageUrl) return "📷 Фото";
  if (m.sharedDrink) return `🥤 ${m.sharedDrink.name}`;
  if (m.sharedReview) return `💬 Отзыв · ${m.sharedReview.drinkName || ""}`;
  if (m.sharedTheme) return `🎨 Тема · ${m.sharedTheme.name || "оформление"}`;
  return m.content;
};

/** Карточка энергетика внутри сообщения (кликабельна → /drink/:id). */
function SharedDrink({ drink }) {
  return (
    <Link to={`/drink/${drink.id}`} className="chat-card chat-card-drink">
      {drink.coverUrl
        ? <img className="chat-card-cover" src={mediaUrl(drink.coverUrl)} alt="" loading="lazy" />
        : <div className="chat-card-cover chat-card-cover-empty">⚡</div>}
      <div className="chat-card-info">
        <div className="chat-card-title">{drink.name}</div>
        {drink.brand && <div className="chat-card-sub">{drink.brand}</div>}
        <div className="chat-card-meta">★ {drink.averageRating > 0 ? drink.averageRating.toFixed(1) : "—"} · {drink.reviewCount} оц.</div>
      </div>
    </Link>
  );
}

/** Карточка отзыва внутри сообщения (кликабельна → /drink/:id энергетика отзыва). */
function SharedReview({ review }) {
  return (
    <Link to={`/drink/${review.drinkId}?review=${review.id}`} className="chat-card chat-card-review">
      <div className="chat-card-review-head">
        <Avatar url={review.authorAvatarUrl} name={review.authorName} size={24} />
        <span className="chat-card-review-author">{review.authorName}</span>
        <span className="chat-card-review-rating">★ {review.rating}/10</span>
      </div>
      <div className="chat-card-sub">об энергетике «{review.drinkName}»</div>
      {review.text && <div className="chat-card-review-text">{review.text}</div>}
    </Link>
  );
}

/** Карточка темы оформления внутри сообщения: превью, «Предпросмотр» (примерить без сохранения) и «Применить». */
function SharedTheme({ theme }) {
  const { setAccent, setBg, setRadius, setBgAnim, previewTheme, endPreview } = useTheme();
  const [applied, setApplied] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Если ушли со страницы / размонтировались во время предпросмотра — вернуть сохранённую тему.
  useEffect(() => () => { if (previewing) endPreview(); }, [previewing, endPreview]);

  const togglePreview = () => {
    if (previewing) { endPreview(); setPreviewing(false); }
    else { previewTheme(theme); setPreviewing(true); }
  };

  const apply = () => {
    setAccent(theme.accent);
    setBg(theme.bg);
    if (typeof theme.radius === "number") setRadius(theme.radius);
    setBgAnim(!!theme.bgAnim);
    setPreviewing(false);
    setApplied(true);
  };

  return (
    <div className="chat-card chat-card-theme">
      <div className="chat-card-theme-row">
        <div className="chat-theme-preview" style={{ background: theme.bg }}>
          <span className="chat-theme-dot" style={{ background: theme.accent }} />
        </div>
        <div className="chat-card-info">
          <div className="chat-card-title">🎨 {theme.name || "Тема оформления"}</div>
          <div className="chat-card-sub">{previewing ? "Это предпросмотр — пролистайте сайт" : "Акцент, фон и скругление"}</div>
        </div>
      </div>
      <div className="chat-theme-actions">
        <button type="button" className={"btn btn-sm " + (previewing ? "btn-primary" : "btn-secondary")}
          onClick={togglePreview} disabled={applied}>
          {previewing ? "Вернуть" : "Предпросмотр"}
        </button>
        <button type="button" className="btn btn-primary btn-sm"
          onClick={apply} disabled={applied}>
          {applied ? "Применено ✓" : "Применить"}
        </button>
      </div>
    </div>
  );
}

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

/* ─────────────── Модалка «Участники группы» ─────────────── */

function MembersModal({ conv, meId, onClose }) {
  const navigate = useNavigate();
  const { setAvatar, rename } = useChat();
  const members = conv.members || [];
  const fileRef = useRef(null);
  const [title, setTitle] = useState(conv.title || "");
  const [busy, setBusy] = useState(false);

  const onPickAvatar = (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setBusy(true);
    setAvatar(conv.id, f).catch(() => {}).finally(() => setBusy(false));
  };
  const saveTitle = () => {
    const t = title.trim();
    if (!t || t === conv.title) return;
    setBusy(true);
    rename(conv.id, t).catch(() => {}).finally(() => setBusy(false));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-picker" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <div className="picker-head-main">
            <div className="picker-icon">👥</div>
            <div>
              <div className="picker-title">{conv.title || "Группа"}</div>
              <div className="picker-sub">{members.length} участников</div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="picker-body">
          <div className="group-settings">
            <button type="button" className="group-avatar-edit" onClick={() => fileRef.current?.click()}
              disabled={busy} title="Сменить фото группы">
              <Avatar url={conv.avatarUrl} name={conv.title || "Группа"} size={64} />
              <span className="group-avatar-cam" aria-hidden>📷</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickAvatar} />
            <div className="group-rename">
              <input className="input" value={title} maxLength={80}
                onChange={(e) => setTitle(e.target.value)} placeholder="Название группы" />
              <button className="btn btn-secondary btn-sm" onClick={saveTitle}
                disabled={busy || !title.trim() || title.trim() === conv.title}>Сохранить</button>
            </div>
          </div>
          <div className="chat-search-results">
            {members.map((m) => (
              <button key={m.user.id} type="button" className="chat-user-row"
                onClick={() => navigate(`/user/${m.user.id}`)}>
                <Avatar url={m.user.avatarUrl} name={m.user.displayName} size={34} />
                <div className="chat-user-info">
                  <div className="chat-user-name">{m.user.displayName}{m.user.id === meId ? " (вы)" : ""}</div>
                  <div className="chat-user-login">@{m.user.username}{m.owner ? " · владелец" : ""}</div>
                </div>
              </button>
            ))}
          </div>
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
          return (
            <button key={c.id} type="button"
              className={"chat-conv" + (c.id === activeId ? " active" : "")}
              onClick={() => onSelect(c.id)}>
              <Avatar url={convAvatarUrl(c, meId)} name={convTitle(c, meId)} size={46} />
              <div className="chat-conv-body">
                <div className="chat-conv-top">
                  <span className="chat-conv-name">{convTitle(c, meId)}</span>
                  {c.lastMessage && <span className="chat-conv-time">{fmtTime(c.lastMessage.createdAt)}</span>}
                </div>
                <div className="chat-conv-bottom">
                  <span className="chat-conv-preview">
                    {c.lastMessage
                      ? (c.type === "GROUP" ? `${c.lastMessage.sender.displayName}: ` : "") + msgPreview(c.lastMessage)
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
  const { messages, typing, send, sendImage, sendTyping, loadMore, leave } = useChat();
  const list = messages[conv.id];
  const systemConv = isSystemConv(conv, meId);
  const [text, setText] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const lastTyping = useRef(0);
  const navigate = useNavigate();

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) sendImage(conv.id, file).catch(() => {});
  };

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

  // клик по имени в шапке: личный чат → профиль собеседника, группа → список участников
  const openTitle = () => {
    if (conv.type === "GROUP") { setShowMembers(true); return; }
    const o = otherMember(conv, meId);
    if (o?.user?.id) navigate(`/user/${o.user.id}`);
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
        <button type="button" className="chat-main-head-card" onClick={openTitle}
          title={conv.type === "GROUP" ? "Участники группы" : "Открыть профиль"}>
          <Avatar url={convAvatarUrl(conv, meId)} name={convTitle(conv, meId)} size={38} />
          <div className="chat-main-head-info">
            <div className="chat-main-title">{convTitle(conv, meId)}</div>
            <div className="chat-main-sub">
              {conv.type === "GROUP" ? `${conv.members?.length || 0} участников` : `@${otherMember(conv, meId)?.user.username || ""}`}
            </div>
          </div>
        </button>
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
          const day = fmtDay(m.createdAt);
          const showDay = day !== lastDay; lastDay = day;
          if (m.service) {
            return (
              <div key={m.id}>
                {showDay && <div className="chat-day">{day}</div>}
                <div className="chat-service-msg">{m.content}</div>
              </div>
            );
          }
          const mine = m.sender.id === meId;
          const read = mine && otherRead != null && otherRead >= new Date(m.createdAt).getTime();
          return (
            <div key={m.id}>
              {showDay && <div className="chat-day">{day}</div>}
              <div className={"chat-msg" + (mine ? " mine" : "")}>
                {!mine && conv.type === "GROUP" && <Avatar url={m.sender.avatarUrl} name={m.sender.displayName} size={28} />}
                <div className={"chat-bubble" + ((m.imageUrl || m.sharedDrink || m.sharedReview || m.sharedTheme) ? " has-media" : "")}>
                  {!mine && conv.type === "GROUP" && <div className="chat-bubble-author">{m.sender.displayName}</div>}
                  {m.imageUrl && (
                    <img className="chat-bubble-img" src={mediaUrl(m.imageUrl)} alt="Картинка" loading="lazy"
                      onClick={() => setLightbox(mediaUrl(m.imageUrl))} />
                  )}
                  {m.sharedDrink && <SharedDrink drink={m.sharedDrink} />}
                  {m.sharedReview && <SharedReview review={m.sharedReview} />}
                  {m.sharedTheme && <SharedTheme theme={m.sharedTheme} />}
                  {m.content && <span className="chat-bubble-text">{m.content}</span>}
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

      {systemConv ? (
        <div className="chat-readonly">🔔 Системные уведомления — отвечать нельзя</div>
      ) : (
        <>
          <div className="chat-typing-line">{typers.length > 0 && `${typers.join(", ")} печатает…`}</div>

          <div className="chat-composer">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            <button type="button" className="chat-attach" title="Прикрепить картинку"
              onClick={() => fileRef.current?.click()} aria-label="Картинка">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
            <textarea className="input" rows={1} value={text} onChange={onInput} onKeyDown={onKeyDown} placeholder="Сообщение…" />
            <button className="btn btn-primary chat-send" onClick={doSend} disabled={!text.trim()} aria-label="Отправить">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20.5v-6l8-2-8-2v-6l19 8z" /></svg>
            </button>
          </div>
        </>
      )}

      {showAdd && <AddMembersModal conv={conv} onClose={() => setShowAdd(false)} />}
      {showMembers && <MembersModal conv={conv} meId={meId} onClose={() => setShowMembers(false)} />}

      {lightbox && (
        <div className="chat-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="chat-lightbox-close" onClick={() => setLightbox(null)} aria-label="Закрыть">×</button>
        </div>
      )}
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

  // чат занимает весь экран — запрещаем прокрутку страницы (особенно на мобильных)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // отметить активную беседу + подгрузить сообщения
  useEffect(() => {
    if (activeId) chat?.setActive(activeId);
    return () => chat?.setActive(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // заголовок вкладки: «Чат» в списке бесед, имя собеседника / название группы — в открытой
  useEffect(() => {
    document.title = activeConv ? convTitle(activeConv, meId) : "Чат";
  }, [activeConv, meId]);

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
              <div className="chat-placeholder-icon">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
                </svg>
              </div>
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
