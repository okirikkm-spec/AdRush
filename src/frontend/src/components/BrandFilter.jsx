import { useEffect, useState } from "react";
import { FilterIcon, CheckIcon } from "./icons";

/**
 * Фильтр по брендам: кнопка с иконкой фильтра + крупное всплывающее окно с выбором.
 *
 * @param brands   список всех доступных брендов
 * @param selected Set выбранных брендов (что показывать)
 * @param onChange коллбэк с новым Set выбранных брендов
 * @param counts   { бренд: количество продуктов } для отображения рядом с брендом
 */
export default function BrandFilter({ brands, selected, onChange, counts }) {
  const [open, setOpen] = useState(false);

  // закрытие по Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggle = (brand) => {
    const next = new Set(selected);
    next.has(brand) ? next.delete(brand) : next.add(brand);
    onChange(next);
  };

  const allSelected = brands.length > 0 && brands.every((b) => selected.has(b));
  const setAll = () => onChange(allSelected ? new Set() : new Set(brands));

  const activeCount = brands.filter((b) => selected.has(b)).length;
  const isFiltered = activeCount > 0 && activeCount < brands.length;

  return (
    <>
      <button
        className={`btn btn-secondary btn-sm brand-filter-btn ${isFiltered ? "active" : ""}`}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <FilterIcon />
        Фильтр
        {isFiltered && <span className="filter-count">{activeCount}</span>}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal modal-picker" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="picker-head">
              <div className="picker-head-main">
                <span className="picker-icon"><FilterIcon size={18} /></span>
                <div>
                  <h2 className="picker-title">Фильтр по брендам</h2>
                  <p className="picker-sub">Показывать энергетики выбранных брендов</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
            </div>

            <div className="picker-body">
              <button type="button" className={`opt opt-all ${allSelected ? "sel" : ""}`} onClick={setAll}>
                <span className="opt-check">{allSelected && <CheckIcon />}</span>
                <span className="opt-label">Все бренды</span>
                <span className="opt-meta">{brands.length}</span>
              </button>
              <div className="picker-divider" />
              <div className="opt-list">
                {brands.map((brand) => (
                  <button
                    type="button" key={brand}
                    className={`opt ${selected.has(brand) ? "sel" : ""}`}
                    onClick={() => toggle(brand)}
                  >
                    <span className="opt-check">{selected.has(brand) && <CheckIcon />}</span>
                    <span className="opt-label">{brand}</span>
                    {counts && <span className="opt-meta">{counts[brand] ?? 0}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="picker-foot">
              <span className="muted picker-foot-info">
                {activeCount === brands.length ? "Показаны все" : `Выбрано: ${activeCount} из ${brands.length}`}
              </span>
              <button className="btn btn-primary" onClick={() => setOpen(false)}>Готово</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
