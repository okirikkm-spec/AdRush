import { useEffect, useMemo, useState } from "react";
import { fetchDrinks } from "../services/api";

/**
 * Каталог для мини-игр: банки, список брендов для фильтра и уже отфильтрованный пул,
 * из которого набирается состав. Одинаково нужен всем режимам.
 *
 * @param brandFilter Set выбранных брендов или null (все)
 */
export function useGameCatalog(brandFilter) {
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDrinks()
      .then(setDrinks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const brands = useMemo(
    () => [...new Set(drinks.map((d) => d.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")),
    [drinks]
  );

  const brandCounts = useMemo(() => {
    const m = {};
    for (const d of drinks) if (d.brand) m[d.brand] = (m[d.brand] || 0) + 1;
    return m;
  }, [drinks]);

  const pool = useMemo(
    () => drinks.filter((d) => !brandFilter || !d.brand || brandFilter.has(d.brand)),
    [drinks, brandFilter]
  );

  return { drinks, loading, error, brands, brandCounts, pool };
}
