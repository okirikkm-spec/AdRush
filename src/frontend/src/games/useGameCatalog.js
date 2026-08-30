import { useEffect, useMemo, useState } from "react";
import { fetchDrinks } from "../services/api";

/** Банка с оценкой — по ней уже есть хотя бы один отзыв на сайте. */
const isRated = (d) => (d.reviewCount || 0) > 0;

/**
 * Каталог для мини-игр: банки, список брендов для фильтра и уже отфильтрованный пул,
 * из которого набирается состав. Одинаково нужен всем режимам.
 *
 * @param brandFilter Set выбранных брендов или null (все)
 * @param ratedOnly   брать только банки с оценками (в каталоге много ещё не оценённых
 *                    находок парсеров — с ними поединки превращаются в лотерею)
 */
export function useGameCatalog(brandFilter, ratedOnly = false) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDrinks()
      .then(setDrinks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  /* База для фильтра по брендам и для пула: при «только оценённые» бренды и их
     счётчики тоже считаем по оценённым — иначе бренд обещал бы 20 банок, а в игру
     шли две. */
  const base = useMemo(() => (ratedOnly ? drinks.filter(isRated) : drinks), [drinks, ratedOnly]);

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

  /** Сколько банок каталога вообще имеют оценку — для подписи у переключателя. */
  const ratedCount = useMemo(() => drinks.filter(isRated).length, [drinks]);

  return { drinks, loading, error, brands, brandCounts, pool, ratedCount };
}
