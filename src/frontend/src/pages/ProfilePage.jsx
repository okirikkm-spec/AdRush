import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import TierList from "../components/TierList";
import RatingStars from "../components/RatingStars";
import OtpInput from "../components/OtpInput";
import BannerFramerModal from "../components/BannerFramerModal";
import BannerLayer, { framingOf } from "../components/BannerLayer";
import PasswordField from "../components/PasswordField";
import {
  UserIcon, SettingsIcon, TrophyIcon, MailIcon, ShieldIcon,
  CopyIcon, CheckIcon, EditIcon, ImageIcon, CloseIcon,
} from "../components/icons";
import {
  fetchMe, fetchUserProfile, updateMe, uploadAvatar, changePassword,
  setPrivacy, setup2fa, enable2fa, disable2fa, mediaUrl,
  fetchEmailStatus, requestEmailCode, confirmEmailCode, cancelEmailBinding, unbindEmail,
  uploadBanner, removeBanner, updateBannerFraming,
} from "../services/api";

export default function ProfilePage() {
  const [me, setMe] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  // "public" — то, что видят другие; "account" — приватные настройки входа
  const [tab, setTab] = useState("public");

  const reload = async () => {
    const user = await fetchMe();
    setMe(user);
    const profile = await fetchUserProfile(user.id);
    setReviews(profile.reviews || []);
  };

  useEffect(() => {
    document.title = "Профиль";
    reload().finally(() => setLoading(false));
  }, []);

  if (loading) return (<><Navbar /><div className="page"><div className="state">Загрузка…</div></div></>);
  if (!me) return (<><Navbar /><div className="page"><div className="state error-text">Не удалось загрузить профиль</div></div></>);

  return (
    <>
      <Navbar />
      <div className="page">
        {/* Подзаголовка нет — его нижний отступ (24px) добираем здесь */}
        <h1 className="page-title" style={{ marginBottom: 24 }}>Профиль</h1>

        {/* Мини-профиль — общий для обеих вкладок: это «кто вы» */}
        <ProfileHero me={me} onChanged={setMe} />

        <div className="profile-tabs" role="tablist">
          <button className={`profile-tab ${tab === "public" ? "active" : ""}`}
            role="tab" aria-selected={tab === "public"}
            onClick={() => setTab("public")}><UserIcon /> Профиль</button>
          <button className={`profile-tab ${tab === "account" ? "active" : ""}`}
            role="tab" aria-selected={tab === "account"}
            onClick={() => setTab("account")}><SettingsIcon /> Настройки аккаунта</button>
        </div>

        {tab === "public" && (
          <>
            <PrivacyCard me={me} onSaved={setMe} />

            {/* Тир-лист */}
            <div className="card">
              <div className="card-title"><TrophyIcon /> Мой тир-лист</div>
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
          </>
        )}

        {tab === "account" && (
          <>
            <EmailCard />
            <PasswordCard />
            <TwoFactorCard me={me} onChanged={reload} />
          </>
        )}
      </div>
    </>
  );
}

/**
 * Мини-профиль: обложка, аватарка, имя. Редактирование — по кнопке карандаша:
 * там же меняется отображаемое имя (отдельной карточки в настройках больше нет).
 */
