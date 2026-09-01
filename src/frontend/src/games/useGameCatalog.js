import { useEffect, useMemo, useState } from "react";
import { fetchDrinks, fetchMyRatings, isAuthenticated } from "../services/api";

/**
 * Каталог для мини-игр: банки, список брендов для фильтра и уже отфильтрованный пул,
 * из которого набирается состав. Одинаково нужен всем режимам.
 *
 * @param brandFilter Set выбранных брендов или null (все)
 * @param mineOnly    брать только банки, которые оценил сам игрок
 */
export function useGameCatalog(brandFilter, mineOnly = false) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // id банок, которые игрок уже оценил. null — гость или ещё не загрузили
  const [myRated, setMyRated] = useState(null);

  useEffect(() => {
    fetchDrinks()
      .then(setDrinks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  /* Оценки тянем сразу, не дожидаясь включения фильтра: тогда переключатель
     работает мгновенно и может показать, сколько банок игрок уже оценил.
     Ошибку не показываем — без своих оценок игра просто идёт по всему каталогу. */
  useEffect(() => {
    if (!isAuthenticated()) return;
    fetchMyRatings()
      .then((map) => setMyRated(new Set(Object.keys(map || {}).map(Number))))
      .catch(() => setMyRated(new Set()));
  }, []);

  /* База для фильтра по брендам и для пула: при «только оценённые мной» бренды и
     их счётчики тоже считаем по своим оценкам — иначе бренд обещал бы 20 банок, а
     в игру шли две. */
  const base = useMemo(
    () => (mineOnly && myRated ? drinks.filter((d) => myRated.has(d.id)) : drinks),
    [drinks, mineOnly, myRated]
  );

  const brands = useMemo(
    () => [...new Set(base.map((d) => d.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [base]
  );

  const brandCounts = useMemo(() => {
    const m = {};
    for (const d of base) if (d.brand) m[d.brand] = (m[d.brand] || 0) + 1;
    return m;
  }, [base]);

  const pool = useMemo(
    () => base.filter((d) => !brandFilter || !d.brand || brandFilter.has(d.brand)),
    [base, brandFilter]
  );

  return {
    drinks, loading, error, brands, brandCounts, pool,
    /** Сколько банок оценил сам игрок — для подписи у переключателя. */
    myRatedCount: myRated ? myRated.size : 0,
    /** Гостю фильтр по своим оценкам нечем наполнить — переключатель выключен. */
    canFilterMine: myRated !== null,
  };
}
