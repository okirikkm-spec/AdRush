import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import DrinkCard from "../components/DrinkCard";
import DrinkModal from "../components/DrinkModal";
import BrandFilter from "../components/BrandFilter";
import { fetchDrinks } from "../services/api";

export default function MainPage() {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  // id энергетика, у которого открыт попап с распределением оценок (одновременно — только один)
  const [openRatingId, setOpenRatingId] = useState(null);
  // null = фильтр не задан (показываем все); Set = показывать только эти бренды
  const [brandFilter, setBrandFilter] = useState(null);

  useEffect(() => {
    document.title = "AdRush — рейтинг энергетиков";
    fetchDrinks()
      .then((data) => setDrinks(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // уникальные бренды для фильтра (по алфавиту)
  const brands = useMemo(
    () => [...new Set(drinks.map((d) => d.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [drinks]
  );

  // количество продуктов по каждому бренду (для подписи в окне фильтра)
  const brandCounts = useMemo(() => {
    const m = {};
    for (const d of drinks) if (d.brand) m[d.brand] = (m[d.brand] || 0) + 1;
    return m;
  }, [drinks]);

  // сначала фильтруем, потом нумеруем — ранг считается среди отображаемых продуктов
  const items = useMemo(
    () =>
      drinks
        .filter((drink) => !brandFilter || !drink.brand || brandFilter.has(drink.brand))
        .map((drink, i) => ({ drink, rank: i + 1 })),
    [drinks, brandFilter]
  );

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-head" style={{ marginBottom: 24 }}>
          <h1 className="page-title">⚡ Рейтинг энергетиков</h1>
          {brands.length > 0 && (
            <BrandFilter
              brands={brands}
              selected={brandFilter ?? new Set(brands)}
              onChange={(next) => setBrandFilter(next)}
              counts={brandCounts}
            />
          )}
        </div>

        {loading && <div className="state">Загрузка…</div>}
        {error && <div className="state error-text">{error}</div>}
        {!loading && !error && drinks.length === 0 && (
          <div className="state">Энергетиков пока нет. Возможно, идёт первичный парсинг каталога — загляните позже.</div>
        )}
        {!loading && !error && drinks.length > 0 && items.length === 0 && (
          <div className="state">Нет энергетиков выбранных брендов.</div>
        )}

        <div className="drink-list">
          {items.map(({ drink, rank }) => (
            <DrinkCard
              key={drink.id}
              drink={drink}
              rank={rank}
              onClick={() => { setOpenRatingId(null); setSelected(drink); }}
              ratingOpen={openRatingId === drink.id}
              onRatingToggle={() => setOpenRatingId((id) => (id === drink.id ? null : drink.id))}
              onRatingHover={(show) => setOpenRatingId(show ? drink.id : null)}
            />
          ))}
        </div>
      </div>

      {selected && <DrinkModal drink={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
