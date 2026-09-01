/**
 * Движок вырезания фона для редактора: из пикселей картинки и настроек считает альфа-канал.
 * Ничего не знает про React — только про пиксели и canvas (им растеризуем кисть и фигуры).
 *
 * Модель настроек:
 *  - colors — правила по цвету: цвет + допуск (радиус в RGB) + «искать только от краёв»
 *    (заливка от рамки внутрь: так удаляется именно ФОН, а белое на самой банке остаётся);
 *  - invertColors — оставить только выбранные цвета, а не удалять их;
 *  - invertResult — поменять местами удалённое и оставшееся;
 *  - ops — ручные правки (фигуры и мазки кисти) в порядке рисования: поздняя перекрывает раннюю;
 *  - feather — смягчение края (проходы усреднения 3×3 по границе).
 *
 * Все координаты в ops нормированы к [0..1], поэтому одни и те же настройки дают одинаковый
 * результат и на уменьшенном превью, и на полном разрешении при сохранении.
 */

/** Настройки «как раньше»: белый фон от краёв — то же, что сервер делает с пэкшотами. */
export const DEFAULT_SETTINGS = {
  colors: [{ rgb: [255, 255, 255], tolerance: 10, borderOnly: true }],
  invertColors: false,
  invertResult: false,
  ops: [],
  feather: 1,
};

/** Максимальная сторона рабочего превью: больше не нужно, а считается заметно быстрее. */
export const WORK_MAX_DIM = 1000;
/** Максимальная сторона результата (упирается в лимит загрузки 16 МБ). */
export const OUTPUT_MAX_DIM = 3000;

const MAX_DIST = Math.sqrt(3) * 255;

export function defaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

/** Пустые настройки: ничего не удаляется, всё рисует сам пользователь. */
export function emptySettings() {
  return { ...defaultSettings(), colors: [] };
}

export function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings));
}

/* ─────────────── Загрузка картинки ─────────────── */

/**
 * Грузит File или ссылку в img. Ссылку тянем через fetch в blob: так холст не «пачкается»
 * (tainted canvas) и с него можно снять пиксели — иначе редактор не смог бы ничего сохранить.
 */
