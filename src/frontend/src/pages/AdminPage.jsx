import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ImageDropZone from "../components/ImageDropZone";
import BackgroundEditor from "../components/BackgroundEditor";
import UserModeration from "../components/UserModeration";
import AuditLog from "../components/AuditLog";
import ParseStagingModal from "../components/ParseStagingModal";
import { BoxIcon, UsersIcon, ClipboardIcon, PlusIcon, RefreshIcon, ImageIcon } from "../components/icons";
import {
  fetchMe, createDrink, fetchParseCandidates, addDrinkPhoto, addDrinkPhotoByUrl, optimizeMedia,
  cleanupDescriptions, fetchImageForEditing,
} from "../services/api";

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
            onClick={() => setTab("catalog")}><BoxIcon /> Каталог</button>
          <button className={`admin-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}><UsersIcon /> Пользователи</button>
          <button className={`admin-tab ${tab === "audit" ? "active" : ""}`}
            onClick={() => setTab("audit")}><ClipboardIcon /> Журнал аудита</button>
        </div>

        {tab === "catalog" && (
          <div className="admin-cards">
            <AddDrinkCard onCreated={(d) => navigate(`/drink/${d.id}`)} />
            {/* Оптимизация идёт прямо под парсингом: она обслуживает те же
                картинки, что приходят из каталогов */}
            <div className="admin-col">
              <ParserCard />
              <MediaOptimizeCard />
              <DescriptionCleanupCard />
            </div>
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
  const [bgMode, setBgMode] = useState("none"); // none | auto | manual
  const [editing, setEditing] = useState(null); // файл, открытый в редакторе фона
  const [edited, setEdited] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setMsg(null);
    setSaving(true);
    try {
      const drink = await createDrink({ name, brand, description });
      // обложку из редактора вырезать повторно не надо — она уже с прозрачностью
      if (cover?.file) await addDrinkPhoto(drink.id, cover.file, bgMode === "auto");
      else if (cover?.url) await addDrinkPhotoByUrl(drink.id, cover.url, bgMode === "auto");
      setName(""); setBrand(""); setDescription(""); setCover(null);
      setBgMode("none"); setEdited(false);
      onCreated?.(drink);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title"><PlusIcon /> Добавить энергетик</div>
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
        <ImageDropZone
          onSelect={async (sel) => {
            if (bgMode !== "manual") { setCover(sel); setEdited(false); return; }
            if (sel.file) { setEditing(sel.file); return; }
            // ссылку сначала тянем через наш сервер: иначе редактор не сможет её открыть
            setMsg(null);
            try {
              setEditing(await fetchImageForEditing(sel.url));
            } catch (e) {
              setMsg(e.message);
              setCover(sel);
            }
          }}
          busy={saving} bgMode={bgMode} onBgMode={setBgMode} />
        {edited && <div className="muted imgdrop-note">Фон обложки отредактирован.</div>}
        {editing && (
          <BackgroundEditor
            source={editing}
            title="Обложка: редактор фона"
            fileName="cover.png"
            onCancel={() => setEditing(null)}
            onApply={async (png) => { setCover({ file: png }); setEdited(true); setEditing(null); }}
          />
        )}
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
  const [pending, setPending] = useState(null);

  useEffect(() => {
    fetchParseCandidates("PENDING")
      .then((r) => setPending(r.counts?.pending ?? 0))
      .catch(() => {});
  }, [open]);

  return (
    <div className="card">
      <div className="card-title"><RefreshIcon /> Парсинг каталогов</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Каталоги проверяются раз в сутки, но карточки сами не создаются: найденное ждёт в приёмке.
        Откройте её, отметьте нужные напитки (названия можно поправить на месте) и добавьте в каталог.
        Отклонённые запоминаются и больше не предлагаются.
      </div>
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        Приёмка{pending ? ` · ${pending}` : ""}…
      </button>
      {open && <ParseStagingModal onClose={() => setOpen(false)} />}
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
        + `вырезан фон: ${r.debackgrounded ?? 0} · пропущено: ${r.skipped} · ошибок: ${r.failed}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title"><ImageIcon /> Оптимизация изображений</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Скачивает внешние картинки в наше хранилище, создаёт лёгкие превью и вырезает белый фон
        у обложек из каталогов (у уже скачанных — задним числом). Внешние ссылки за Cloudflare/CDN
        могут не скачаться с боевого сервера (попадут в «ошибки») — тогда запускайте там, где
        сайт-источник доступен.
      </div>
      <button className="btn btn-primary" onClick={run} disabled={busy}>
        {busy ? "Обработка…" : "Оптимизировать медиа"}
      </button>
      {error && <div className="error-text">{error}</div>}
      {msg && <div className="picker-result" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

function DescriptionCleanupCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    if (!window.confirm("Убрать англоязычные и повторяющиеся описания? Тексты, написанные вручную, останутся.")) return;
    setMsg(null);
    setError(null);
    setBusy(true);
    try {
      const r = await cleanupDescriptions();
      setMsg(`Готово. Убрано англоязычных: ${r.foreign} · дублей: ${r.duplicated} · оставлено: ${r.kept}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title"><ImageIcon /> Чистка описаний</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Убирает у карточек описания, доставшиеся от парсеров: англоязычные (на русском сайте они
        ничего не объясняют) и те, что слово в слово повторяются у нескольких напитков — такой текст
        описывает бренд, а не вкус. Осмысленные описания на русском остаются.
      </div>
      <button className="btn btn-secondary" onClick={run} disabled={busy}>
        {busy ? "Обработка…" : "Почистить описания"}
      </button>
      {error && <div className="error-text">{error}</div>}
      {msg && <div className="picker-result" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

