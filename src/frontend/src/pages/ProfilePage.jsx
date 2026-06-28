import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import TierList from "../components/TierList";
import RatingStars from "../components/RatingStars";
import OtpInput from "../components/OtpInput";
import {
  fetchMe, fetchUserProfile, updateMe, uploadAvatar, changePassword,
  setPrivacy, setup2fa, enable2fa, disable2fa,
} from "../services/api";

export default function ProfilePage() {
  const [me, setMe] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  const reload = async () => {
    const user = await fetchMe();
    setMe(user);
    const profile = await fetchUserProfile(user.id);
    setReviews(profile.reviews || []);
  };

  useEffect(() => {
    document.title = "Мой профиль — AdRush";
    reload().finally(() => setLoading(false));
  }, []);

  if (loading) return (<><Navbar /><div className="page"><div className="state">Загрузка…</div></div></>);
  if (!me) return (<><Navbar /><div className="page"><div className="state error-text">Не удалось загрузить профиль</div></div></>);

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const updated = await uploadAvatar(file);
      setMe(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <>
      <Navbar />
      <div className="page">
        <h1 className="page-title">Профиль</h1>
        <p className="page-subtitle">Настройки аккаунта и ваши оценки</p>

        {/* Шапка */}
        <div className="card">
          <div className="profile-head">
            <div style={{ cursor: "pointer" }} onClick={() => fileRef.current?.click()} title="Сменить аватарку">
              <Avatar url={me.avatarUrl} name={me.displayName || me.username} size={72} />
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatar} />
            <div>
              <div className="profile-name">{me.displayName || me.username}</div>
              <div className="muted" style={{ fontSize: 13 }}>@{me.username}</div>
              <span className="profile-role">{me.role === "ADMIN" ? "Администратор" : "Пользователь"}</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
            Загрузить аватарку
          </button>
        </div>

        <DisplayNameCard me={me} onSaved={setMe} />
        <PrivacyCard me={me} onSaved={setMe} />
        <PasswordCard />
        <TwoFactorCard me={me} onChanged={reload} />

        {/* Тир-лист */}
        <div className="card">
          <div className="card-title">🏆 Мой тир-лист</div>
          <TierList reviews={reviews} />
        </div>

        {/* Мои отзывы */}
        <div className="card">
          <div className="card-title">Мои отзывы ({reviews.length})</div>
          {reviews.length === 0 ? (
            <div className="muted">Вы ещё не оставили ни одного отзыва.</div>
          ) : (
            <div className="review-list">
              {reviews.map((r) => (
                <div key={r.id} className="review">
                  <div className="review-head">
                    <Link to={`/drink/${r.drinkId}`} className="review-author">{r.drinkName}</Link>
                    <span className="review-rating">★ {r.rating}/10</span>
                  </div>
                  <RatingStars value={r.rating} readonly size={15} />
                  {r.text && <div className="review-text" style={{ marginTop: 6 }}>{r.text}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DisplayNameCard({ me, onSaved }) {
  const [name, setName] = useState(me.displayName || "");
  const [msg, setMsg] = useState(null);

  const save = async () => {
    try {
      const updated = await updateMe({ displayName: name });
      onSaved(updated);
      setMsg("Сохранено");
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="card">
      <div className="card-title">Отображаемое имя</div>
      <div className="row">
        <input className="input" style={{ maxWidth: 320 }} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-primary" onClick={save}>Сохранить</button>
      </div>
      {msg && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}

function PrivacyCard({ me, onSaved }) {
  const [isPrivate, setIsPrivate] = useState(me.profilePrivate);

  const toggle = async () => {
    const next = !isPrivate;
    setIsPrivate(next);
    try {
      const updated = await setPrivacy(next);
      onSaved(updated);
    } catch (e) {
      setIsPrivate(!next);
      alert(e.message);
    }
  };

  return (
    <div className="card">
      <div className="row-between">
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>Закрытый профиль</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Когда включено, другие не видят ваши отзывы и тир-лист.
          </div>
        </div>
        <label className="switch-label">
          <input type="checkbox" checked={isPrivate} onChange={toggle} />
          {isPrivate ? "Закрыт" : "Открыт"}
        </label>
      </div>
    </div>
  );
}

function PasswordCard() {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState(null);

  const save = async () => {
    setMsg(null);
    try {
      await changePassword(oldPassword, newPassword);
      setMsg("Пароль изменён");
      setOld(""); setNew("");
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="card">
      <div className="card-title">Сменить пароль</div>
      <div className="input-group">
        <input className="input" type="password" placeholder="Текущий пароль"
          value={oldPassword} onChange={(e) => setOld(e.target.value)} />
      </div>
      <div className="input-group">
        <input className="input" type="password" placeholder="Новый пароль"
          value={newPassword} onChange={(e) => setNew(e.target.value)} />
      </div>
      <button className="btn btn-primary" onClick={save}>Изменить пароль</button>
      {msg && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}

function TwoFactorCard({ me, onChanged }) {
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  const cancelSetup = () => { setSetupData(null); setCode(""); setMsg(null); };
  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* буфер недоступен */ }
  };

  const startSetup = async () => {
    setMsg(null);
    try {
      const data = await setup2fa();
      setSetupData(data);
    } catch (e) {
      setMsg(e.message);
    }
  };

  const confirm = async () => {
    setMsg(null);
    try {
      await enable2fa(code);
      setSetupData(null);
      setCode("");
      await onChanged();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const turnOff = async () => {
    setMsg(null);
    try {
      await disable2fa(code);
      setCode("");
      await onChanged();
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <div className="card">
      <div className="card-title">🔐 Двухфакторная аутентификация</div>

      {me.totpEnabled ? (
        <>
          <div className="badge-info" style={{ marginBottom: 14 }}>
            2FA включена. Также её код позволяет восстановить пароль, если вы его забудете.
          </div>
          <div className="row">
            <input className="input" style={{ maxWidth: 180 }} inputMode="numeric"
              placeholder="Код для отключения" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-danger" onClick={turnOff}>Отключить 2FA</button>
          </div>
          {msg && <div className="error-text">{msg}</div>}
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Защитите аккаунт приложением-аутентификатором. Код также используется для восстановления пароля.
          </div>
          <button className="btn btn-primary" onClick={startSetup}>Подключить 2FA</button>
          {!setupData && msg && <div className="error-text">{msg}</div>}
        </>
      )}

      {setupData && (
        <div className="modal-overlay" onMouseDown={cancelSetup}>
          <div className="modal twofa-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog">
            <div className="twofa-head">
              <h2 className="twofa-title">Настройка аутентификатора</h2>
              <button className="modal-close" onClick={cancelSetup} aria-label="Закрыть">×</button>
            </div>

            <div className="twofa-section">
              <div className="twofa-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /></svg>
                Сканируйте QR-код
              </div>
              <p className="twofa-hint">Отсканируйте QR-код в приложении-аутентификаторе (Google Authenticator, Authy) или введите ключ вручную.</p>
              <div className="twofa-qr-row">
                <img className="twofa-qr" src={setupData.qrDataUrl} alt="QR код 2FA" />
                <div className="twofa-manual">
                  <div className="twofa-manual-label">Не сканируется? Введите ключ вручную:</div>
                  <div className="twofa-secret">{setupData.secret}</div>
                  <button className="btn btn-secondary btn-sm twofa-copy" onClick={copySecret}>
                    {copied ? "✓ Скопировано" : "⧉ Копировать ключ"}
                  </button>
                </div>
              </div>
            </div>

            <div className="twofa-section">
              <div className="twofa-section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M17 14H7" /></svg>
                Введите код подтверждения
              </div>
              <p className="twofa-hint">Введите 6-значный код из приложения-аутентификатора.</p>
              <OtpInput value={code} onChange={setCode} />
            </div>

            {msg && <div className="error-text" style={{ marginBottom: 4 }}>{msg}</div>}

            <div className="twofa-foot">
              <button className="btn btn-secondary" onClick={cancelSetup}>Отмена</button>
              <button className="btn btn-primary" onClick={confirm} disabled={code.length < 6}>Подтвердить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
