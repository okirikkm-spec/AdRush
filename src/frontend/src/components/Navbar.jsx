import { Link, useNavigate } from "react-router-dom";
import { useLayoutEffect, useRef, useState } from "react";
import { isAuthenticated, removeToken } from "../services/api";
import { useChat } from "../ChatContext";
import Avatar from "./Avatar";
import BrandText from "./BrandText";
import ThemePicker from "./ThemePicker";
import DrinkSearch from "./DrinkSearch";
import { AdminIcon, GamepadIcon, LoginIcon, LogoutIcon, UserPlusIcon } from "./icons";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const chat = useChat();
  const chatUnread = chat?.unreadTotal || 0;
  // профиль берём из ChatContext (грузится один раз в корне) — без мигания «Профиль» при смене страниц
  const me = chat?.me;

  // Лого и блок действий почти никогда не равны по ширине (например «Войти/Регистрация»
  // против длинного имени профиля) — чтобы поиск в центре шапки был ровно по центру экрана,
  // а не по центру остатка места, обе колонки принудительно делаем шире из них.
  const logoRef = useRef(null);
  const actionsRef = useRef(null);
  const [sideW, setSideW] = useState(0);

  useLayoutEffect(() => {
    const logoEl = logoRef.current;
    const actionsEl = actionsRef.current;
    if (!logoEl || !actionsEl) return;
    const measure = () => setSideW(Math.max(logoEl.offsetWidth, actionsEl.offsetWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(logoEl);
    ro.observe(actionsEl);
    return () => ro.disconnect();
  }, []);

  const handleLogout = () => {
    removeToken();
    navigate("/login");
  };

  const toggleMenu = () => setMenuOpen((v) => !v);

  const isAdmin = me?.role === "ADMIN";

  return (
    <nav className="navbar" style={sideW ? { "--nav-side": `${sideW}px` } : undefined}>
      <Link className="navbar-logo" to="/" onClick={() => setMenuOpen(false)} ref={logoRef}>
        <Bolt />
        <BrandText />
      </Link>

      <DrinkSearch />

      <div className="navbar-actions" ref={actionsRef}>
        <Link className="btn-icon navbar-collapsible" to="/games" title="Мини-игры" aria-label="Мини-игры">
          <GamepadIcon size={18} />
        </Link>

        {isAdmin && (
          <Link className="btn-icon navbar-collapsible" to="/admin" title="Админка" aria-label="Админка">
            <AdminIcon size={18} />
          </Link>
        )}

        {/* Редактор оформления (тема, акцент, фон…) — доступен и на мобильных */}
        <ThemePicker />

        {authed ? (
          <>
            {/* Чат — доступен и на мобильных (отдельная страница) */}
            <Link className="btn-icon notif-btn" to="/chats" title="Чаты" aria-label="Чаты">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
              </svg>
              {chatUnread > 0 && <span className="notif-dot">{chatUnread > 9 ? "9+" : chatUnread}</span>}
            </Link>
            <Link className="navbar-user" to="/profile" title="Профиль">
              <Avatar url={me?.avatarUrl} name={me?.displayName || me?.username} size={30} />
              <span className="navbar-user-name" style={{ fontSize: 14, fontWeight: 600 }}>{me?.displayName || "Профиль"}</span>
            </Link>
            <button className="btn-icon navbar-collapsible" onClick={handleLogout}
              title="Выйти" aria-label="Выйти">
              <LogoutIcon size={18} />
            </button>
          </>
        ) : (
          <>
            <Link className="btn-icon navbar-collapsible" to="/login" title="Войти" aria-label="Войти">
              <LoginIcon size={18} />
            </Link>
            {/* регистрация — главное действие для гостя, поэтому и без слова остаётся акцентной */}
            <Link className="btn-icon btn-icon-accent navbar-collapsible" to="/register"
              title="Регистрация" aria-label="Регистрация">
              <UserPlusIcon size={18} />
            </Link>
          </>
        )}

        {/* Бургер — только на мобильных (CSS) */}
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
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="notif-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="navbar-menu" role="menu">
            <Link className="navbar-menu-item" to="/games" onClick={() => setMenuOpen(false)}>
              <GamepadIcon /> Мини-игры
            </Link>

            {authed ? (
              <button className="navbar-menu-item danger" onClick={() => { setMenuOpen(false); handleLogout(); }}>
                <LogoutIcon /> Выйти
              </button>
            ) : (
              <>
                <Link className="navbar-menu-item" to="/login" onClick={() => setMenuOpen(false)}>
                  <LoginIcon /> Войти
                </Link>
                <Link className="navbar-menu-item" to="/register" onClick={() => setMenuOpen(false)}>
                  <UserPlusIcon /> Регистрация
                </Link>
              </>
            )}

            {isAdmin && (
              <Link className="navbar-menu-item" to="/admin" onClick={() => setMenuOpen(false)}>
                <AdminIcon /> Админка
              </Link>
            )}
          </div>
        </>
      )}
    </nav>
  );
}
