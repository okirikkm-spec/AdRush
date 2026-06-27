import { useEffect, useState, useCallback } from "react";
import { fetchDrink, fetchMe, updateDrink, deleteDrink, isAuthenticated, mediaUrl } from "../services/api";
import { coverStyle } from "../utils/coverStyle";
import { useSwipeToClose } from "../hooks/useSwipeToClose";
import PhotoGallery from "./PhotoGallery";
import ReviewSection from "./ReviewSection";
import CoverFramerModal from "./CoverFramerModal";
import ShareControl from "./ShareControl";

/**
 * Карточка энергетика во всплывающем окне — заменяет отдельную страницу.
 * Показывает галерею, описание и отзывы; для админа по кнопке «Редактировать»
 * включается режим правки (название/описание/фото/кадрирование/удаление).
 *
 * @param drinkId id энергетика (модалка сама подтягивает полные данные)
 * @param summary краткие данные из списка — для мгновенного показа шапки до загрузки
 * @param onChanged вызывается после изменений, чтобы обновить список на главной
 */
export default function DrinkModal({ drinkId, summary, onClose, onChanged }) {
  const [drink, setDrink] = useState(summary || null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [framing, setFraming] = useState(false);

  const [nameDraft, setNameDraft] = useState(summary?.name || "");
  const [descDraft, setDescDraft] = useState(summary?.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // блокируем прокрутку фона + Esc для закрытия
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const load = useCallback(async () => {
    try {
      const full = await fetchDrink(drinkId);
      setDrink(full);
      setNameDraft(full.name || "");
      setDescDraft(full.description || "");
    } catch (e) {
      setError(e.message);
    }
  }, [drinkId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAuthenticated()) fetchMe().then((me) => setIsAdmin(me?.role === "ADMIN")).catch(() => {});
  }, []);

  const applyUpdate = (updated) => { setDrink(updated); onChanged?.(); };

  const saveInfo = async () => {
    if (!nameDraft.trim()) { setError("Введите название"); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDrink(drinkId, { name: nameDraft.trim(), description: descDraft });
      applyUpdate(updated);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Удалить энергетик «${drink?.name}» вместе со всеми отзывами и фото?`)) return;
    try {
      await deleteDrink(drinkId);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  const cover = drink ? mediaUrl(drink.coverUrl) : null;

  // на сенсорных устройствах карточку можно закрыть свайпом справа налево
  const swipeRef = useSwipeToClose(onClose);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-detail" ref={swipeRef} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="modal-body modal-detail-body">
          {/* Галерея: после загрузки полных данных — с миниатюрами и управлением (в режиме правки) */}
          {drink && Array.isArray(drink.photos) ? (
            <PhotoGallery
              drinkId={drinkId}
              photos={drink.photos}
              canManage={isAdmin && editing}
              onUpdated={applyUpdate}
              coverFit={drink.coverFitModal}
              coverPos={drink.coverPosModal}
            />
          ) : (
            <div className="gallery">
              {cover ? (
                <img className="gallery-main" src={cover} alt={drink?.name || ""} decoding="async"
                  style={coverStyle(drink?.coverFitModal, drink?.coverPosModal)} />
              ) : (
                <div className="gallery-main gallery-main-empty">⚡ нет фото</div>
              )}
            </div>
          )}

          {/* Название */}
          {editing ? (
            <div className="input-group">
              <label className="input-label">Название</label>
              <input className="input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
            </div>
          ) : (
            <div className="modal-detail-titlebar">
              <h2 className="modal-title">{drink?.name || summary?.name || "…"}</h2>
              <ShareControl drinkId={drinkId} className="modal-detail-share" />
            </div>
          )}

          {drink?.brand && !editing && (
            <span className="drink-card-brand" style={{ marginBottom: 10 }}>{drink.brand}</span>
          )}

          {/* Описание */}
          {editing ? (
            <div className="input-group">
              <label className="input-label">Описание</label>
              <textarea className="input" style={{ minHeight: 90 }} value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)} placeholder="Вкус, состав, впечатления…" />
            </div>
          ) : (
            drink?.description ? <p className="modal-desc">{drink.description}</p> : null
          )}

          {/* Действия режима правки (админ) */}
          {isAdmin && editing && (
            <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" onClick={saveInfo} disabled={saving}>
                {saving ? "…" : "Сохранить изменения"}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setFraming(true)}>🖼️ Кадрирование обложки</button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>Удалить энергетик</button>
            </div>
          )}
          {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

          {/* Отзывы (полный блок: оценка, форма, список, модерация) */}
          <ReviewSection drinkId={drinkId} />
        </div>

        <div className="modal-detail-foot">
          {isAdmin && (
            <button className={`btn btn-sm ${editing ? "btn-primary" : "btn-secondary"}`}
              onClick={() => { setEditing((v) => !v); setError(null); }}>
              {editing ? "Готово" : "✏️ Редактировать"}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Закрыть</button>
        </div>

        {framing && drink && (
          <CoverFramerModal drink={drink} onClose={() => setFraming(false)} onSaved={applyUpdate} />
        )}
      </div>
    </div>
  );
}
