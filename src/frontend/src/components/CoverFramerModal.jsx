import { useEffect, useRef, useState } from "react";
import { mediaUrl, updateCoverFraming } from "../services/api";
import { coverStyle, posX, posY } from "../utils/coverStyle";

/** Один редактор кадра (карточка или окно): превью + переключатель режима + перетаскивание фокуса. */
function FrameEditor({ title, url, frameClass, fit, pos, onFit, onPos }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const setFromEvent = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onPos(`${Math.round(x)}% ${Math.round(y)}%`);
  };

  const onDown = (e) => {
    if (fit !== "cover" || !url) return;
    dragging.current = true;
    setFromEvent(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => { if (dragging.current) setFromEvent(e); };
  const stop = () => { dragging.current = false; };

  return (
    <div className="framer-col">
      <div className="framer-col-title">{title}</div>
      <div
        ref={ref}
        className={`framer-frame ${frameClass} ${fit === "cover" && url ? "draggable" : ""}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={stop} onPointerCancel={stop}
      >
        {url
          ? <img src={url} alt="" draggable={false} style={coverStyle(fit, pos)} />
          : <div className="framer-empty">⚡</div>}
        {fit === "cover" && url && (
          <span className="framer-focal" style={{ left: posX(pos), top: posY(pos) }} />
        )}
      </div>
      <div className="seg framer-seg">
        <button type="button" className={`seg-btn ${fit !== "cover" ? "on" : ""}`} onClick={() => onFit("contain")}>
          <span className="seg-title">Целиком</span>
        </button>
        <button type="button" className={`seg-btn ${fit === "cover" ? "on" : ""}`} onClick={() => onFit("cover")}>
          <span className="seg-title">Заполнить</span>
        </button>
      </div>
      <div className="framer-hint">
        {fit === "cover" && url ? "Перетащите, чтобы выбрать видимую часть" : "Изображение видно целиком"}
      </div>
    </div>
  );
}

/** Модалка настройки кадрирования обложки (отдельно для карточки и окна с информацией). */
export default function CoverFramerModal({ drink, onClose, onSaved }) {
  const url = mediaUrl(drink.coverUrl);
  const [fitCard, setFitCard] = useState(drink.coverFitCard === "cover" ? "cover" : "contain");
  const [posCard, setPosCard] = useState(drink.coverPosCard || "50% 50%");
  const [fitModal, setFitModal] = useState(drink.coverFitModal === "cover" ? "cover" : "contain");
  const [posModal, setPosModal] = useState(drink.coverPosModal || "50% 50%");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCoverFraming(drink.id, {
        coverFitCard: fitCard, coverPosCard: posCard,
        coverFitModal: fitModal, coverPosModal: posModal,
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-picker modal-framer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="picker-head">
          <div className="picker-head-main">
            <span className="picker-icon">🖼️</span>
            <div>
              <h2 className="picker-title">Кадрирование обложки</h2>
              <p className="picker-sub">Настройте ракурс для карточки и окна отдельно</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="picker-body">
          <div className="framer-grid">
            <FrameEditor title="Карточка" url={url} frameClass="framer-card"
              fit={fitCard} pos={posCard} onFit={setFitCard} onPos={setPosCard} />
            <FrameEditor title="Окно с информацией" url={url} frameClass="framer-modal"
              fit={fitModal} pos={posModal} onFit={setFitModal} onPos={setPosModal} />
          </div>
          {error && <div className="error-text">{error}</div>}
        </div>

        <div className="picker-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
