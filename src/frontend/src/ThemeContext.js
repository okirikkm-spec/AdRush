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

/**
 * Стиль заднего фона. «Сетка» — CSS-сетка с волной, «Контуры» — светящаяся
 * топографическая карта на WebGL (см. components/FlowBackground.jsx), берущая цвета
 * из текущей палитры.
 */
export const BG_STYLE_PRESETS = [
  { id: "grid", name: "Сетка" },
  { id: "flow", name: "Контуры" },
  { id: "none", name: "Нет" },
];

export const DEFAULT_BG_STYLE = "grid";

/**
 * Скорость анимации фона: множитель к «обычной». Уезжает в CSS-переменную --bg-speed,
 * из которой её берут и сетка (calc по длительности), и шейдер контуров.
 */
export const DEFAULT_BG_SPEED = 1;
export const BG_SPEED = { min: 0.25, max: 3, step: 0.25 };

/** Масштаб скругления углов (--radius-scale). */
export const RADIUS_PRESETS = [
  { name: "Острые", scale: 0.3 },
  { name: "Обычные", scale: 1 },
  { name: "Круглые", scale: 1.7 },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const normHex = (c, fallback) => (typeof c === "string" && HEX_RE.test(c) ? c.toLowerCase() : fallback);
const normBgStyle = (s, fallback) =>
  BG_STYLE_PRESETS.some((p) => p.id === s) ? s : fallback;
const normSpeed = (v, fallback) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!(n > 0)) return fallback;
  const snapped = Math.round(n / BG_SPEED.step) * BG_SPEED.step;
  return Math.min(BG_SPEED.max, Math.max(BG_SPEED.min, snapped));
};

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

/**
 * Анимированный фон по умолчанию: включён на десктопе, выключен на мобильных/тач-устройствах
 * (экономит батарею и держит прокрутку плавной). Применяется, только пока пользователь
 * сам не выбрал значение — сохранённый выбор всегда в приоритете.
 */
function defaultBgAnim() {
  try {
    const mobile =
      window.matchMedia("(max-width: 760px)").matches ||
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    return !mobile;
  } catch {
    return true;
  }
}

export function ThemeProvider({ children }) {
  const [accent, setAccentState] = useState(() => normHex(lsGet("ar-accent", DEFAULT_ACCENT), DEFAULT_ACCENT));
  const [bg, setBgState] = useState(() => normHex(lsGet("ar-bg", DEFAULT_BG), DEFAULT_BG));
  const [radius, setRadiusState] = useState(() => {
    const n = parseFloat(lsGet("ar-radius", "1"));
    return n >= 0 && n <= 3 ? n : 1;
  });
  const [bgStyle, setBgStyleState] = useState(() =>
    normBgStyle(lsGet("ar-bg-style", DEFAULT_BG_STYLE), DEFAULT_BG_STYLE));
  // Предпросмотр чужой темы не трогает сохранённый выбор — просто перекрывает его.
  const [bgStylePreview, setBgStylePreview] = useState(null);
  const [bgSpeed, setBgSpeedState] = useState(() =>
    normSpeed(lsGet("ar-bg-speed", DEFAULT_BG_SPEED), DEFAULT_BG_SPEED));
  const [bgAnim, setBgAnimState] = useState(() => {
    const stored = lsGet("ar-bg-anim", null);
    return stored === null ? defaultBgAnim() : stored !== "off";
  });

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

  const activeBgStyle = bgStylePreview || bgStyle;

  useEffect(() => {
    document.documentElement.setAttribute("data-bg-style", activeBgStyle);
  }, [activeBgStyle]);

  useEffect(() => {
    lsSet("ar-bg-style", bgStyle);
  }, [bgStyle]);

  useEffect(() => {
    document.documentElement.style.setProperty("--bg-speed", String(bgSpeed));
    lsSet("ar-bg-speed", String(bgSpeed));
  }, [bgSpeed]);

  useEffect(() => {
    if (bgAnim) document.documentElement.removeAttribute("data-bg-anim");
    else document.documentElement.setAttribute("data-bg-anim", "off");
    lsSet("ar-bg-anim", bgAnim ? "on" : "off");
  }, [bgAnim]);

  const setAccent = useCallback((c) => setAccentState(normHex(c, DEFAULT_ACCENT)), []);
  const setBg = useCallback((c) => setBgState(normHex(c, DEFAULT_BG)), []);
  const setRadius = useCallback((r) => setRadiusState(typeof r === "number" && r >= 0 && r <= 3 ? r : 1), []);
  const setBgAnim = useCallback((v) => setBgAnimState(!!v), []);
  const setBgSpeed = useCallback((v) => setBgSpeedState((prev) => normSpeed(v, prev)), []);
  const setBgStyle = useCallback((s) => {
    setBgStylePreview(null);
    setBgStyleState((prev) => normBgStyle(s, prev));
  }, []);

  /**
   * Живой предпросмотр темы: применяет CSS-переменные напрямую к :root, НЕ трогая состояние
   * и localStorage. Нужен, чтобы «примерить» чужую тему перед установкой. Снимается endPreview().
   */
  const previewTheme = useCallback((t) => {
    if (!t) return;
    const root = document.documentElement;
    if (t.accent) root.style.setProperty("--accent", normHex(t.accent, accent));
    if (t.bg) applyPalette(root, normHex(t.bg, bg));
    if (typeof t.radius === "number") root.style.setProperty("--radius-scale", String(t.radius));
    if (typeof t.bgAnim === "boolean") {
      if (t.bgAnim) root.removeAttribute("data-bg-anim");
      else root.setAttribute("data-bg-anim", "off");
    }
    // Старые расшаренные темы без скорости приходят нулём — оставляем свою.
    if (t.bgSpeed) root.style.setProperty("--bg-speed", String(normSpeed(t.bgSpeed, bgSpeed)));
    if (t.bgStyle) setBgStylePreview(normBgStyle(t.bgStyle, bgStyle));
  }, [accent, bg, bgStyle, bgSpeed]);

  /** Возвращает оформление к сохранённому (снимает предпросмотр). */
  const endPreview = useCallback(() => {
    setBgStylePreview(null);
    const root = document.documentElement;
    root.style.setProperty("--accent", accent);
    applyPalette(root, bg);
    root.style.setProperty("--radius-scale", String(radius));
    root.style.setProperty("--bg-speed", String(bgSpeed));
    if (bgAnim) root.removeAttribute("data-bg-anim");
    else root.setAttribute("data-bg-anim", "off");
  }, [accent, bg, radius, bgAnim, bgSpeed]);

  const resetAll = useCallback(() => {
    setAccentState(DEFAULT_ACCENT);
    setBgState(DEFAULT_BG);
    setRadiusState(1);
    setBgAnimState(defaultBgAnim());
    setBgStyleState(DEFAULT_BG_STYLE);
    setBgStylePreview(null);
    setBgSpeedState(DEFAULT_BG_SPEED);
  }, []);

  const isDefault =
    accent.toLowerCase() === DEFAULT_ACCENT.toLowerCase() &&
    bg.toLowerCase() === DEFAULT_BG.toLowerCase() &&
    radius === 1 &&
    bgStyle === DEFAULT_BG_STYLE &&
    bgSpeed === DEFAULT_BG_SPEED &&
    bgAnim === defaultBgAnim();

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
        bgSpeed,
        setBgSpeed,
        bgSpeedRange: BG_SPEED,
        bgStyle,
        setBgStyle,
        activeBgStyle,
        bgStylePresets: BG_STYLE_PRESETS,
        previewTheme,
        endPreview,
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
