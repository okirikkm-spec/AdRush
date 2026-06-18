import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ImageDropZone from "../components/ImageDropZone";
import UserModeration from "../components/UserModeration";
import AuditLog from "../components/AuditLog";
import { fetchMe, createDrink, fetchParseSources, runParse, uploadMonsterCatalog, addDrinkPhoto, addDrinkPhotoByUrl, optimizeMedia } from "../services/api";
import { CheckIcon } from "../components/icons";

export default function AdminPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("catalog");

  useEffect(() => {
    document.title = "Админка — AdRush";
    fetchMe().then(setMe).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return (<><Navbar /><div className="page"><div className="state">Загрузка…</div></div></>);
  if (!me || me.role !== "ADMIN") {
    return (
      <>
        <Navbar />
        <div className="page">
          <div className="state error-text">Доступ только для администратора.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="page">
        <h1 className="page-title">Панель администратора</h1>
        <p className="page-subtitle">Управление каталогом, пользователями и журналом действий</p>

        <div className="admin-tabs" role="tablist">
          <button className={`admin-tab ${tab === "catalog" ? "active" : ""}`}
            onClick={() => setTab("catalog")}>📦 Каталог</button>
          <button className={`admin-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}>👥 Пользователи</button>
          <button className={`admin-tab ${tab === "audit" ? "active" : ""}`}
            onClick={() => setTab("audit")}>📋 Журнал аудита</button>
        </div>

        {tab === "catalog" && (
          <div className="admin-cards">
            <AddDrinkCard onCreated={(d) => navigate(`/drink/${d.id}`)} />
            <ParserCard />
            <MonsterCatalogCard />
            <MediaOptimizeCard />
          </div>
        )}
        {tab === "users" && <UserModeration />}
        {tab === "audit" && <AuditLog />}
      </div>
    </>
  );
}

function AddDrinkCard({ onCreated }) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState(null); // { file } | { url } | null
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setMsg(null);
    setSaving(true);
    try {
      const drink = await createDrink({ name, brand, description });
      if (cover?.file) await addDrinkPhoto(drink.id, cover.file);
      else if (cover?.url) await addDrinkPhotoByUrl(drink.id, cover.url);
      setName(""); setBrand(""); setDescription(""); setCover(null);
      onCreated?.(drink);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">➕ Добавить энергетик</div>
      <div className="input-group">
        <label className="input-label">Название</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Adrenaline Rush Мохито" />
      </div>
      <div className="input-group">
        <label className="input-label">Бренд</label>
        <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)}
          placeholder="Adrenaline Rush" />
      </div>
      <div className="input-group">
        <label className="input-label">Описание</label>
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Вкус, состав, впечатления…" />
      </div>
      <div className="input-group">
        <label className="input-label">Обложка (необязательно)</label>
        <ImageDropZone onSelect={setCover} busy={saving} />
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={saving || !name.trim()}>
        {saving ? "…" : "Создать карточку"}
      </button>
      {msg && <div className="error-text">{msg}</div>}
    </div>
  );
}

function ParserCard() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <div className="card-title">🔄 Парсинг каталогов</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Каталоги автоматически проверяются раз в сутки. Здесь можно запустить парсинг вручную —
        выбрать бренды и режим (только новые или перепарсить все).
      </div>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        Парсинг…
      </button>
      {open && <ParseModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function MonsterCatalogCard() {
  const [file, setFile] = useState(null);
  const [reparse, setReparse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const upload = async () => {
    if (!file) return;
    setMsg(null);
    setError(null);
    setBusy(true);
    try {
      const res = await uploadMonsterCatalog(file, reparse);
      const updated = res.updated || 0;
      setMsg(`Готово. Добавлено новых: ${res.created}` + (reparse ? ` · обновлено: ${updated}` : ""));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">🥤 Каталог Monster (из файла)</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Сайт Monster закрыт Cloudflare для сервера, поэтому каталог загружается вручную.
        Открой <b>monsterenergy.com/en-us/energy-drinks/</b> в браузере, дождись карточек,
        сохрани страницу (Ctrl+S → «Веб-страница, только HTML») и загрузи файл сюда.
      </div>
      <div className="input-group">
        <label className="input-label">HTML-файл каталога</label>
        <input
          className="input"
          type="file"
          accept=".html,.htm,text/html"
          onChange={(e) => { setFile(e.target.files?.[0] || null); setMsg(null); setError(null); }}
        />
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={`seg-btn ${!reparse ? "on" : ""}`} onClick={() => setReparse(false)}>
          <span className="seg-title">Только новые</span>
          <span className="seg-sub">Добавить отсутствующие</span>
        </button>
        <button type="button" className={`seg-btn ${reparse ? "on" : ""}`} onClick={() => setReparse(true)}>
          <span className="seg-title">Перепарсить всё</span>
          <span className="seg-sub">Обновить существующие</span>
        </button>
      </div>
      <button className="btn btn-primary" onClick={upload} disabled={busy || !file}>
        {busy ? "Загрузка…" : "Загрузить и спарсить"}
      </button>
      {error && <div className="error-text">{error}</div>}
      {msg && <div className="picker-result" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

function MediaOptimizeCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setMsg(null);
    setError(null);
    setBusy(true);
    try {
      const r = await optimizeMedia();
      setMsg(`Готово. Скачано: ${r.downloaded} · превью: ${r.thumbnailed} · `
        + `пропущено: ${r.skipped} · ошибок: ${r.failed}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">🖼️ Оптимизация изображений</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Скачивает внешние картинки (Monster и т.п.) в наше хранилище и создаёт лёгкие превью —
        карточки на главной грузятся быстрее. Внешние ссылки за Cloudflare/CDN могут не скачаться
        с боевого сервера (попадут в «ошибки») — тогда запускайте там, где сайт-источник доступен.
      </div>
      <button className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? "Обработка…" : "Оптимизировать медиа"}
      </button>
      {error && <div className="error-text">{error}</div>}
      {msg && <div className="picker-result" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

function ParseModal({ onClose }) {
  const [sources, setSources] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [reparse, setReparse] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchParseSources()
      .then((list) => { setSources(list); setSelected(new Set(list)); })
      .catch((e) => setError(e.message));
  }, []);

  const toggle = (brand) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(brand) ? next.delete(brand) : next.add(brand);
      return next;
    });
  };

  const allSelected = sources.length > 0 && sources.every((b) => selected.has(b));
  const setAll = () => setSelected(allSelected ? new Set() : new Set(sources));

  const run = async () => {
    setMsg(null);
    setError(null);
    setRunning(true);
    try {
      const res = await runParse({ brands: [...selected], reparse });
      const updated = res.updated || 0;
      setMsg(`Готово. Добавлено новых: ${res.created}` + (reparse ? ` · обновлено: ${updated}` : ""));
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-picker" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="picker-head">
          <div className="picker-head-main">
            <span className="picker-icon">🔄</span>
            <div>
              <h2 className="picker-title">Парсинг каталогов</h2>
              <p className="picker-sub">Выберите бренды и режим обновления</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="picker-body">
          <div className="picker-section-label">Бренды</div>
          {sources.length === 0 && !error && <div className="muted" style={{ fontSize: 13 }}>Загрузка…</div>}
          {sources.length > 0 && (
            <>
              <button type="button" className={`opt opt-all ${allSelected ? "sel" : ""}`} onClick={setAll}>
                <span className="opt-check">{allSelected && <CheckIcon />}</span>
                <span className="opt-label">Все каталоги</span>
                <span className="opt-meta">{sources.length}</span>
              </button>
              <div className="picker-divider" />
              <div className="opt-list">
                {sources.map((brand) => (
                  <button
                    type="button" key={brand}
                    className={`opt ${selected.has(brand) ? "sel" : ""}`}
                    onClick={() => toggle(brand)}
                  >
                    <span className="opt-check">{selected.has(brand) && <CheckIcon />}</span>
                    <span className="opt-label">{brand}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="picker-section-label" style={{ marginTop: 18 }}>Режим</div>
          <div className="seg">
            <button type="button" className={`seg-btn ${!reparse ? "on" : ""}`} onClick={() => setReparse(false)}>
              <span className="seg-title">Только новые</span>
              <span className="seg-sub">Добавить отсутствующие</span>
            </button>
            <button type="button" className={`seg-btn ${reparse ? "on" : ""}`} onClick={() => setReparse(true)}>
              <span className="seg-title">Перепарсить всё</span>
              <span className="seg-sub">Обновить существующие</span>
            </button>
          </div>

          {error && <div className="error-text">{error}</div>}
          {msg && <div className="picker-result">{msg}</div>}
        </div>

        <div className="picker-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={running}>Закрыть</button>
          <button className="btn btn-primary" onClick={run} disabled={running || selected.size === 0}>
            {running ? "Парсинг…" : "Запустить"}
          </button>
        </div>
      </div>
    </div>
  );
}
