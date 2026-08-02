import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import DrinkCard from "../components/DrinkCard";
import DrinkModal from "../components/DrinkModal";
import BrandFilter from "../components/BrandFilter";
import { BoltIcon } from "../components/icons";
import Footer from "../components/Footer";
import { fetchDrinks } from "../services/api";

/**
 * Порядок списка. «По рейтингу» — то, как отдал сервер: там средняя оценка сглажена по Байесу,
 * поэтому карточка с одним восторженным отзывом не обгоняет проверенную десятком.
 */
const SORTS = [
  { id: "rating", label: "По рейтингу" },
  { id: "reviews", label: "Больше оценок" },
  { id: "new", label: "Новинки" },
  { id: "name", label: "По алфавиту" },
];

/** Пункт появляется, только когда кофеин хоть у кого-то заполнен — иначе сортировать нечего. */
const CAFFEINE_SORT = { id: "caffeine", label: "Больше кофеина" };

export default function MainPage() {
  const { id } = useParams();           // deep-link /drink/:id открывает модалку
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightReviewId = searchParams.get("review"); // ?review=NN — прокрутить к отзыву
  const [drinks, setDrinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // id энергетика, для которого открыта модалка (по клику на карточку или из URL)
  const [openId, setOpenId] = useState(null);
  // id энергетика, у которого открыт попап с распределением оценок (одновременно — только один)
  const [openRatingId, setOpenRatingId] = useState(null);
  // null = фильтр не задан (показываем все); Set = показывать только эти бренды
  const [brandFilter, setBrandFilter] = useState(null);
  const [sort, setSort] = useState("rating");
  // неоценённые карточки прячем под кнопку: их две трети каталога, и без этого рейтинг
  // заканчивался на шестом экране, а дальше шли одинаковые строки с прочерком
  const [showUnrated, setShowUnrated] = useState(false);

  const loadDrinks = useCallback(
    () => fetchDrinks().then((data) => setDrinks(data)).catch((e) => setError(e.message)),
    []
  );

  useEffect(() => {
    document.title = "AdRush";
    loadDrinks().finally(() => setLoading(false));
  }, [loadDrinks]);

  // открыть модалку по deep-link /drink/:id
  useEffect(() => { setOpenId(id ? Number(id) : null); }, [id]);

  // прокрутка и подсветка карточки, на которую перешли из поиска в шапке (?focus=id)
  const focusId = searchParams.get("focus") ? Number(searchParams.get("focus")) : null;
  const scrolledToFocus = useRef(null);
  useEffect(() => {
    if (!focusId || drinks.length === 0 || scrolledToFocus.current === focusId) return;
    const target = drinks.find((d) => d.id === focusId);
    if (!target) return;
    // карточка скрыта текущим фильтром брендов — сбрасываем его, чтобы её было видно
    if (brandFilter && target.brand && !brandFilter.has(target.brand)) {
      setBrandFilter(null);
      return;
    }
    // …или лежит в свёрнутом блоке неоценённых — раскрываем его
    if (!(target.reviewCount || 0)) setShowUnrated(true);
    const el = document.getElementById(`drink-${focusId}`);
    if (!el) return;
    scrolledToFocus.current = focusId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("drink-flash");
    const t = setTimeout(() => el.classList.remove("drink-flash"), 2300);
    return () => clearTimeout(t);
  }, [focusId, drinks, brandFilter, showUnrated]);

  const closeModal = () => {
    setOpenId(null);
    if (id) navigate("/", { replace: true });
  };

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

  const sortOptions = useMemo(
    () => (drinks.some((d) => d.caffeinePer100Ml != null) ? [...SORTS, CAFFEINE_SORT] : SORTS),
    [drinks]
  );

  // сначала фильтруем и сортируем, потом нумеруем — место считается среди показанных карточек
  const visible = useMemo(() => {
    const list = drinks.filter((drink) => !brandFilter || !drink.brand || brandFilter.has(drink.brand));
    switch (sort) {
      case "reviews":
        return [...list].sort((a, b) =>
          (b.reviewCount || 0) - (a.reviewCount || 0) || (b.averageRating || 0) - (a.averageRating || 0));
      case "new":
        return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      case "name":
        return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
      case "caffeine":
        return [...list].sort((a, b) => (b.caffeinePer100Ml ?? -1) - (a.caffeinePer100Ml ?? -1));
      default:
        return list; // порядок сервера — байесовский рейтинг
    }
  }, [drinks, brandFilter, sort]);

  // Оценённые формируют собственно рейтинг, остальные — каталог под кнопкой. Делим только в
  // сортировке по рейтингу: в «новинках» или «по алфавиту» прятать неоценённые бессмысленно —
  // как раз они там и нужны.
  const splitUnrated = sort === "rating";
  const rated = useMemo(
    () => (splitUnrated ? visible.filter((d) => (d.reviewCount || 0) > 0) : visible),
    [visible, splitUnrated]
  );
  const unrated = useMemo(
    () => (splitUnrated ? visible.filter((d) => !(d.reviewCount || 0)) : []),
    [visible, splitUnrated]
  );

  const card = (drink, rank) => (
    <DrinkCard
      key={drink.id}
      drink={drink}
      rank={rank}
      medals={sort === "rating" && rank != null}
      onClick={() => { setOpenRatingId(null); setOpenId(drink.id); }}
      ratingOpen={openRatingId === drink.id}
      onRatingToggle={() => setOpenRatingId((rid) => (rid === drink.id ? null : drink.id))}
      onRatingHover={(show) => setOpenRatingId(show ? drink.id : null)}
    />
  );

  return (
    <>
      <Navbar />
      <div className="page page-wide">
        <div className="page-head" style={{ marginBottom: 24 }}>
          <h1 className="page-title"><BoltIcon size={24} /> Рейтинг энергетиков</h1>
          <div className="page-tools">
            <label className="sort-control">
              <span className="sort-label">Сортировка</span>
              <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {sortOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            {brands.length > 0 && (
              <BrandFilter
                brands={brands}
                selected={brandFilter ?? new Set(brands)}
                onChange={(next) => setBrandFilter(next)}
                counts={brandCounts}
              />
            )}
          </div>
        </div>

        {loading && <div className="state">Загрузка…</div>}
        {error && <div className="state error-text">{error}</div>}
        {!loading && !error && drinks.length === 0 && (
          <div className="state">Энергетиков пока нет. Возможно, идёт первичный парсинг каталога — загляните позже.</div>
        )}
        {!loading && !error && drinks.length > 0 && rated.length === 0 && unrated.length === 0 && (
          <div className="state">Нет энергетиков выбранных брендов.</div>
        )}

        <div className="drink-list">
          {rated.map((drink, i) => card(drink, i + 1))}
        </div>

        {unrated.length > 0 && (
          <div className="catalog-rest">
            <div className="catalog-rest-head">
              <div>
                <div className="catalog-rest-title">Ещё не оценены</div>
                <div className="catalog-rest-hint">
                  {unrated.length} {unrated.length % 10 === 1 && unrated.length % 100 !== 11 ? "напиток" : "напитков"} без
                  единой оценки — откройте любой и станьте первым.
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowUnrated((v) => !v)}>
                {showUnrated ? "Свернуть" : "Показать весь каталог"}
              </button>
            </div>
            {showUnrated && (
              <div className="drink-list" style={{ marginTop: 16 }}>
                {unrated.map((drink) => card(drink, null))}
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />

      {openId != null && (
        <DrinkModal
          drinkId={openId}
          summary={drinks.find((d) => d.id === openId) || null}
          siblings={drinks}
          highlightReviewId={highlightReviewId}
          onClose={closeModal}
          onChanged={loadDrinks}
        />
      )}
    </>
  );
}