export async function loadImage(source) {
  let url;
  if (typeof source === "string") {
    const res = await fetch(source, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Не удалось загрузить изображение");
    url = URL.createObjectURL(await res.blob());
  } else {
    url = URL.createObjectURL(source);
  }
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Формат изображения не поддерживается браузером"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

/** Пиксели картинки, уменьшенной так, чтобы длинная сторона была не больше maxDim. */
export function pixelsOf(img, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/* ─────────────── Цветовые правила ─────────────── */

function matches(data, i, rules) {
  const p = i * 4;
  const r = data[p];
  const g = data[p + 1];
  const b = data[p + 2];
  for (let k = 0; k < rules.length; k++) {
    const c = rules[k].rgb;
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    if ((Math.sqrt(dr * dr + dg * dg + db * db) / MAX_DIST) * 100 <= rules[k].tolerance) return true;
  }
  return false;
}

/**
 * Заливка от рамки внутрь по подходящим цветам (обход в ширину по 4 соседям).
 * Уже прозрачные пиксели считаем проходимыми — иначе у однажды вырезанной картинки
 * волна не доберётся до фона и поправить его второй раз бы не вышло.
 */
function floodFillFromBorder(data, w, h, rules, matched) {
  const n = w * h;
  const queue = new Int32Array(n);
  const seen = new Uint8Array(n);
  let head = 0;
  let tail = 0;

  const push = (idx) => {
    if (seen[idx]) return;
    if (data[idx * 4 + 3] !== 0 && !matches(data, idx, rules)) return;
    seen[idx] = 1;
    matched[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) push(idx - 1);
    if (x < w - 1) push(idx + 1);
    if (y > 0) push(idx - w);
    if (y < h - 1) push(idx + w);
  }
}

/**
 * Альфа по одним лишь цветовым правилам плюс карта maxAlpha — «что вообще можно вернуть».
 * У однажды вырезанной картинки цвет удалённых пикселей потерян (он занулён ради сжатия),
 * поэтому кисть возврата их не трогает: вернулась бы чёрная клякса.
 */
export function computeBase(data, w, h, settings) {
  const n = w * h;
  const base = new Uint8ClampedArray(n);
  const maxAlpha = new Uint8ClampedArray(n);
  const matched = new Uint8Array(n);

  const colors = settings.colors || [];
  const globalRules = colors.filter((c) => !c.borderOnly);
  const borderRules = colors.filter((c) => c.borderOnly);

  if (globalRules.length) {
    for (let i = 0; i < n; i++) if (matches(data, i, globalRules)) matched[i] = 1;
  }
  if (borderRules.length) floodFillFromBorder(data, w, h, borderRules, matched);

  const invColors = !!settings.invertColors;
  const invResult = !!settings.invertResult;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const srcA = data[p + 3];
    const restorable = srcA > 0 || data[p] > 0 || data[p + 1] > 0 || data[p + 2] > 0 ? 255 : 0;
    maxAlpha[i] = restorable;
    const keep = invColors ? matched[i] === 1 : matched[i] === 0;
    let a = keep ? srcA : 0;
    if (invResult) a = Math.max(0, restorable - a);
    base[i] = a;
  }
  return { base, maxAlpha };
}

/* ─────────────── Ручные правки ─────────────── */

/**
 * Контур «пера» в текущий путь. Сегмент между точками — прямая, дуга по своей контрольной
 * точке (op.curves[i], квадратичная кривая) либо кусок общего сглаживания (op.smooth —
 * замкнутый сплайн Катмулла-Рома, переведённый в кубические кривые).
 *
 * @param close замыкать ли контур: у готовой фигуры да, у недорисованной в редакторе нет
 */
export function appendPenPath(ctx, op, w, h, { close = true } = {}) {
  const pts = (op.points || []).map((p) => [p[0] * w, p[1] * h]);
  const n = pts.length;
  if (!n) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (n === 1) return;

  const segments = close ? n : n - 1;
  if (op.smooth) {
    // на незамкнутом контуре крайние точки дублируем, иначе кривая уводит хвост к началу
    const at = (i) => (close ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]);
    for (let i = 0; i < segments; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      ctx.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]);
    }
  } else {
    for (let i = 0; i < segments; i++) {
      const next = pts[(i + 1) % n];
      const ctrl = op.curves && op.curves[i];
      if (ctrl) ctx.quadraticCurveTo(ctrl[0] * w, ctrl[1] * h, next[0], next[1]);
      else ctx.lineTo(next[0], next[1]);
    }
  }
  if (close) ctx.closePath();
}

function addShapePath(ctx, op, w, h) {
  const p = op.points;
  if (!p || !p.length) return;
  if (op.kind === "pen") {
    appendPenPath(ctx, op, w, h);
    return;
  }
  if (op.kind === "rect" && p.length > 1) {
    ctx.rect(Math.min(p[0][0], p[1][0]) * w, Math.min(p[0][1], p[1][1]) * h,
      Math.abs(p[1][0] - p[0][0]) * w, Math.abs(p[1][1] - p[0][1]) * h);
    return;
  }
  if (op.kind === "ellipse" && p.length > 1) {
    ctx.ellipse(((p[0][0] + p[1][0]) / 2) * w, ((p[0][1] + p[1][1]) / 2) * h,
      (Math.abs(p[1][0] - p[0][0]) / 2) * w, (Math.abs(p[1][1] - p[0][1]) / 2) * h, 0, 0, Math.PI * 2);
    return;
  }
  ctx.moveTo(p[0][0] * w, p[0][1] * h);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] * w, p[i][1] * h);
  ctx.closePath();
}

/**
 * Все ручные правки в один слой: красный канал — «удалить», зелёный — «оставить».
 * Рисуем по порядку обычным source-over, поэтому поздняя правка перекрывает раннюю —
 * ровно как ожидаешь от кисти.
 */
export function rasterizeOps(ops, w, h) {
  if (!ops || !ops.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  for (const op of ops) {
    const color = op.action === "keep" ? "#00ff00" : "#ff0000";
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (op.kind === "brush") {
      const pts = op.points || [];
      if (!pts.length) continue;
      const line = Math.max(1, op.radius * 2 * w);
      ctx.lineWidth = line;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0][0] * w, pts[0][1] * h, line / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      // «снаружи»: рамка во всю картинку + сама фигура с правилом evenodd = дырка по фигуре
      if (op.outside) ctx.rect(0, 0, w, h);
      addShapePath(ctx, op, w, h);
      ctx.fill("evenodd");
    }
  }
  return ctx.getImageData(0, 0, w, h).data;
}

