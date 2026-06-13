import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import TierList from "../components/TierList";
import RatingStars from "../components/RatingStars";
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
        </>
      ) : setupData ? (
        <div className="qr-box">
          <p className="muted" style={{ fontSize: 13 }}>
            Отсканируйте QR-код в Google Authenticator / Authy и введите 6-значный код.
          </p>
          <img src={setupData.qrDataUrl} alt="QR код 2FA" />
          <div className="secret-code">{setupData.secret}</div>
          <div className="row">
            <input className="input" style={{ maxWidth: 180 }} inputMode="numeric"
              placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn btn-primary" onClick={confirm}>Подтвердить</button>
          </div>
        </div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Защитите аккаунт приложением-аутентификатором. Код также используется для восстановления пароля.
          </div>
          <button className="btn btn-primary" onClick={startSetup}>Подключить 2FA</button>
        </>
      )}
      {msg && <div className="error-text">{msg}</div>}
    </div>
  );
}
