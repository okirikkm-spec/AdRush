import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ImageDropZone from "../components/ImageDropZone";
import UserModeration from "../components/UserModeration";
import { fetchMe, createDrink, parseCatalog, addDrinkPhoto, addDrinkPhotoByUrl } from "../services/api";

export default function AdminPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

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
        <p className="page-subtitle">Добавление энергетиков и управление каталогом</p>

        <div className="admin-grid">
          <AddDrinkCard onCreated={(d) => navigate(`/drink/${d.id}`)} />
          <ParserCard />
          <UserModeration />
        </div>
      </div>
    </>
  );
}

function AddDrinkCard({ onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState(null); // { file } | { url } | null
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setMsg(null);
    setSaving(true);
    try {
      const drink = await createDrink({ name, description });
      if (cover?.file) await addDrinkPhoto(drink.id, cover.file);
      else if (cover?.url) await addDrinkPhotoByUrl(drink.id, cover.url);
      setName(""); setDescription(""); setCover(null);
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
  const [msg, setMsg] = useState(null);
  const [running, setRunning] = useState(false);

  const run = async (full) => {
    setMsg(null);
    setRunning(true);
    try {
      const res = await parseCatalog(full);
      setMsg(`Готово. Добавлено новых энергетиков: ${res.created}`);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card">
      <div className="card-title">🔄 Парсер каталога adrenalinerush.ru</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Каталог автоматически проверяется раз в сутки. Здесь можно запустить проверку вручную.
      </div>
      <div className="row">
        <button className="btn btn-secondary" onClick={() => run(false)} disabled={running}>
          Проверить последние записи
        </button>
        <button className="btn btn-secondary" onClick={() => run(true)} disabled={running}>
          Полный обход каталога
        </button>
      </div>
      {msg && <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>{msg}</div>}
    </div>
  );
}