/** Смягчение края: усреднение 3×3 только там, где альфа меняется (иначе контур «рваный»). */
function smoothAlpha(alpha, w, h, passes) {
  let cur = alpha;
  for (let pass = 0; pass < passes; pass++) {
    const next = new Uint8ClampedArray(cur);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const c = cur[i];
        let sum = 0;
        let edge = false;
        for (let dy = -1; dy <= 1; dy++) {
          const row = i + dy * w;
          for (let dx = -1; dx <= 1; dx++) {
            const v = cur[row + dx];
            sum += v;
            if (v !== c) edge = true;
          }
        }
        if (edge) next[i] = sum / 9;
      }
    }
    cur = next;
  }
  return cur;
}

/** Итоговая альфа: цветовые правила + ручные правки поверх + смягчение края. */
export function compose(base, maxAlpha, opsData, feather, w, h) {
  const alpha = new Uint8ClampedArray(base);
  if (opsData) {
    for (let i = 0; i < alpha.length; i++) {
      const p = i * 4;
      const keep = opsData[p + 1];
      const erase = opsData[p];
      if (keep) alpha[i] = Math.max(alpha[i], Math.min(keep, maxAlpha[i]));
      else if (erase) alpha[i] = Math.min(alpha[i], 255 - erase);
    }
  }
  return feather > 0 ? smoothAlpha(alpha, w, h, feather) : alpha;
}

/** Картинка с посчитанной альфой. У полностью прозрачных пикселей зануляем цвет — так PNG легче. */
export function paint(data, alpha, w, h) {
  const out = new ImageData(w, h);
  const o = out.data;
  for (let i = 0; i < alpha.length; i++) {
    const p = i * 4;
    const a = alpha[i];
    if (a === 0) {
      o[p + 3] = 0;
      continue;
    }
    o[p] = data[p];
    o[p + 1] = data[p + 1];
    o[p + 2] = data[p + 2];
    o[p + 3] = a;
  }
  return out;
}

/** Весь конвейер разом — для превью и для финального сохранения. */
export function render(pixels, settings, { live = false, base } = {}) {
  const w = pixels.width;
  const h = pixels.height;
  const computed = base || computeBase(pixels.data, w, h, settings);
  const opsData = rasterizeOps(settings.ops, w, h);
  const alpha = compose(computed.base, computed.maxAlpha, opsData, live ? 0 : settings.feather, w, h);
  return paint(pixels.data, alpha, w, h);
}

/* ─────────────── Результат ─────────────── */

function toCanvas(imageData) {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
  return canvas;
}

function scaledCanvas(canvas, scale) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/**
 * PNG-файл из готовой картинки. Прозрачный PNG тяжелее исходного JPEG, поэтому если не влезаем
 * в лимит загрузки — уменьшаем: лучше картинка поменьше, чем ошибка «файл слишком большой».
 */
export async function toPngFile(imageData, name, maxBytes) {
  let canvas = toCanvas(imageData);
  for (let attempt = 0; ; attempt++) {
    const current = canvas;
    // eslint-disable-next-line no-await-in-loop
    const blob = await new Promise((resolve) => current.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Браузер не смог собрать PNG");
    if (blob.size <= maxBytes || attempt >= 2) return new File([blob], name, { type: "image/png" });
    canvas = scaledCanvas(current, 0.7);
  }
}

/** Цвет пикселя как [r, g, b] — для пипетки. */
export function pixelColor(pixels, x, y) {
  const px = Math.min(pixels.width - 1, Math.max(0, Math.round(x * pixels.width)));
  const py = Math.min(pixels.height - 1, Math.max(0, Math.round(y * pixels.height)));
  const p = (py * pixels.width + px) * 4;
  return [pixels.data[p], pixels.data[p + 1], pixels.data[p + 2]];
}

export function hex(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function rgbFromHex(value) {
  const m = /^#?([0-9a-f]{6})$/i.exec(value || "");
  if (!m) return null;
  const num = parseInt(m[1], 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
