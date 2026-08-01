import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDrinks, mediaUrl } from "../services/api";
import { coverStyle } from "../utils/coverStyle";
import { SearchIcon, CloseIcon } from "./icons";

const MAX_RESULTS = 8;

const norm = (s) => (s || "").toLowerCase().trim();

/** Релевантность совпадения: меньше — выше в списке; null — не подходит. */
function matchScore(drink, q) {
  const name = norm(drink.name);
  const brand = norm(drink.brand);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (brand.startsWith(q)) return 3;
  if (brand.includes(q)) return 4;
  return null;
}

/** Поиск энергетика по названию в шапке: выпадающий список с картинкой и оценкой,
 * клик по результату ведёт на главную и прокручивает/подсвечивает нужную карточку. */
export default function DrinkSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [drinks, setDrinks] = useState(null); // null — ещё не загружали
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const loadedRef = useRef(false);

  const ensureLoaded = () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetchDrinks().then(setDrinks).catch(() => { loadedRef.current = false; });
  };

  // закрытие по клику вне и по Escape (как в ThemePicker/BrandFilter)
  useEffect(() => {
    if (!open && !mobileOpen) return;
    const outside = (e) => !wrapRef.current || !wrapRef.current.contains(e.target);
    const onDoc = (e) => { if (outside(e)) { setOpen(false); setMobileOpen(false); } };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); setMobileOpen(false); } };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobileOpen]);

  const openMobile = () => {
    ensureLoaded();
    setMobileOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const q = norm(query);
  const results = useMemo(() => {
    if (!q || !drinks) return [];
    return drinks
      .map((d) => ({ drink: d, score: matchScore(d, q) }))
      .filter((r) => r.score !== null)
      .sort((a, b) => a.score - b.score || a.drink.name.localeCompare(b.drink.name, "ru"))
      .slice(0, MAX_RESULTS)
      .map((r) => r.drink);
  }, [drinks, q]);

  const pick = (drink) => {
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
    navigate(`/?focus=${drink.id}`);
  };

  return (
    <div className="navbar-search-wrap" ref={wrapRef}>
      <button
        type="button" className="btn-icon navbar-search-toggle"
        onClick={openMobile} aria-label="Поиск энергетиков"
      >
        <SearchIcon />
      </button>

      <div className={`navbar-search${mobileOpen ? " mobile-open" : ""}`}>
        <span className="navbar-search-icon"><SearchIcon /></span>
        <input
          ref={inputRef}
          className="navbar-search-input"
          type="search"
          name="drink-search"
          placeholder="Найти энергетик…"
          value={query}
          onFocus={() => { ensureLoaded(); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          aria-label="Поиск энергетиков"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-lpignore="true"
          data-1p-ignore
        />
        {query && (
          <button
            type="button" className="navbar-search-clear" aria-label="Очистить"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
          >
            <CloseIcon size={11} />
          </button>
        )}

        {open && q && (
          <div className="navbar-search-drop" role="listbox">
            {drinks === null ? (
              <div className="navbar-search-empty">Загрузка…</div>
            ) : results.length === 0 ? (
              <div className="navbar-search-empty">Ничего не найдено</div>
            ) : (
              results.map((drink) => {
                const cover = mediaUrl(drink.coverUrl);
                return (
                  <button
                    type="button" key={drink.id} className="navbar-search-item"
                    onClick={() => pick(drink)}
                  >
                    {cover ? (
                      <img
                        className="navbar-search-thumb" src={cover} alt="" loading="lazy" decoding="async"
                        style={coverStyle(drink.coverFitCard, drink.coverPosCard)}
                      />
                    ) : (
                      <div className="navbar-search-thumb navbar-search-thumb-placeholder">⚡</div>
                    )}
                    <span className="navbar-search-item-body">
                      <span className="navbar-search-item-name">{drink.name}</span>
                      {drink.brand && <span className="navbar-search-item-brand">{drink.brand}</span>}
                    </span>
                    <span className="navbar-search-item-rating">
                      {drink.averageRating > 0 ? drink.averageRating.toFixed(1) : "—"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
