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

export default function Navbar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const authed = isAuthenticated();
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (authed) fetchMe().then(setMe).catch(() => {});
  }, [authed]);

  const handleLogout = () => {
    removeToken();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <Link className="navbar-logo" to="/">
        <Bolt />
        <BrandText />
      </Link>

      <div className="navbar-actions">
        <button className="btn-icon" onClick={toggleTheme} title="Сменить тему" aria-label="Сменить тему">
          {theme === "dark" ? (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
            </svg>
          )}
        </button>

        {me?.role === "ADMIN" && (
          <Link className="btn btn-ghost btn-sm" to="/admin">Админка</Link>
        )}

        {authed ? (
          <>
            <NotificationBell />
            <Link className="navbar-user" to="/profile" title="Профиль">
              <Avatar url={me?.avatarUrl} name={me?.displayName || me?.username} size={30} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{me?.displayName || "Профиль"}</span>
            </Link>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Выйти</button>
          </>
        ) : (
          <>
            <Link className="btn btn-ghost btn-sm" to="/login">Войти</Link>
            <Link className="btn btn-primary btn-sm" to="/register">Регистрация</Link>
          </>
        )}
      </div>
    </nav>
  );
}
