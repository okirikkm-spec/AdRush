import { useState, useRef, useEffect } from "react";
import { useTheme } from "../ThemeContext";
import { isLightBg } from "../theme/palette";
import { isAuthenticated } from "../services/api";
import { ShareModal } from "./ShareControl";
import { PaletteIcon, ShareIcon } from "./icons";

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

/**
 * «Свой цвет» — такой же кружок в общей сетке образцов, только в радужном ободке.
 * Отдельной строкой он занимал место, из-за которого окно приходилось прокручивать.
 */
function CustomSwatch({ value, active, label, onChange }) {
  return (
    <label
      className={"theme-swatch theme-swatch-custom" + (active ? " active" : "")}
      style={{ "--sw": value, color: onColor(value) }}
      title={label}
      aria-label={label}
    >
      {active && <Check />}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function ThemePicker() {
  const {
    accent, setAccent, accentPresets,
    bg, setBg, bgPresets,
    radius, setRadius, radiusPresets,
    bgAnim, setBgAnim,
    bgSpeed, setBgSpeed, bgSpeedRange,
    bgStyle, setBgStyle, bgStylePresets,
    resetAll, isDefault,
  } = useTheme();
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const ref = useRef(null);

  // Имя для расшаренной темы: по совпадающему пресету акцента, иначе «Моя тема».
  const themeName = (accentPresets.find((p) => sameColor(p.color, accent))?.name) || "Моя тема";
  const currentTheme = { name: themeName, accent, bg, radius, bgAnim, bgStyle, bgSpeed };

  const customAccent = !accentPresets.some((p) => sameColor(p.color, accent));
  const customBg = !bgPresets.some((p) => sameColor(p.color, bg));
  const speedOff = !bgAnim || bgStyle === "none";

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
        <PaletteIcon size={17} />
      </button>

      {open && (
          <div className="theme-pop" role="menu">
            <div className="theme-cols">
              {/* Акцент */}
              <div className="theme-sec theme-sec-colors">
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
                  <CustomSwatch
                    value={accent}
                    active={customAccent}
                    label="Свой цвет акцента"
                    onChange={setAccent}
                  />
                </div>
              </div>

              {/* Фон / тема: светлый цвет = светлая тема */}
              <div className="theme-sec theme-sec-colors">
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
                  <CustomSwatch
                    value={bg}
                    active={customBg}
                    label="Свой цвет фона (светлый = светлая тема)"
                    onChange={setBg}
                  />
                </div>
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

              {/* Рисунок заднего фона */}
              <div className="theme-sec">
                <div className="theme-pop-title">Задний фон</div>
                <div className="theme-seg">
                  {bgStylePresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={"theme-seg-btn" + (bgStyle === p.id ? " on" : "")}
                      aria-pressed={bgStyle === p.id}
                      onClick={() => setBgStyle(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Анимация фона и её скорость */}
              <div className="theme-sec theme-sec-anim">
                <button
                  type="button"
                  className={"theme-toggle" + (bgAnim ? " on" : "")}
                  role="switch"
                  aria-checked={bgAnim}
                  disabled={bgStyle === "none"}
                  title={bgStyle === "none" ? "Сначала выберите рисунок фона" : undefined}
                  onClick={() => setBgAnim(!bgAnim)}
                >
                  <span className="theme-toggle-track"><span className="theme-toggle-knob" /></span>
                  Анимация фона
                </button>
              </div>

              <div className="theme-sec">
                <div className="theme-pop-title">
                  Скорость <span className="theme-speed-val">{String(bgSpeed).replace(".", ",")}×</span>
                </div>
                <input
                  type="range"
                  className="theme-speed"
                  min={bgSpeedRange.min}
                  max={bgSpeedRange.max}
                  step={bgSpeedRange.step}
                  value={bgSpeed}
                  disabled={speedOff}
                  aria-label="Скорость анимации фона"
                  title={speedOff ? "Включите анимацию фона" : "Скорость анимации фона"}
                  onChange={(e) => setBgSpeed(parseFloat(e.target.value))}
                />
              </div>
            </div>

            <div className="theme-pop-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll} disabled={isDefault}>
                Сбросить всё
              </button>
              {isAuthenticated() && (
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => { setOpen(false); setShareOpen(true); }}>
                  <ShareIcon size={14} /> Поделиться
                </button>
              )}
            </div>
          </div>
      )}

      {shareOpen && <ShareModal theme={currentTheme} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
