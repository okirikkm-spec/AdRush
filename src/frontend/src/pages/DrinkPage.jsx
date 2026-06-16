import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import PhotoGallery from "../components/PhotoGallery";
import ReviewSection from "../components/ReviewSection";
import CoverFramerModal from "../components/CoverFramerModal";
import { fetchDrink, fetchMe, updateDrink, deleteDrink, isAuthenticated } from "../services/api";

export default function DrinkPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [drink, setDrink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Редактирование описания (для администратора)
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  // Редактирование названия (для администратора)
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  // Настройка кадрирования обложки (для администратора)
  const [framing, setFraming] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchDrink(id)
      .then((data) => {
        setDrink(data);
        document.title = `${data.name} — AdRush`;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (isAuthenticated()) {
      fetchMe().then((me) => setIsAdmin(me?.role === "ADMIN")).catch(() => {});
    }
  }, []);

  const startEdit = () => {
    setDescDraft(drink.description || "");
    setEditingDesc(true);
  };

  const saveDesc = async () => {
    setSavingDesc(true);
    try {
      const updated = await updateDrink(drink.id, { description: descDraft });
      setDrink(updated);
      setEditingDesc(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingDesc(false);
    }
  };

  const startEditName = () => {
    setNameDraft(drink.name);
    setEditingName(true);
  };

  const saveName = async () => {
    if (!nameDraft.trim()) return;
    setSavingName(true);
    try {
      const updated = await updateDrink(drink.id, { name: nameDraft.trim() });
      setDrink(updated);
      setEditingName(false);
      document.title = `${updated.name} — AdRush`;
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteDrink = async () => {
    if (!window.confirm(`Удалить энергетик «${drink.name}» вместе со всеми отзывами и фото?`)) return;
    try {
      await deleteDrink(drink.id);
      navigate("/");
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <Navbar />
      <div className="page">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 18 }}>
          ← Назад
        </button>

        {loading && <div className="state">Загрузка…</div>}
        {error && <div className="state error-text">{error}</div>}

        {drink && (
          <>
            <div className="drink-header">
              {editingName ? (
                <div className="row" style={{ flex: 1 }}>
                  <input className="input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                    style={{ fontSize: 20, fontWeight: 700 }} autoFocus />
                  <button className="btn btn-primary" onClick={saveName} disabled={savingName}>
                    {savingName ? "…" : "Сохранить"}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setEditingName(false)} disabled={savingName}>
                    Отмена
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="page-title" style={{ margin: 0, flex: 1 }}>{drink.name}</h1>
                  {isAdmin && (
                    <div className="row">
                      <button className="btn btn-ghost btn-sm" onClick={startEditName}>Изменить название</button>
                      <button className="btn btn-danger btn-sm" onClick={handleDeleteDrink}>Удалить</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {drink.brand && !editingName && (
              <span className="drink-card-brand" style={{ marginBottom: 14 }}>{drink.brand}</span>
            )}

            {isAdmin && drink.photos?.length > 0 && (
              <div className="row" style={{ marginBottom: 12 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setFraming(true)}>
                  🖼️ Кадрирование обложки
                </button>
              </div>
            )}

            <PhotoGallery
              drinkId={drink.id}
              photos={drink.photos || []}
              onUpdated={(updated) => setDrink(updated)}
              canManage={isAdmin}
            />

            <div className="section">
              <div className="section-head">
                <h3 className="section-title" style={{ margin: 0 }}>Описание</h3>
                {isAdmin && !editingDesc && (
                  <button className="btn btn-ghost btn-sm" onClick={startEdit}>
                    {drink.description ? "Редактировать" : "Добавить описание"}
                  </button>
                )}
              </div>

              {editingDesc ? (
                <>
                  <textarea
                    className="input"
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    placeholder="Описание энергетика…"
                    style={{ minHeight: 110 }}
                  />
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn btn-primary" onClick={saveDesc} disabled={savingDesc}>
                      {savingDesc ? "…" : "Сохранить"}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setEditingDesc(false)} disabled={savingDesc}>
                      Отмена
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                  {drink.description || "Описание пока не добавлено."}
                </p>
              )}
            </div>

            <ReviewSection drinkId={drink.id} />
          </>
        )}
      </div>

      {framing && drink && (
        <CoverFramerModal drink={drink} onClose={() => setFraming(false)} onSaved={(u) => setDrink(u)} />
      )}
    </>
  );
}
