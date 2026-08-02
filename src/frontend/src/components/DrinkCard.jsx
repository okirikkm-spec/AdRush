import { mediaUrl } from "../services/api";
import { coverStyle } from "../utils/coverStyle";
import { specSummary } from "../utils/specs";
import RatingBars from "./RatingBars";
import { BoltIcon } from "./icons";

export function reviewWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "оценка";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "оценки";
  return "оценок";
}

function RatingPopup({ average, count, dist }) {
  return (
    <div className="rating-popup" onClick={(e) => e.stopPropagation()}>
      <div className="rating-popup-head">
        <span className="rating-popup-avg">{average > 0 ? average.toFixed(1) : "—"}</span>
        <span className="muted">{count} {reviewWord(count)}</span>
      </div>
      {count === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>Пока никто не оценил</div>
      ) : (
        <RatingBars dist={dist} />
      )}
    </div>
  );
}

export default function DrinkCard({ drink, rank, medals = true, onClick, ratingOpen, onRatingToggle, onRatingHover }) {
  const cover = mediaUrl(drink.coverUrl);
  // медали — только у настоящего топа рейтинга: в сортировке «по алфавиту» первое место
  // ничего не значит, и золотая рамка там врала бы
  const rankClass = !medals ? "" : rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
  const count = drink.reviewCount || 0;
  const specs = specSummary(drink);

  return (
    <div id={`drink-${drink.id}`} className={`drink-card ${rankClass} ${ratingOpen ? "info-open" : ""}`} onClick={onClick}>
      {/* у неоценённых карточек номера нет: они ничем не упорядочены между собой */}
      <div className={`drink-rank ${rankClass}`}>{rank ?? ""}</div>

      {cover ? (
        <img className="drink-thumb" src={cover} alt={drink.name} loading="lazy" decoding="async"
          style={coverStyle(drink.coverFitCard, drink.coverPosCard)} />
      ) : (
        <div className="drink-thumb drink-thumb-placeholder"><BoltIcon size={28} /></div>
      )}

      <div className="drink-card-body">
        <div className="drink-card-name">{drink.name}</div>
        {drink.brand && <span className="drink-card-brand">{drink.brand}</span>}
        {specs && <div className="drink-card-specs">{specs}</div>}
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
          {/* число оценок стоит рядом с баллом, а не только в попапе: без него «8.5» по двум
              отзывам и «8.5» по двадцати выглядят одинаково, а на телефоне попапа вообще нет */}
          <span className="rating-count">
            {count > 0 ? `${count} ${reviewWord(count)}` : "нет оценок"}
          </span>
          {ratingOpen && (
            <RatingPopup average={drink.averageRating} count={count} dist={drink.ratingDistribution} />
          )}
        </div>
      </div>
    </div>
  );
}
