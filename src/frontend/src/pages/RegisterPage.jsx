import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register, saveToken } from "../services/api";
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await register(username, password);
      saveToken(token);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand"><Bolt /> <BrandText /></div>
        <h1 className="auth-title">Регистрация</h1>
        <p className="auth-subtitle">Только логин и пароль — без почты</p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input className="input" placeholder="Логин" value={username}
              onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </div>
          <div className="input-group">
            <input className="input" type="password" placeholder="Пароль (мин. 4 символа)" value={password}
              onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? "…" : "Создать аккаунт"}
          </button>
          {error && <div className="error-text">{error}</div>}
        </form>

        <div className="auth-link"><Link to="/login">Уже есть аккаунт? Войти</Link></div>
      </div>
    </div>
  );
}
