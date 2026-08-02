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

/** Контраст двух цветов по WCAG: от 1 (неразличимы) до 21 (чёрное на белом). */
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Цвета медалей и оценок. Заданы для тёмной темы — на светлой затемняются до читаемого. */
const GOLD = "#ffb02e";
const SILVER = "#c9c9d6";
const BRONZE = "#d98a4f";

/**
 * Минимальный контраст акцентных цифр к поверхности карточки. 3:1 — норма WCAG для крупного
 * жирного текста, каким набраны оценка и номер места; берём с запасом.
 */
const ACCENT_MIN_CONTRAST = 3.5;

/**
 * Подгоняет цвет под фон: подмешивает чёрный (на светлой теме) или белый (на тёмной), пока
 * не наберётся нужный контраст. На тёмных фонах медальные цвета проходят сразу и остаются
 * ровно такими, как задумано; на светлых — золото само становится тёмно-янтарным, иначе
 * оценка «9.1» на белой карточке давала контраст 1.8:1, то есть не читалась вовсе.
 */
const readableOn = (color, bg, min = ACCENT_MIN_CONTRAST) => {
  const toward = isLightBg(bg) ? "#000000" : "#ffffff";
  let out = color;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    out = mix(color, toward, t);
    if (contrast(out, bg) >= min) break;
  }
  return out;
};

/** Возвращает объект CSS-переменных, выведенных из базового цвета фона. */
export function computePalette(base) {
  const W = "#ffffff";
  const K = "#000000";
  const light = isLightBg(base);

  // акцентные цвета считаются от поверхности карточки, а не от фона страницы:
  // именно на ней стоят и оценка, и номер места
  const surface = light ? mix(base, W, 0.55) : mix(base, W, 0.05);
  const text = light ? mix(K, base, 0.1) : mix(W, base, 0.06);
  const medals = {
    "--gold": readableOn(GOLD, surface),
    "--silver": readableOn(SILVER, surface),
    "--bronze": readableOn(BRONZE, surface),
  };

  if (light) {
    return {
      ...medals,
      "--bg": base,
      "--surface": surface,
      "--surface-2": mix(base, K, 0.035),
      "--surface-3": mix(base, K, 0.08),
      "--border": mix(base, K, 0.11),
      "--border-light": mix(base, K, 0.2),
      "--text": text,
      "--text-muted": mix(text, base, 0.46),
      // 0.5, а не 0.64: прежний оттенок давал 2.4:1 и на светлой теме читался с трудом
      "--text-faint": mix(text, base, 0.5),
      "--grid-line": "rgba(20, 20, 40, 0.05)",
      "--shadow": "0 6px 24px rgba(20, 20, 40, 0.10)",
      "--shadow-lg": "0 16px 48px rgba(20, 20, 40, 0.16)",
    };
  }

  return {
    ...medals,
    "--bg": base,
    "--surface": surface,
    "--surface-2": mix(base, W, 0.09),
    "--surface-3": mix(base, W, 0.15),
    "--border": mix(base, W, 0.13),
    "--border-light": mix(base, W, 0.21),
    "--text": text,
    "--text-muted": mix(text, base, 0.44),
    // 0.5 вместо 0.66 — на тёмной теме прежние 2.6:1 тоже были ниже нормы
    "--text-faint": mix(text, base, 0.5),
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
