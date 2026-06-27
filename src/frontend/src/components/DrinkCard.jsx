import { mediaUrl } from "../services/api";
import { coverStyle } from "../utils/coverStyle";

const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

// Первые три места получают тир-метки вместо номера
const RANK_LABELS = { 1: "SSS", 2: "S", 3: "A" };

function reviewWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "оценка";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "оценки";
  return "оценок";
}

function RatingPopup({ average, count, dist }) {
  const values = SCORES.map((s) => dist?.[s] || 0);
  const max = Math.max(1, ...values);

  return (
    <div className="rating-popup" onClick={(e) => e.stopPropagation()}>
      <div className="rating-popup-head">
        <span className="rating-popup-avg">{average > 0 ? average.toFixed(1) : "—"}</span>
        <span className="muted">{count} {reviewWord(count)}</span>
      </div>
      {count === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>Пока никто не оценил</div>
      ) : (
        <div className="rating-bars">
          {SCORES.map((score) => {
            const c = dist?.[score] || 0;
            return (
              <div className="rating-bar-row" key={score}>
                <span className="rating-bar-label">{score}</span>
                <span className="rating-bar-track">
                  <span className="rating-bar-fill" style={{ width: `${(c / max) * 100}%` }} />
                </span>
                <span className="rating-bar-count">{c}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DrinkCard({ drink, rank, onClick, ratingOpen, onRatingToggle, onRatingHover }) {
  const cover = mediaUrl(drink.coverUrl);
  const rankClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";

  return (
    <div className={`drink-card ${rankClass} ${ratingOpen ? "info-open" : ""}`} onClick={onClick}>
      <div className={`drink-rank ${rankClass}`}>{RANK_LABELS[rank] || rank}</div>


      {cover ? (
        <img className="drink-thumb" src={cover} alt={drink.name} loading="lazy" decoding="async"
          style={coverStyle(drink.coverFitCard, drink.coverPosCard)} />
      ) : (
        <div className="drink-thumb drink-thumb-placeholder">⚡</div>
      )}

      <div className="drink-card-body">
        <div className="drink-card-name">{drink.name}</div>
        {drink.brand && <span className="drink-card-brand">{drink.brand}</span>}
        {drink.description && <div className="drink-card-desc">{drink.description}</div>}
      </div>

      <div
        className="drink-card-rating"
        onPointerEnter={(e) => { if (e.pointerType === "mouse") onRatingHover?.(true); }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") onRatingHover?.(false); }}
        onClick={(e) => { e.stopPropagation(); onRatingToggle?.(); }}
        title="Подробнее об оценках"
      >
        <div className="drink-card-rating-inner">
          <span className="rating-badge">
            {drink.averageRating > 0 ? drink.averageRating.toFixed(1) : "—"}
          </span>
          {ratingOpen && (
            <RatingPopup
              average={drink.averageRating}
              count={drink.reviewCount || 0}
              dist={drink.ratingDistribution}
            />
          )}
        </div>
      </div>
    </div>
  );
}
