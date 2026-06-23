import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { applyPalette, DEFAULT_BG } from "./theme/palette";

const ThemeContext = createContext();

/** Цвет акцента по умолчанию — фирменный красный AdRush (совпадает с --accent в App.css). */
export const DEFAULT_ACCENT = "#ff3b30";

/** Готовые палитры акцента: из --accent выводятся hover / dim / свечение / логотип. */
export const ACCENT_PRESETS = [
  { name: "Адреналин", color: "#ff3b30" },
  { name: "Закат", color: "#ff7a18" },
  { name: "Янтарь", color: "#ffb02e" },
  { name: "Лайм", color: "#36c93b" },
  { name: "Изумруд", color: "#10b981" },
  { name: "Океан", color: "#2e9bff" },
  { name: "Индиго", color: "#6366f1" },
  { name: "Аметист", color: "#a855f7" },
  { name: "Роза", color: "#ec4899" },
];

/** Базовый цвет фона: из него выводится вся палитра. Светлый цвет = светлая тема. */
export const BG_PRESETS = [
  { name: "Чёрный", color: "#0c0c10" },
  { name: "Графит", color: "#16171c" },
  { name: "Ночь", color: "#0d1422" },
  { name: "Тайга", color: "#0e1813" },
  { name: "Слива", color: "#17101c" },
  { name: "Светлый", color: "#f3f3f7" },
  { name: "Сепия", color: "#f2ead8" },
  { name: "Белый", color: "#ffffff" },
];

/** Масштаб скругления углов (--radius-scale). */
export const RADIUS_PRESETS = [
  { name: "Острые", scale: 0.3 },
  { name: "Обычные", scale: 1 },
  { name: "Круглые", scale: 1.7 },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const normHex = (c, fallback) => (typeof c === "string" && HEX_RE.test(c) ? c.toLowerCase() : fallback);

const lsGet = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
};
const lsSet = (key, value) => {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export function ThemeProvider({ children }) {
  const [accent, setAccentState] = useState(() => normHex(lsGet("ar-accent", DEFAULT_ACCENT), DEFAULT_ACCENT));
  const [bg, setBgState] = useState(() => normHex(lsGet("ar-bg", DEFAULT_BG), DEFAULT_BG));
  const [radius, setRadiusState] = useState(() => {
    const n = parseFloat(lsGet("ar-radius", "1"));
    return n >= 0 && n <= 3 ? n : 1;
  });
  const [bgAnim, setBgAnimState] = useState(() => lsGet("ar-bg-anim", "on") !== "off");

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    lsSet("ar-accent", accent);
  }, [accent]);

  useEffect(() => {
    applyPalette(document.documentElement, bg);
    lsSet("ar-bg", bg);
  }, [bg]);

  useEffect(() => {
    document.documentElement.style.setProperty("--radius-scale", String(radius));
    lsSet("ar-radius", String(radius));
  }, [radius]);

  useEffect(() => {
    if (bgAnim) document.documentElement.removeAttribute("data-bg-anim");
    else document.documentElement.setAttribute("data-bg-anim", "off");
    lsSet("ar-bg-anim", bgAnim ? "on" : "off");
  }, [bgAnim]);

  const setAccent = useCallback((c) => setAccentState(normHex(c, DEFAULT_ACCENT)), []);
  const setBg = useCallback((c) => setBgState(normHex(c, DEFAULT_BG)), []);
  const setRadius = useCallback((r) => setRadiusState(typeof r === "number" && r >= 0 && r <= 3 ? r : 1), []);
  const setBgAnim = useCallback((v) => setBgAnimState(!!v), []);

  const resetAll = useCallback(() => {
    setAccentState(DEFAULT_ACCENT);
    setBgState(DEFAULT_BG);
    setRadiusState(1);
    setBgAnimState(true);
  }, []);

  const isDefault =
    accent.toLowerCase() === DEFAULT_ACCENT.toLowerCase() &&
    bg.toLowerCase() === DEFAULT_BG.toLowerCase() &&
    radius === 1 &&
    bgAnim;

  return (
    <ThemeContext.Provider
      value={{
        accent,
        setAccent,
        accentPresets: ACCENT_PRESETS,
        bg,
        setBg,
        defaultBg: DEFAULT_BG,
        bgPresets: BG_PRESETS,
        radius,
        setRadius,
        radiusPresets: RADIUS_PRESETS,
        bgAnim,
        setBgAnim,
        resetAll,
        isDefault,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
