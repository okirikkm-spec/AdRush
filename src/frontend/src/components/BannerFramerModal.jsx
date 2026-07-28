import { useEffect, useRef, useState } from "react";
import { coverStyle, posX, posY } from "../utils/coverStyle";

/**
 * Предпросмотр и кадрирование обложки мини-профиля.
 * Ничего не отправляет на сервер: отдаёт выбранные fit/pos наверх,
 * а применяются они уже вместе с остальными правками профиля.
 */
export default function BannerFramerModal({ url, fit: initialFit, pos: initialPos, onApply, onClose }) {
  const [fit, setFit] = useState(initialFit === "contain" ? "contain" : "cover");
  const [pos, setPos] = useState(initialPos || "50% 50%");
  const frameRef = useRef(null);
  const dragging = useRef(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setFromEvent = (e) => {
    const r = frameRef.current.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    setPos(`${x}% ${y}%`);
  };

  const onDown = (e) => {
    if (fit !== "cover") return;
    dragging.current = true;
    setFromEvent(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => { if (dragging.current) setFromEvent(e); };
  const stop = () => { dragging.current = false; };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-picker modal-framer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="picker-head">
          <div className="picker-head-main">
            <div>
              <h2 className="picker-title">Обложка профиля</h2>
              <p className="picker-sub">Проверьте, как она ляжет, и выберите видимую часть</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="picker-body">
          <div className="framer-col">
            <div className="framer-col-title">Так это увидят в профиле</div>
            <div
              ref={frameRef}
              className={`framer-frame framer-banner ${fit === "cover" ? "draggable" : ""}`}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={stop} onPointerCancel={stop}
            >
              <img src={url} alt="" draggable={false} style={coverStyle(fit, pos)} />
              {fit === "cover" && (
                <span className="framer-focal" style={{ left: posX(pos), top: posY(pos) }} />
              )}
            </div>

            <div className="seg framer-seg">
              <button type="button" className={`seg-btn ${fit === "cover" ? "on" : ""}`}
                onClick={() => setFit("cover")}><span className="seg-title">Заполнить</span></button>
              <button type="button" className={`seg-btn ${fit === "contain" ? "on" : ""}`}
                onClick={() => setFit("contain")}><span className="seg-title">Целиком</span></button>
            </div>

            <div className="framer-hint">
              {fit === "cover"
                ? "Перетащите изображение, чтобы выбрать видимую часть"
                : "Изображение видно целиком"}
            </div>
          </div>
        </div>

        <div className="picker-foot">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={() => onApply({ fit, pos })}>Применить</button>
        </div>
      </div>
    </div>
  );
}
