import { useRef, useCallback } from "react";

const MAX = 10;

/**
 * Ввод оценки 1–10 «пилюлей» в цвет темы: акцентная заливка, цифры на делениях,
 * текущая оценка — белым кружком-ползунком. Оценку можно поставить кликом по делению
 * ИЛИ зажав и протянув (pointer-события + захват указателя).
 */
export default function RatingSlider({ value = 0, onRate }) {
  const trackRef = useRef(null);

  const valueFromX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    const ratio = (clientX - r.left) / r.width;
    return Math.max(1, Math.min(MAX, Math.ceil(ratio * MAX)));
  }, [value]);

  const apply = useCallback((clientX) => onRate?.(valueFromX(clientX)), [onRate, valueFromX]);

  const onPointerDown = (e) => {
    e.preventDefault();
    trackRef.current?.setPointerCapture?.(e.pointerId);
    apply(e.clientX);
  };
  const onPointerMove = (e) => {
    // тянем только при зажатой кнопке/касании (захват указателя шлёт move даже за пределами трека)
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    if (trackRef.current?.hasPointerCapture?.(e.pointerId)) apply(e.clientX);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onRate?.(Math.min(MAX, (value || 0) + 1)); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onRate?.(Math.max(1, (value || 0) - 1)); }
  };

  return (
    <div className="rate-slider-wrap">
      <div
        ref={trackRef}
        className="rate-slider"
        role="slider"
        aria-label="Оценка от 1 до 10"
        aria-valuemin={1}
        aria-valuemax={MAX}
        aria-valuenow={value || 0}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div className="rate-slider-fill" style={{ width: `${(Math.max(0, value) / MAX) * 100}%` }} />
        <div className="rate-slider-nodes">
          {Array.from({ length: MAX }, (_, idx) => idx + 1).map((i) => (
            <span key={i} className={"rate-node" + (i <= value ? " on" : "") + (i === value ? " current" : "")}>
              <span className="rate-node-num">{i}</span>
            </span>
          ))}
        </div>
      </div>
      <span className="rate-slider-value">
        {value > 0 ? value : "—"}<span className="rate-slider-max">/10</span>
      </span>
    </div>
  );
}
