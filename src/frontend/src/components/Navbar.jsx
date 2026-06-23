import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { isAuthenticated, removeToken, fetchMe } from "../services/api";
import { useNotifications } from "../hooks/useNotifications";
import { useChat } from "../ChatContext";
import Avatar from "./Avatar";
import BrandText from "./BrandText";
import NotificationBell, { NotificationList } from "./NotificationBell";
import ThemePicker from "./ThemePicker";

function Bolt() {
  return (
    <span className="bolt">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2 L4 14 h6 l-2 8 11-14 h-6 z" />
      </svg>
    </span>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const authed = isAuthenticated();
  const [me, setMe] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { items, unread, loaded, loadAndMarkRead } = useNotifications(authed);
  const chat = useChat();
  const chatUnread = chat?.unreadTotal || 0;

  useEffect(() => {
    if (authed) fetchMe().then(setMe).catch(() => {});
  }, [authed]);

  const handleLogout = () => {
    removeToken();
    navigate("/login");
  };

  // На мобильных уведомления живут в бургер-меню — открытие меню помечает их прочитанными
  const toggleMenu = () => {
    const next = !menuOpen;
    setMenuOpen(next);
    if (next && authed) loadAndMarkRead();
  };

  const isAdmin = me?.role === "ADMIN";

  return (
    <nav className="navbar">
      <Link className="navbar-logo" to="/" onClick={() => setMenuOpen(false)}>
        <Bolt />
        <BrandText />
      </Link>

      <div className="navbar-actions">
        {/* Редактор оформления (тема, акцент, фон…) — доступен и на мобильных */}
        <ThemePicker />

        {isAdmin && (
          <Link className="btn btn-ghost btn-sm navbar-collapsible" to="/admin">Админка</Link>
        )}

        {authed ? (
          <>
            {/* Чат — доступен и на мобильных (отдельная страница) */}
            <Link className="btn-icon notif-btn" to="/chats" title="Чаты" aria-label="Чаты">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
              </svg>
              {chatUnread > 0 && <span className="notif-dot">{chatUnread > 9 ? "9+" : chatUnread}</span>}
            </Link>
            {/* Колокол — только на десктопе; на мобильных уведомления уходят в бургер */}
            <NotificationBell
              className="navbar-collapsible"
              items={items}
              unread={unread}
              loaded={loaded}
              onOpen={loadAndMarkRead}
            />
            <Link className="navbar-user" to="/profile" title="Профиль">
              <Avatar url={me?.avatarUrl} name={me?.displayName || me?.username} size={30} />
              <span className="navbar-user-name" style={{ fontSize: 14, fontWeight: 600 }}>{me?.displayName || "Профиль"}</span>
            </Link>
            <button className="btn btn-ghost btn-sm navbar-collapsible" onClick={handleLogout}>Выйти</button>
          </>
        ) : (
          <>
            <Link className="btn btn-ghost btn-sm navbar-collapsible" to="/login">Войти</Link>
            <Link className="btn btn-primary btn-sm navbar-collapsible" to="/register">Регистрация</Link>
          </>
        )}

        {/* Бургер — только на мобильных (CSS). Точка = есть непрочитанные уведомления */}
        <button className="btn-icon navbar-burger" aria-label="Меню"
          aria-expanded={menuOpen} onClick={toggleMenu}>
          {menuOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
          {authed && unread > 0 && !menuOpen && (
            <span className="notif-dot">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="notif-backdrop" onClick={() => setMenuOpen(false)} />
          <div className={"navbar-menu" + (authed ? " has-notif" : "")} role="menu">
            {authed && (
              <>
                <div className="navbar-menu-label">Уведомления</div>
                <NotificationList items={items} loaded={loaded} />
                <div className="navbar-menu-divider" />
              </>
            )}

            {authed ? (
              <button className="navbar-menu-item danger" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                <span aria-hidden>⎋</span> Выйти
              </button>
            ) : (
              <>
                <Link className="navbar-menu-item" to="/login" onClick={() => setMenuOpen(false)}>Войти</Link>
                <Link className="navbar-menu-item" to="/register" onClick={() => setMenuOpen(false)}>Регистрация</Link>
              </>
            )}

            {isAdmin && (
              <Link className="navbar-menu-item" to="/admin" onClick={() => setMenuOpen(false)}>
                <span aria-hidden>🛠</span> Админка
              </Link>
            )}
          </div>
        </>
      )}
    </nav>
  );
}
