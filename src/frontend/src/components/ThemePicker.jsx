import { useState, useRef, useEffect } from "react";
import { useTheme } from "../ThemeContext";
import { isLightBg } from "../theme/palette";
import { isAuthenticated } from "../services/api";
import { ShareModal } from "./ShareControl";

function PaletteIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r="1.4" /><circle cx="17.5" cy="10.5" r="1.4" />
      <circle cx="8.5" cy="7.5" r="1.4" /><circle cx="6.5" cy="12.5" r="1.4" />
      <path d="M12 2a10 10 0 0 0 0 20c1.7 0 2.5-1.3 2-2.7-.4-1.1.4-2.3 1.6-2.3H18a4 4 0 0 0 4-4 10 10 0 0 0-10-11z" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}

const sameColor = (a, b) => (a || "").toLowerCase() === (b || "").toLowerCase();
/** Контрастный цвет галочки/обводки поверх образца. */
const onColor = (hex) => (isLightBg(hex) ? "#1a1a22" : "#ffffff");

function Swatch({ color, active, label, onClick }) {
  return (
    <button
      type="button"
      className={"theme-swatch" + (active ? " active" : "")}
      style={{ "--sw": color, color: onColor(color) }}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {active && <Check />}
    </button>
  );
}

export default function ThemePicker() {
  const {
    accent, setAccent, accentPresets,
    bg, setBg, bgPresets,
    radius, setRadius, radiusPresets,
    bgAnim, setBgAnim,
    resetAll, isDefault,
  } = useTheme();
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const ref = useRef(null);

  // Имя для расшаренной темы: по совпадающему пресету акцента, иначе «Моя тема».
  const themeName = (accentPresets.find((p) => sameColor(p.color, accent))?.name) || "Моя тема";
  const currentTheme = { name: themeName, accent, bg, radius, bgAnim };

  // Закрытие по клику вне окна. Backdrop тут не работает: у .navbar есть backdrop-filter,
  // из-за которого position:fixed-оверлей ограничивается высотой навбара и не ловит клики
  // по странице. Capture-фаза — чтобы не блокироваться stopPropagation на страницах.
  useEffect(() => {
    if (!open) return;
    const outside = (e) => !ref.current || !ref.current.contains(e.target);
    const onDoc = (e) => { if (outside(e)) setOpen(false); };
    // Прокрутка страницы закрывает меню; скролл внутри самого меню (overflow-y) — нет.
    const onScroll = (e) => { if (outside(e)) setOpen(false); };
    document.addEventListener("mousedown", onDoc, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={ref}>
      <button
        className="btn-icon"
        onClick={() => setOpen((v) => !v)}
        title="Оформление"
        aria-label="Оформление"
        aria-expanded={open}
      >
        <PaletteIcon />
      </button>

      {open && (
          <div className="theme-pop" role="menu">
            {/* Акцент */}
            <div className="theme-sec">
              <div className="theme-pop-title">Цвет акцента</div>
              <div className="theme-swatches">
                {accentPresets.map((p) => (
                  <Swatch
                    key={p.color}
                    color={p.color}
                    label={p.name}
                    active={sameColor(accent, p.color)}
                    onClick={() => setAccent(p.color)}
                  />
                ))}
              </div>
              <label className="theme-custom" title="Выбрать свой цвет акцента">
                <span className="theme-custom-dot" style={{ background: accent }} />
                <span>Свой цвет</span>
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
              </label>
            </div>

            {/* Фон / тема: светлый цвет = светлая тема */}
            <div className="theme-sec">
              <div className="theme-pop-title">Фон и тема</div>
              <div className="theme-swatches">
                {bgPresets.map((p) => (
                  <Swatch
                    key={p.color}
                    color={p.color}
                    label={p.name}
                    active={sameColor(bg, p.color)}
                    onClick={() => setBg(p.color)}
                  />
                ))}
              </div>
              <label className="theme-custom" title="Выбрать свой цвет фона (светлый = светлая тема)">
                <span className="theme-custom-dot" style={{ background: bg }} />
                <span>Свой фон</span>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
              </label>
            </div>

            {/* Скругление углов */}
            <div className="theme-sec">
              <div className="theme-pop-title">Скругление углов</div>
              <div className="theme-seg">
                {radiusPresets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className={"theme-seg-btn" + (radius === p.scale ? " on" : "")}
                    aria-pressed={radius === p.scale}
                    onClick={() => setRadius(p.scale)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Анимированный фон */}
            <div className="theme-sec">
              <button
                type="button"
                className={"theme-toggle" + (bgAnim ? " on" : "")}
                role="switch"
                aria-checked={bgAnim}
                onClick={() => setBgAnim(!bgAnim)}
              >
                <span className="theme-toggle-track"><span className="theme-toggle-knob" /></span>
                Анимированный фон
              </button>
            </div>

            <div className="theme-pop-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll} disabled={isDefault}>
                Сбросить всё
              </button>
              {isAuthenticated() && (
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => { setOpen(false); setShareOpen(true); }}>
                  ↗ Поделиться
                </button>
              )}
            </div>
          </div>
      )}

      {shareOpen && <ShareModal theme={currentTheme} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
