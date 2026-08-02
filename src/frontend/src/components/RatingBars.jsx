const SCORES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/**
 * Распределение оценок по баллам. Один и тот же блок нужен и в попапе карточки списка, и на
 * странице напитка — там он до этого просто отсутствовал, хотя данные приходили те же.
 *
 * @param dist карта «балл → количество» (ключи 1–10)
 */
export default function RatingBars({ dist }) {
  const values = SCORES.map((s) => dist?.[s] || 0);
  const max = Math.max(1, ...values);

  return (
    <div className="rating-bars">
      {SCORES.map((score) => {
        const count = dist?.[score] || 0;
        return (
          <div className="rating-bar-row" key={score}>
            <span className="rating-bar-label">{score}</span>
            <span className="rating-bar-track">
              <span className="rating-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="rating-bar-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
