import { useState, useEffect } from "react";
import {
  mediaUrl, addDrinkPhoto, addDrinkPhotoByUrl, deleteDrinkPhoto, fetchImageForEditing,
  reorderDrinkPhotos, replaceDrinkPhoto,
} from "../services/api";
import { coverStyle } from "../utils/coverStyle";
import ImageDropZone from "./ImageDropZone";
import BackgroundEditor from "./BackgroundEditor";
import { BoltIcon, PaletteIcon } from "./icons";

export default function PhotoGallery({ drinkId, photos, onUpdated, canManage = false, coverFit, coverPos }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bgMode, setBgMode] = useState("none");     // none | auto | manual
  const [editing, setEditing] = useState(null);     // { source, photoId? } — что открыто в редакторе
  const [error, setError] = useState(null);

  // перетаскивание миниатюр для смены порядка (только админ)
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  useEffect(() => {
    setActiveIdx((idx) => Math.min(idx, Math.max(0, photos.length - 1)));
  }, [photos.length]);

  const active = photos[activeIdx];

  const handleSelect = async ({ file, url }) => {
    // и файл, и ссылку правим ДО загрузки — на сервере не остаётся промежуточной картинки,
    // а отменённый редактор просто ничего не добавляет
    if (bgMode === "manual") {
      if (file) {
        setEditing({ source: file });
        return;
      }
      setUploading(true);
      setError(null);
      try {
        setEditing({ source: await fetchImageForEditing(url) });
      } catch (err) {
        setError(err.message);
      } finally {
        setUploading(false);
      }
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const updated = file
        ? await addDrinkPhoto(drinkId, file, bgMode === "auto")
        : await addDrinkPhotoByUrl(drinkId, url, bgMode === "auto");
      onUpdated?.(updated);
      if (updated?.photos) setActiveIdx(updated.photos.length - 1);
      setAdding(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  /** Готовый PNG из редактора: для существующего фото — замена, для нового файла — загрузка. */
  const handleEdited = async (png) => {
    const updated = editing.photoId
      ? await replaceDrinkPhoto(drinkId, editing.photoId, png)
      : await addDrinkPhoto(drinkId, png, false);
    onUpdated?.(updated);
    if (!editing.photoId && updated?.photos) setActiveIdx(updated.photos.length - 1);
    setEditing(null);
    setAdding(false);
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
      {canManage && active && (
        <button className="gallery-bg-btn" title="Редактор фона: цвета, области, кисти"
          onClick={() => setEditing({ source: mediaUrl(active.url), photoId: active.id })}>
          <PaletteIcon size={14} /> Фон
        </button>
      )}

      {active ? (
        // Кадрирование «Окно с информацией» применяем к обложке (первое фото);
        // остальные фото показываем целиком (contain по CSS).
        <img className="gallery-main" src={mediaUrl(active.url)} alt="Фото энергетика" decoding="async"
          style={activeIdx === 0 ? coverStyle(coverFit, coverPos) : undefined} />
      ) : (
        <div className="gallery-main gallery-main-empty"><BoltIcon size={18} /> Фотографий пока нет</div>
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
              src={mediaUrl(p.thumbUrl || p.url)}
              alt={`Фото ${i + 1}`}
              onClick={() => setActiveIdx(i)}
              loading="lazy"
              decoding="async"
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
          <button className="gallery-add" onClick={() => { setBgMode("none"); setAdding(true); }}
            title="Добавить фото">
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
              <ImageDropZone onSelect={handleSelect} busy={uploading}
                bgMode={bgMode} onBgMode={setBgMode} />
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

      {editing && (
        <BackgroundEditor
          source={editing.source}
          title={editing.photoId ? "Редактор фона" : "Фон новой фотографии"}
          fileName={editing.photoId ? `photo-${editing.photoId}.png` : "photo.png"}
          onCancel={() => setEditing(null)}
          onApply={handleEdited}
        />
      )}

      {error && !adding && <div className="error-text">{error}</div>}
    </div>
  );
}
