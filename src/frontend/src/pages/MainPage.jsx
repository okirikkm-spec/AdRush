import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import DrinkCard from "../components/DrinkCard";
import DrinkModal from "../components/DrinkModal";
import { fetchDrinks } from "../services/api";

export default function MainPage() {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  // id энергетика, у которого открыт попап с распределением оценок (одновременно — только один)
  const [openRatingId, setOpenRatingId] = useState(null);

  useEffect(() => {
    document.title = "AdRush — рейтинг энергетиков";
    fetchDrinks()
      .then((data) => setDrinks(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Navbar />
      <div className="page">
        <h1 className="page-title" style={{ marginBottom: 24 }}>⚡ Рейтинг Adrenaline Rush</h1>

        {loading && <div className="state">Загрузка…</div>}
        {error && <div className="state error-text">{error}</div>}
        {!loading && !error && drinks.length === 0 && (
          <div className="state">Энергетиков пока нет. Возможно, идёт первичный парсинг каталога — загляните позже.</div>
        )}

        <div className="drink-list">
          {drinks.map((drink, i) => (
            <DrinkCard
              key={drink.id}
              drink={drink}
              rank={i + 1}
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
