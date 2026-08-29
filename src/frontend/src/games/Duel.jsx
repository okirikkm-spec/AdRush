import { useSwipeChoice } from "../hooks/useSwipeChoice";
import { reviewWord } from "../components/DrinkCard";
import { BoltIcon } from "../components/icons";
import { mediaUrl } from "../services/api";
import { coverStyle } from "../utils/coverStyle";
import { specSummary } from "../utils/specs";

/** Банка крупным планом — одинаково в арене и на пьедестале. */
export function DrinkArt({ drink, className = "game-art" }) {
  const cover = mediaUrl(drink.coverUrl);
  return (
    <span className={className}>
      {cover ? (
        <img src={cover} alt={drink.name} decoding="async"
          style={coverStyle(drink.coverFitModal, drink.coverPosModal)} />
      ) : (
        <span className="game-art-empty"><BoltIcon size={48} /></span>
      )}
    </span>
  );
}

/** Как выбирают каждую из двух банок: клавиша на ПК, сторона свайпа на телефоне. */
const SIDES = {
  first: { hotkey: "←", swipe: "Свайп влево" },
  second: { hotkey: "→", swipe: "Свайп вправо" },
};

/**
 * Одна из двух банок поединка: вся карточка — кнопка выбора. Общая для всех режимов,
 * различается только подписью сверху (tag) — «Царь · 3 победы», «Первый бой» и т. п.
 *
 * @param side    "first" или "second" — отсюда и клавиша, и сторона свайпа
 * @param crowned золотая рамка (в «Царе горы» — тот, кто держит гору)
 */
export function Fighter({ drink, tag, side = "first", crowned = false, showRating = false, onPick }) {
  const { hotkey, swipe } = SIDES[side];
  const specs = specSummary(drink);
  const count = drink.reviewCount || 0;

  return (
    <button type="button" className={"game-fighter" + (crowned ? " crowned" : "")} onClick={onPick}>
      <span className="game-tag">{tag}</span>

      <DrinkArt drink={drink} />

      <span className="game-name">{drink.name}</span>
      {drink.brand && <span className="drink-card-brand">{drink.brand}</span>}
      {specs && <span className="game-specs">{specs}</span>}

      {showRating && (
        <span className="game-rating">
          <b>{drink.averageRating > 0 ? drink.averageRating.toFixed(1) : "—"}</b>
          <span className="muted">{count > 0 ? `${count} ${reviewWord(count)}` : "нет оценок"}</span>
        </span>
      )}

      <span className={`game-pick game-pick-${side}`}>
        <span className="game-pick-key">Выбрать <kbd>{hotkey}</kbd></span>
        <span className="game-pick-swipe"><b>{hotkey}</b> {swipe}</span>
      </span>
    </button>
  );
}

/**
 * Пара банок с разделителем «VS». Ключи по id — новая пара въезжает анимацией.
 * На сенсорных экранах выбор ещё и свайпом: влево — первая, вправо — вторая.
 */
export function Arena({ left, right, onPickFirst, onPickSecond }) {
  const ref = useSwipeChoice(onPickFirst, onPickSecond);
  return (
    <>
      <div className="game-arena" ref={ref}>
        {left}
        <span className="game-vs">VS</span>
        {right}
      </div>
    </>
  );
}
