import { useState } from "react";

function StarIcon({ filled, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5">
      <polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" />
    </svg>
  );
}

/**
 * Шкала оценок 1–10.
 * - readonly: только отображение value
 * - onRate(n): обработчик клика для выставления оценки
 */
export default function RatingStars({ value = 0, onRate, readonly = false, size = 22, showValue = false }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value || 0;

  return (
    <div className="stars">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <button
          key={i}
          type="button"
          className={`star ${i <= display ? "filled" : ""} ${readonly ? "readonly" : ""}`}
          onMouseEnter={() => !readonly && setHovered(i)}
          onMouseLeave={() => !readonly && setHovered(0)}
          onClick={() => !readonly && onRate?.(i)}
          title={`${i} / 10`}
          disabled={readonly}
        >
          <StarIcon filled={i <= display} size={size} />
        </button>
      ))}
      {showValue && <span className="stars-value">{display > 0 ? `${display}/10` : "—"}</span>}
    </div>
  );
}
