import { useState, useEffect } from "react";
import { mediaUrl, addDrinkPhoto, addDrinkPhotoByUrl, deleteDrinkPhoto, isAuthenticated } from "../services/api";
import ImageDropZone from "./ImageDropZone";

export default function PhotoGallery({ drinkId, photos, onUpdated, canManage = false }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setActiveIdx((idx) => Math.min(idx, Math.max(0, photos.length - 1)));
  }, [photos.length]);

  const active = photos[activeIdx];
  const canAdd = isAuthenticated();

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

  return (
    <div className="gallery">
      {active ? (
        <img className="gallery-main" src={mediaUrl(active.url)} alt="Фото энергетика" />
      ) : (
        <div className="gallery-main gallery-main-empty">⚡ Фотографий пока нет</div>
      )}

      <div className="gallery-thumbs">
        {photos.map((p, i) => (
          <div className="gallery-thumb-wrap" key={p.id}>
            <img
              className={`gallery-thumb ${i === activeIdx ? "active" : ""}`}
              src={mediaUrl(p.url)}
              alt={`Фото ${i + 1}`}
              onClick={() => setActiveIdx(i)}
              loading="lazy"
            />
            {canManage && (
              <button
                className="gallery-thumb-del"
                title="Удалить фото"
                onClick={(e) => handleDelete(p.id, e)}
              >×</button>
            )}
          </div>
        ))}

        {canAdd && (
          <button className="gallery-add" onClick={() => setAdding(true)} title="Добавить своё фото">
            +
          </button>
        )}
      </div>

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
    </div>
  );
}