function ProfileHero({ me, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.displayName || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const avatarRef = useRef(null);
  const heroRef = useRef(null);
  const [framerOpen, setFramerOpen] = useState(false);
  /* Пропорции карточки — по ним строятся предпросмотр и рамка кадра. Считаем по
     области, где реально лежит обложка (без рамки карточки), и держим значение
     актуальным: высота меняется, например, при входе в режим правки. */
  const [heroAspect, setHeroAspect] = useState(7);

  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el) return undefined;
    const update = () => {
      const cs = getComputedStyle(el);
      const bw = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
      const bh = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
      const r = el.getBoundingClientRect();
      const w = r.width - bw, h = r.height - bh;
      if (w > 0 && h > 0) setHeroAspect(w / h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Правки обложки копятся локально и уходят на сервер только по «Готово» —
     иначе «Отмена» не смогла бы их откатить: старый файл при замене удаляется. */
  const [draft, setDraft] = useState(null);   // { file, previewUrl } — новая картинка
  const [dropped, setDropped] = useState(false);
  const [framing, setFraming] = useState(framingOf(me));

  // Превью живёт в памяти браузера — освобождаем, чтобы не течь
  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.previewUrl); }, [draft]);

  const bannerUrl = dropped ? null : (draft ? draft.previewUrl : mediaUrl(me.bannerUrl));
  const saved = framingOf(me);
  const framingChanged = framing.scale !== saved.scale || framing.rotate !== saved.rotate
    || framing.offsetX !== saved.offsetX || framing.offsetY !== saved.offsetY;

  const run = async (action) => {
    setBusy(true); setMsg(null);
    try {
      onChanged(await action());
      return true;
    } catch (e) {
      setMsg(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const pickAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";                       // чтобы повторный выбор того же файла сработал
    if (file) run(() => uploadAvatar(file));   // аватарка применяется сразу
  };

  /* ── Окно обложки: выбор файла, предпросмотр и настройка кадра ── */

  /** Файл выбран (кнопкой или перетаскиванием) — кладём в черновик, окно не закрываем. */
  const applyFramer = ({ file, keepOpen, ...next }) => {
    if (file) {
      if (draft) URL.revokeObjectURL(draft.previewUrl);
      setDraft({ file, previewUrl: URL.createObjectURL(file) });
      setDropped(false);
    }
    setFraming(next);
    if (!keepOpen) setFramerOpen(false);
  };

  /** Удаление обложки — тоже отложенное, до «Готово». */
  const dropBanner = () => {
    if (draft) URL.revokeObjectURL(draft.previewUrl);
    setDraft(null);
    setDropped(true);
    setFraming({ scale: 1, rotate: 0, offsetX: 0, offsetY: 0 });
    setFramerOpen(false);
  };

  /** «Готово» — применяем накопленные правки одним заходом. */
  const finishEditing = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setMsg("Имя не может быть пустым"); return; }

    if (trimmed !== (me.displayName || "")) {
      if (!await run(() => updateMe({ displayName: trimmed }))) return;
    }
    if (dropped) {
      if (!await run(removeBanner)) return;
    } else if (draft) {
      // Blob-ссылку не отзываем здесь: пока React не перерисует карточку с новым
      // адресом, она ещё используется как фон. Освободит её эффект по смене draft.
      if (!await run(() => uploadBanner(draft.file, framing))) return;
    } else if (framingChanged && me.bannerUrl) {
      if (!await run(() => updateBannerFraming(framing))) return;
    }

    setDraft(null); setDropped(false); setEditing(false); setMsg(null);
  };

  /** «Отмена» — откатываем всё, включая невыгруженную картинку. */
  const cancel = () => {
    if (draft) URL.revokeObjectURL(draft.previewUrl);
    setDraft(null);
    setDropped(false);
    setName(me.displayName || "");
    setFraming(framingOf(me));
    setEditing(false);
    setMsg(null);
  };

  return (
    <>
    <div ref={heroRef} className={`card profile-hero ${bannerUrl ? "has-banner" : ""}`}>
      <BannerLayer url={bannerUrl} {...framing} />

      <div className="profile-hero-actions">
        {editing ? (
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setFramerOpen(true)}
              disabled={busy} title="Обложка профиля"><ImageIcon /> Обложка</button>
            <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={busy}
              title="Отменить изменения" aria-label="Отменить изменения"><CloseIcon /></button>
            {/* Занимает место карандаша — выход из режима правки */}
            <button className="btn btn-secondary btn-sm" onClick={finishEditing} disabled={busy}
              title="Сохранить и выйти" aria-label="Сохранить и выйти"><CheckIcon /></button>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}
            title="Редактировать профиль" aria-label="Редактировать профиль"><EditIcon /></button>
        )}
      </div>

      <input ref={avatarRef} type="file" accept="image/*" hidden onChange={pickAvatar} />

      <div className="profile-head" style={{ marginBottom: 0 }}>
        <div style={{ cursor: "pointer" }} onClick={() => avatarRef.current?.click()}
          title="Сменить аватарку">
          <Avatar url={me.avatarUrl} name={me.displayName || me.username} size={72} />
        </div>
        <div>
          {editing ? (
            <input className="profile-name-input" value={name} maxLength={60} autoFocus
              placeholder="Отображаемое имя" aria-label="Отображаемое имя"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishEditing();
                if (e.key === "Escape") cancel();
              }} />
          ) : (
            <div className="profile-name">{me.displayName || me.username}</div>
          )}
          <div className="muted" style={{ fontSize: 13 }}>@{me.username}</div>
          <span className="profile-role">{me.role === "ADMIN" ? "Администратор" : "Пользователь"}</span>
        </div>
      </div>

      {msg && <div className="error-text" style={{ marginTop: 12 }}>{msg}</div>}
    </div>

    {/* Вне карточки: у неё overflow: hidden, внутри модалка не всплывёт */}
    {framerOpen && (
      <BannerFramerModal me={me} url={bannerUrl} framing={framing} aspect={heroAspect}
        onApply={applyFramer} onRemove={dropBanner} onClose={() => setFramerOpen(false)} />
    )}
    </>
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

/**
 * Привязка почты: адрес → код из письма → привязка.
 * Три состояния — почта привязана, идёт подтверждение, ничего нет.
 */
function EmailCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [unbindOpen, setUnbindOpen] = useState(false);
  // Фокус в поле кода ставим только сразу после отправки, чтобы не дёргать
  // страницу при обычном открытии профиля с незавершённой заявкой.
  const [justSent, setJustSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [now, setNow] = useState(Date.now());
  // Абсолютные дедлайны: сервер отдаёт секунды, но пересчитывать их нужно локально.
  const deadlines = useRef({ resendAt: 0, expiresAt: 0 });

  const applyStatus = (data) => {
    setStatus(data);
    setNow(Date.now());
    if (data?.pending) {
      deadlines.current = {
        resendAt: Date.now() + data.pending.resendInSeconds * 1000,
        expiresAt: Date.now() + data.pending.expiresInSeconds * 1000,
      };
    }
    return data;
  };

  useEffect(() => {
    fetchEmailStatus().then(applyStatus).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  const pending = status?.pending;
  useEffect(() => {
    if (!pending) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pending]);

  const secondsLeft = (until) => Math.max(0, Math.ceil((until - now) / 1000));
  const resendIn = pending ? secondsLeft(deadlines.current.resendAt) : 0;
  const expiresIn = pending ? secondsLeft(deadlines.current.expiresAt) : 0;

  const run = async (action, okMessage) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      applyStatus(await action());
      if (okMessage) setMsg(okMessage);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // address задаётся явно при повторной отправке: после перезагрузки страницы
  // поле ввода пустое, а адрес известен только из заявки.
  const sendCode = async (address) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const result = await requestEmailCode(address || email);
      // request отдаёт саму заявку, а не полное состояние — оборачиваем.
      applyStatus({ email: null, verifiedAt: null, pending: result });
      setCode("");
      setJustSent(true);
      setMsg(result.delivered === false
        ? "Почта на сервере не настроена — код записан в лог приложения"
        : `Код отправлен на ${result.email}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (await run(() => confirmEmailCode(code), "Почта привязана")) setCode("");
  };

  const cancel = async () => {
    if (await run(() => cancelEmailBinding())) { setCode(""); setMsg(null); }
  };

  const unbind = async (e) => {
    e.preventDefault();
    if (await run(() => unbindEmail(password), "Почта отвязана")) {
      setPassword(""); setUnbindOpen(false); setEmail("");
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-title"><MailIcon /> Почта</div>
        <div className="muted">Загрузка…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title"><MailIcon /> Почта</div>

      {status?.email ? (
        <>
          <div className="badge-info" style={{ marginBottom: 14 }}>
            Привязана почта <b>{status.email}</b>
          </div>
          {unbindOpen ? (
            <>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Подтвердите паролем, чтобы отвязать почту.
              </div>
              <form className="row" onSubmit={unbind}>
                <PasswordField style={{ maxWidth: 260 }} name="current-password" autoComplete="current-password"
                  placeholder="Пароль от аккаунта" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
                <button type="submit" className="btn btn-danger" disabled={busy || !password}>
                  Отвязать
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => { setUnbindOpen(false); setPassword(""); setErr(null); }}>
                  Отмена
                </button>
              </form>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={() => { setUnbindOpen(true); setErr(null); setMsg(null); }}>
              Отвязать почту
            </button>
          )}
        </>
      ) : pending ? (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Код отправлен на <b>{pending.email}</b>. Введите его ниже
            {expiresIn > 0
              ? ` — код действует ещё ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}.`
              : ". Срок действия кода истёк — запросите новый."}
          </div>
          <OtpInput value={code} onChange={setCode} autoFocus={justSent} />
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={confirm} disabled={busy || code.length < 6}>
              Подтвердить
            </button>
            <button className="btn btn-secondary" onClick={() => sendCode(pending.email)}
              disabled={busy || resendIn > 0}>
              {resendIn > 0 ? `Выслать снова (${resendIn} с)` : "Выслать снова"}
            </button>
            <button className="btn btn-secondary" onClick={cancel} disabled={busy}>
              Отмена
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Привяжите почту к аккаунту — мы вышлем на неё код подтверждения.
            Одна почта может быть привязана только к одному аккаунту.
          </div>
          <div className="row">
            <input className="input" style={{ maxWidth: 320 }} type="email"
              placeholder="you@example.com" value={email} autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email && !busy) sendCode(); }} />
            <button className="btn btn-primary" onClick={() => sendCode()} disabled={busy || !email}>
              Выслать код
            </button>
          </div>
        </>
      )}

      {msg && <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>{msg}</div>}
      {err && <div className="error-text" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

function PasswordCard() {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState(null);

  const save = async (e) => {
    e.preventDefault();
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
    <form className="card" onSubmit={save}>
      <div className="card-title">Сменить пароль</div>
      <div className="input-group">
        <PasswordField name="current-password" autoComplete="current-password" placeholder="Текущий пароль"
          value={oldPassword} onChange={(e) => setOld(e.target.value)} />
      </div>
      <div className="input-group">
        <PasswordField name="new-password" autoComplete="new-password" placeholder="Новый пароль"
          value={newPassword} onChange={(e) => setNew(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary">Изменить пароль</button>
      {msg && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
    </form>
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
      <div className="card-title"><ShieldIcon /> Двухфакторная аутентификация</div>

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
                    {copied ? <><CheckIcon /> Скопировано</> : <><CopyIcon /> Копировать ключ</>}
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
