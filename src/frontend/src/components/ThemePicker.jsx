import { useState } from "react";
import { useTheme } from "../ThemeContext";
import { isLightBg } from "../theme/palette";

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

  return (
    <div className="theme-picker">
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
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
