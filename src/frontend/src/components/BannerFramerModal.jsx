import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import BannerLayer, { HERO_ASPECT } from "./BannerLayer";
import { ImageIcon } from "./icons";

const SCALE_MIN = 0.2, SCALE_MAX = 5, OFFSET_LIMIT = 200;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Окно обложки мини-профиля.
 *  • обложки нет — зона перетаскивания файла;
 *  • обложка есть — предпросмотр карточки + редактор кадра
 *    (видно почти всё изображение, доступны масштаб, поворот и сдвиг).
 * На сервер ничего не шлёт: отдаёт наверх файл и параметры кадра.
 */
export default function BannerFramerModal({ me, url, framing, aspect, onApply, onRemove, onClose }) {
  // Пропорции настоящей карточки: и предпросмотр, и рамка обязаны им следовать,
  // иначе «покрытие» даст другой кадр и предпросмотр соврёт.
  const ratio = aspect && aspect > 0 ? aspect : HERO_ASPECT;
  const boxRatio = { aspectRatio: String(ratio) };
  const [scale, setScale] = useState(framing.scale);
  const [rotate, setRotate] = useState(framing.rotate);
  const [offsetX, setOffsetX] = useState(framing.offsetX);
  const [offsetY, setOffsetY] = useState(framing.offsetY);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);

  const fileRef = useRef(null);
  const frameRef = useRef(null);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const takeFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Нужен файл изображения"); return; }
    setError(null);
    // Новая картинка — кадр считаем заново, старый к ней не относится
    onApply({ file, scale: 1, rotate: 0, offsetX: 0, offsetY: 0, keepOpen: true });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    takeFile(e.dataTransfer.files?.[0]);
  };

  /* ── Сдвиг картинки мышью: считаем в процентах от плашки ── */
  const onDown = (e) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging.current) return;
    const r = frameRef.current.getBoundingClientRect();
    setOffsetX((v) => clamp(v + ((e.clientX - last.current.x) / r.width) * 100, -OFFSET_LIMIT, OFFSET_LIMIT));
    setOffsetY((v) => clamp(v + ((e.clientY - last.current.y) / r.height) * 100, -OFFSET_LIMIT, OFFSET_LIMIT));
    last.current = { x: e.clientX, y: e.clientY };
  };
  const stop = () => { dragging.current = false; };

  const reset = () => { setScale(1); setRotate(0); setOffsetX(0); setOffsetY(0); };
  const turn = (delta) => setRotate((r) => (((r + delta) % 360) + 360) % 360);

  const apply = () => onApply({ file: null, scale, rotate, offsetX, offsetY });

  const view = { url, scale, rotate, offsetX, offsetY };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-picker modal-banner" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="picker-head">
          <div className="picker-head-main">
            <div>
              <h2 className="picker-title">Обложка профиля</h2>
              <p className="picker-sub">
                {url ? "Проверьте, как ляжет в карточку, и настройте кадр" : "Перетащите изображение или выберите файл"}
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="picker-body">
          {!url ? (
            <div
              className={`dropzone ${dragOver ? "over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon size={30} />
              <div className="dropzone-title">Перетащите изображение сюда</div>
              <div className="dropzone-sub">или нажмите, чтобы выбрать файл</div>
            </div>
          ) : (
            <>
              {/* Блок 1 — как это будет выглядеть в профиле */}
              <div className="banner-block">
                <div className="framer-col-title">Так будет выглядеть карточка</div>
                <div className="banner-preview" style={boxRatio}>
                  <BannerLayer {...view} />
                  <div className="banner-preview-body">
                    <Avatar url={me?.avatarUrl} name={me?.displayName || me?.username} size={52} />
                    <div>
                      <div className="banner-preview-name">{me?.displayName || me?.username}</div>
                      <div className="banner-preview-sub">@{me?.username}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Блок 2 — настройка: видно почти всё изображение, рамка = видимая часть */}
              <div className="banner-block">
                <div className="framer-col-title">Настройка кадра</div>
                <div className="cropper-stage"
                  onPointerDown={onDown} onPointerMove={onMove}
                  onPointerUp={stop} onPointerCancel={stop}>
                  <div className="cropper-frame" ref={frameRef} style={boxRatio}>
                    <BannerLayer {...view} />
                  </div>
                  <div className="cropper-shade" style={boxRatio} />
                </div>

                <div className="cropper-controls">
                  <label className="cropper-row">
                    <span className="cropper-label">Масштаб</span>
                    <input type="range" min={SCALE_MIN} max={SCALE_MAX} step="0.02" value={scale}
                      onChange={(e) => setScale(Number(e.target.value))} />
                    <span className="cropper-value">{Math.round(scale * 100)}%</span>
                  </label>

                  <label className="cropper-row">
                    <span className="cropper-label">Поворот</span>
                    <input type="range" min="0" max="359" step="1" value={rotate}
                      onChange={(e) => setRotate(Number(e.target.value))} />
                    <span className="cropper-value">{rotate}°</span>
                  </label>

                  <div className="cropper-row">
                    <button className="btn btn-secondary btn-sm" onClick={() => turn(-90)}>⟲ 90°</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => turn(90)}>⟳ 90°</button>
                    <button className="btn btn-secondary btn-sm" onClick={reset}>Сбросить</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                      Заменить
                    </button>
                  </div>
                  <div className="framer-hint">Перетащите изображение в области настройки, чтобы сдвинуть кадр</div>
                </div>
              </div>
            </>
          )}

          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; takeFile(f); }} />
          {error && <div className="error-text">{error}</div>}
        </div>

        <div className="picker-foot">
          {url && <button className="btn btn-danger btn-sm" onClick={onRemove}>Удалить обложку</button>}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          {url && <button className="btn btn-primary" onClick={apply}>Применить</button>}
        </div>
      </div>
    </div>
  );
}
