import { useState, useEffect } from "react";
import { mediaUrl, addDrinkPhoto, addDrinkPhotoByUrl, deleteDrinkPhoto, reorderDrinkPhotos } from "../services/api";
import { coverStyle } from "../utils/coverStyle";
import ImageDropZone from "./ImageDropZone";

export default function PhotoGallery({ drinkId, photos, onUpdated, canManage = false }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  // перетаскивание миниатюр для смены порядка (только админ)
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  useEffect(() => {
    setActiveIdx((idx) => Math.min(idx, Math.max(0, photos.length - 1)));
  }, [photos.length]);

  const active = photos[activeIdx];

  const handleSelect = async ({ file, url }) => {
    setUploading(true);
    setError(null);
    try {
      const updated = file
        ? await addDrinkPhoto(drinkId, file)
        : await addDrinkPhotoByUrl(drinkId, url);
      onUpdated?.(updated);
      if (updated?.photos) setActiveIdx(updated.photos.length - 1);
      setAdding(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photoId, e) => {
    e.stopPropagation();
    if (!window.confirm("Удалить эту фотографию?")) return;
    try {
      const updated = await deleteDrinkPhoto(drinkId, photoId);
      onUpdated?.(updated);
      setActiveIdx(0);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDrop = async (toIdx) => {
    const from = dragIdx;
    setDragIdx(null);
    setOverIdx(null);
    if (from == null || from === toIdx) return;
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(toIdx, 0, moved);
    setActiveIdx(toIdx);
    try {
      const updated = await reorderDrinkPhotos(drinkId, next.map((p) => p.id));
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="gallery">
      {active ? (
        <img className="gallery-main" src={mediaUrl(active.url)} alt="Фото энергетика" />
      ) : (
        <div className="gallery-main gallery-main-empty">⚡ Фотографий пока нет</div>
      )}

      <div className="gallery-thumbs">
        {photos.map((p, i) => (
          <div
            className={`gallery-thumb-wrap ${canManage ? "draggable" : ""} ${overIdx === i ? "drag-over" : ""}`}
            key={p.id}
            draggable={canManage}
            onDragStart={canManage ? () => setDragIdx(i) : undefined}
            onDragOver={canManage ? (e) => { e.preventDefault(); setOverIdx(i); } : undefined}
            onDragLeave={canManage ? () => setOverIdx((v) => (v === i ? null : v)) : undefined}
            onDrop={canManage ? (e) => { e.preventDefault(); handleDrop(i); } : undefined}
            onDragEnd={canManage ? () => { setDragIdx(null); setOverIdx(null); } : undefined}
          >
            <img
              className={`gallery-thumb ${i === activeIdx ? "active" : ""}`}
              src={mediaUrl(p.url)}
              alt={`Фото ${i + 1}`}
              onClick={() => setActiveIdx(i)}
              loading="lazy"
              draggable={false}
              style={coverStyle("contain")}
            />
            {i === 0 && <span className="thumb-cover-badge" title="Обложка">обложка</span>}
            {canManage && (
              <button
                className="gallery-thumb-del"
                title="Удалить фото"
                onClick={(e) => handleDelete(p.id, e)}
              >×</button>
            )}
          </div>
        ))}

        {canManage && (
          <button className="gallery-add" onClick={() => setAdding(true)} title="Добавить фото">
            +
          </button>
        )}
      </div>

      {canManage && photos.length > 1 && (
        <div className="muted gallery-hint">Перетащите миниатюры, чтобы изменить порядок. Первое фото — обложка.</div>
      )}

      {adding && (
        <div className="modal-overlay" onClick={() => !uploading && setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-body">
              <div className="modal-header">
                <h2 className="modal-title" style={{ fontSize: 18 }}>Добавить фото</h2>
              </div>
              <ImageDropZone onSelect={handleSelect} busy={uploading} />
              {error && <div className="error-text">{error}</div>}
              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }}
                  onClick={() => setAdding(false)} disabled={uploading}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && !adding && <div className="error-text">{error}</div>}
    </div>
  );
}
