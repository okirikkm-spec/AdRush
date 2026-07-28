import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import OtpInput from "../components/OtpInput";
import {
  recoverPassword, requestRecoverEmailCode, confirmRecoverEmail,
} from "../services/api";

/**
 * Восстановление пароля двумя способами:
 *  • 2FA — код из приложения-аутентификатора;
 *  • почта — код письмом, доступен аккаунтам без 2FA (иначе почта была бы обходом 2FA).
 */
export default function RecoverPage() {
  const [method, setMethod] = useState("totp");

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Восстановление пароля</h1>
        <p className="auth-subtitle">Выберите, чем подтвердить, что аккаунт ваш</p>

        <div className="profile-tabs tabs-fill" role="tablist" style={{ marginBottom: 18 }}>
          <button className={`profile-tab ${method === "totp" ? "active" : ""}`}
            role="tab" aria-selected={method === "totp"}
            onClick={() => setMethod("totp")}>Аутентификатор</button>
          <button className={`profile-tab ${method === "email" ? "active" : ""}`}
            role="tab" aria-selected={method === "email"}
            onClick={() => setMethod("email")}>Почта</button>
        </div>

        {method === "totp" ? <TotpRecovery /> : <EmailRecovery />}

        <div className="auth-link"><Link to="/login">Вспомнили? Войти</Link></div>
      </div>
    </div>
  );
}

function TotpRecovery() {
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

  if (done) return <div className="badge-info">Пароль изменён! Перенаправляем на вход…</div>;

  return (
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
  );
}

function EmailRecovery() {
  const navigate = useNavigate();
  const [step, setStep] = useState("request");   // request → confirm
  const [username, setUsername] = useState("");
  const [sent, setSent] = useState(null);        // { email, delivered }
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const deadlines = useRef({ resendAt: 0, expiresAt: 0 });

  useEffect(() => {
    if (step !== "confirm") return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const secondsLeft = (until) => Math.max(0, Math.ceil((until - now) / 1000));
  const resendIn = step === "confirm" ? secondsLeft(deadlines.current.resendAt) : 0;
  const expiresIn = step === "confirm" ? secondsLeft(deadlines.current.expiresAt) : 0;

  const sendCode = async (e) => {
    e?.preventDefault();
    setError(null); setNote(null); setLoading(true);
    try {
      const data = await requestRecoverEmailCode(username);
      deadlines.current = {
        resendAt: Date.now() + data.resendInSeconds * 1000,
        expiresAt: Date.now() + data.expiresInSeconds * 1000,
      };
      setNow(Date.now());
      setSent(data);
      setStep("confirm");
      setCode("");
      setNote(data.delivered === false
        ? "Почта на сервере не настроена — код записан в лог приложения"
        : `Код отправлен на ${data.email}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      await confirmRecoverEmail(username, code, newPassword);
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) return <div className="badge-info">Пароль изменён! Перенаправляем на вход…</div>;

  if (step === "request") {
    return (
      <form onSubmit={sendCode}>
        <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Код придёт на почту, привязанную к аккаунту. Способ доступен, если
          не подключена двухфакторная аутентификация.
        </p>
        <div className="input-group">
          <input className="input" placeholder="Логин" value={username}
            onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !username}>
          {loading ? "…" : "Выслать код"}
        </button>
        {error && <div className="error-text">{error}</div>}
      </form>
    );
  }

  return (
    <form onSubmit={confirm}>
      <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
        Код отправлен на <b>{sent?.email}</b>
        {expiresIn > 0
          ? ` — действует ещё ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}.`
          : ". Срок действия истёк — запросите новый."}
      </p>

      <div className="input-group">
        <label className="input-label">Код из письма</label>
        <OtpInput value={code} onChange={setCode} />
      </div>
      <div className="input-group">
        <input className="input" type="password" placeholder="Новый пароль" value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)} required />
      </div>

      <button type="submit" className="btn btn-primary btn-lg"
        disabled={loading || code.length < 6 || !newPassword}>
        {loading ? "…" : "Сбросить пароль"}
      </button>

      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={sendCode} disabled={loading || resendIn > 0}>
          {resendIn > 0 ? `Выслать снова (${resendIn} с)` : "Выслать снова"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm"
          onClick={() => { setStep("request"); setError(null); setNote(null); }}>
          Другой логин
        </button>
      </div>

      {note && <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>{note}</div>}
      {error && <div className="error-text">{error}</div>}
    </form>
  );
}
