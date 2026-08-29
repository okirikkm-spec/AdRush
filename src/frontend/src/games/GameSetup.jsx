import BrandFilter from "../components/BrandFilter";

/** Размеры состава. Отдельной кнопкой — «все» (сотня поединков на любителя). */
export const SIZES = [8, 16, 32];

/**
 * Экран состава — общий для всех режимов: сколько банок участвует, какие бренды и
 * показывать ли оценки сайта. Состоянием владеет страница режима, здесь только разметка.
 *
 * @param size      действующий размер состава (0 — весь пул)
 * @param sizeHint  подпись под «Участников» — у режимов она разная
 * @param footer    строка под кнопкой (рекорд, прошлый чемпион…)
 */
export default function GameSetup({
  pool, brands, brandCounts, brandFilter, onBrandFilter,
  size, onSize, showRatings, onShowRatings,
  sizeHint, startLabel = "Начать", onStart, footer,
}) {
  return (
    <div className="game-setup">
      <div className="game-setup-row">
        <div>
          <div className="game-setup-label">Участников</div>
          <div className="game-setup-hint">{sizeHint}</div>
        </div>
        <div className="game-sizes">
          {SIZES.map((s) => (
            <button type="button" key={s} disabled={s > pool.length}
              className={"game-size" + (size === s ? " on" : "")}
              onClick={() => onSize(s)}>
              {s}
            </button>
          ))}
          <button type="button" className={"game-size" + (size === 0 ? " on" : "")}
            onClick={() => onSize(0)}>
            Все · {pool.length}
          </button>
        </div>
      </div>

      <div className="game-setup-row">
        <div>
          <div className="game-setup-label">Бренды</div>
          <div className="game-setup-hint">
            {brandFilter && brandFilter.size < brands.length
              ? `Выбрано брендов: ${brandFilter.size} из ${brands.length}`
              : "Участвуют все бренды каталога"}
          </div>
        </div>
        {brands.length > 0 && (
          <BrandFilter brands={brands} selected={brandFilter ?? new Set(brands)}
            onChange={onBrandFilter} counts={brandCounts} />
        )}
      </div>

      <div className="game-setup-row">
        <button type="button" className={"theme-toggle" + (showRatings ? " on" : "")}
          role="switch" aria-checked={showRatings} onClick={() => onShowRatings(!showRatings)}>
          <span className="theme-toggle-track"><span className="theme-toggle-knob" /></span>
          Показывать оценки сайта
        </button>
      </div>

      {pool.length < 2 ? (
        <div className="error-text">Под выбранные бренды подходит меньше двух банок.</div>
      ) : (
        <button className="btn btn-primary btn-lg" style={{ marginTop: 16 }} onClick={onStart}>
          {startLabel}
        </button>
      )}

      {footer}
    </div>
  );
}
