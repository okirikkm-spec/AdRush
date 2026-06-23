// Генерация полной палитры (фон, поверхности, текст, рамки, тени) из одного
// базового цвета фона. Светлый базовый цвет → светлая тема, тёмный → тёмная.
// Та же логика продублирована компактно в public/index.html (анти-мигание до загрузки бандла).

/** Базовый фон по умолчанию — фирменный «почти чёрный» AdRush. */
export const DEFAULT_BG = "#0c0c10";

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
const hx = (n) => clamp(n).toString(16).padStart(2, "0");

const parse = (h) => {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};

/** Линейное смешение двух hex-цветов (t: 0 → a, 1 → b), близко к color-mix in srgb. */
const mix = (a, b, t) => {
  const A = parse(a);
  const B = parse(b);
  return "#" + hx(A[0] + (B[0] - A[0]) * t) + hx(A[1] + (B[1] - A[1]) * t) + hx(A[2] + (B[2] - A[2]) * t);
};

/** Относительная яркость (WCAG) для определения «светлый/тёмный фон». */
const luminance = (h) => {
  const c = parse(h).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

export const isLightBg = (base) => luminance(base) > 0.45;

/** Возвращает объект CSS-переменных, выведенных из базового цвета фона. */
export function computePalette(base) {
  const W = "#ffffff";
  const K = "#000000";

  if (isLightBg(base)) {
    const text = mix(K, base, 0.1);
    return {
      "--bg": base,
      "--surface": mix(base, W, 0.55),
      "--surface-2": mix(base, K, 0.035),
      "--surface-3": mix(base, K, 0.08),
      "--border": mix(base, K, 0.11),
      "--border-light": mix(base, K, 0.2),
      "--text": text,
      "--text-muted": mix(text, base, 0.46),
      "--text-faint": mix(text, base, 0.64),
      "--grid-line": "rgba(20, 20, 40, 0.05)",
      "--shadow": "0 6px 24px rgba(20, 20, 40, 0.10)",
      "--shadow-lg": "0 16px 48px rgba(20, 20, 40, 0.16)",
    };
  }

  const text = mix(W, base, 0.06);
  return {
    "--bg": base,
    "--surface": mix(base, W, 0.05),
    "--surface-2": mix(base, W, 0.09),
    "--surface-3": mix(base, W, 0.15),
    "--border": mix(base, W, 0.13),
    "--border-light": mix(base, W, 0.21),
    "--text": text,
    "--text-muted": mix(text, base, 0.44),
    "--text-faint": mix(text, base, 0.66),
    "--grid-line": "rgba(255, 255, 255, 0.035)",
    "--shadow": "0 6px 28px rgba(0, 0, 0, 0.45)",
    "--shadow-lg": "0 16px 56px rgba(0, 0, 0, 0.6)",
  };
}

/** Применяет палитру к элементу (обычно documentElement) и синхронизирует meta theme-color. */
export function applyPalette(el, base) {
  const p = computePalette(base);
  Object.keys(p).forEach((k) => el.style.setProperty(k, p[k]));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p["--bg"]);
}
