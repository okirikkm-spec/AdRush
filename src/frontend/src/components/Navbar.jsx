import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { isAuthenticated, removeToken, fetchMe } from "../services/api";
import { useTheme } from "../ThemeContext";
import Avatar from "./Avatar";
import BrandText from "./BrandText";
import NotificationBell from "./NotificationBell";

function Bolt() {
  return (
    <span className="bolt">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2 L4 14 h6 l-2 8 11-14 h-6 z" />
      </svg>
    </span>
  );
}

function ThemeIcon({ theme }) {
  return theme === "dark" ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
    </svg>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const authed = isAuthenticated();
  const [me, setMe] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (authed) fetchMe().then(setMe).catch(() => {});
  }, [authed]);

  const handleLogout = () => {
    removeToken();
    navigate("/login");
  };

  const isAdmin = me?.role === "ADMIN";

  return (
    <nav className="navbar">
      <Link className="navbar-logo" to="/" onClick={() => setMenuOpen(false)}>
        <Bolt />
        <BrandText />
      </Link>

      <div className="navbar-actions">
        {/* На десктопе — обычные кнопки; на мобильных они прячутся в бургер */}
        <button className="btn-icon navbar-collapsible" onClick={toggleTheme} title="Сменить тему" aria-label="Сменить тему">
          <ThemeIcon theme={theme} />
        </button>

        {isAdmin && (
          <Link className="btn btn-ghost btn-sm navbar-collapsible" to="/admin">Админка</Link>
        )}

        {authed ? (
          <>
            <NotificationBell />
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

        {/* Бургер — только на мобильных (CSS) */}
        <button className="btn-icon navbar-burger" aria-label="Меню"
          aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
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

            <div className="navbar-menu-divider" />

            <button className="navbar-menu-item" onClick={() => { toggleTheme(); setMenuOpen(false); }}>
              <ThemeIcon theme={theme} />
              {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
