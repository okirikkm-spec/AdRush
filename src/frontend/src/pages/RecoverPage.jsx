import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { recoverPassword } from "../services/api";

export default function RecoverPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await recoverPassword(username, code, newPassword);
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Восстановление пароля</h1>
        <p className="auth-subtitle">По коду из приложения-аутентификатора (2FA)</p>

        {done ? (
          <div className="badge-info">Пароль изменён! Перенаправляем на вход…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <input className="input" placeholder="Логин" value={username}
                onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </div>
            <div className="input-group">
              <label className="input-label">Код из аутентификатора</label>
              <input className="input" inputMode="numeric" placeholder="000000" value={code}
                onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="input-group">
              <input className="input" type="password" placeholder="Новый пароль" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
              {loading ? "…" : "Сбросить пароль"}
            </button>
            {error && <div className="error-text">{error}</div>}
          </form>
        )}

        <div className="auth-link"><Link to="/login">Вспомнили? Войти</Link></div>
      </div>
    </div>
  );
}
