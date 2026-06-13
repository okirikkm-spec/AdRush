import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, saveToken } from "../services/api";
import BrandText from "../components/BrandText";

function Bolt() {
  return (
    <span className="bolt">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 2 L4 14 h6 l-2 8 11-14 h-6 z" />
      </svg>
    </span>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await login(username, password, needs2fa ? code : undefined);
      saveToken(token);
      navigate("/");
    } catch (err) {
      if (err.requires2fa) {
        setNeeds2fa(true);
        setError(code ? "Неверный код — попробуйте ещё раз" : null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><Bolt /> <BrandText /></div>
        <h1 className="auth-title">Вход</h1>
        <p className="auth-subtitle">Войдите по логину и паролю</p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input className="input" placeholder="Логин" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus required disabled={needs2fa} />
          </div>
          <div className="input-group">
            <input className="input" type="password" placeholder="Пароль" value={password}
              onChange={(e) => setPassword(e.target.value)} required disabled={needs2fa} />
          </div>

          {needs2fa && (
            <div className="input-group">
              <label className="input-label">Код из приложения-аутентификатора</label>
              <input className="input" inputMode="numeric" placeholder="000000" value={code}
                onChange={(e) => setCode(e.target.value)} autoFocus required />
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? "…" : needs2fa ? "Подтвердить" : "Войти"}
          </button>
          {error && <div className="error-text">{error}</div>}
        </form>

        <div className="auth-link"><Link to="/register">Нет аккаунта? Зарегистрируйтесь</Link></div>
        <div className="auth-link"><Link to="/recover">Забыли пароль? Восстановить по 2FA</Link></div>
      </div>
    </div>
  );
}
