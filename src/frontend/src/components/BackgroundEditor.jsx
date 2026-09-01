import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  OUTPUT_MAX_DIM, WORK_MAX_DIM,
  appendPenPath, compose, computeBase, defaultSettings, emptySettings, hex, loadImage,
  paint, pixelColor, pixelsOf, rasterizeOps, render, rgbFromHex, toPngFile,
} from "../utils/backgroundMask";

/** Лимит загрузки на сервере — 16 МБ; берём с запасом на границы multipart. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
/** Глубина «Отменить». */
const HISTORY_LIMIT = 40;

const TOOLS = [
  { id: "pick", label: "Пипетка", hint: "Клик по картинке — добавить её цвет в список фона" },
  { id: "erase", label: "Стереть", hint: "Кисть: убирает то, по чему проводите" },
  { id: "restore", label: "Вернуть", hint: "Кисть: возвращает удалённое обратно" },
  { id: "rect", label: "Прямоуг.", hint: "Прямоугольная область" },
  { id: "ellipse", label: "Эллипс", hint: "Овальная область" },
  { id: "lasso", label: "Лассо", hint: "Произвольный контур: ведите мышью, не отпуская" },
  { id: "pen", label: "Перо",
    hint: "Клик — точка, тяните вершины и середины линий, Enter — замкнуть, Backspace — убрать точку" },
];

const BRUSH_TOOLS = ["erase", "restore"];
const SHAPE_TOOLS = ["rect", "ellipse", "lasso", "pen"];

function ToolIcon({ id }) {
  const common = {
    width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
  };
  switch (id) {
    case "pick":
      return <svg {...common}><path d="M18 3l3 3-9 9-3 0 0-3z" /><path d="M8.5 12.5L4 17v3h3l4.5-4.5" /></svg>;
    case "erase":
      return <svg {...common}><path d="M4 21h16" /><path d="M7 17l9-9-4-4-9 9z" /></svg>;
    case "restore":
      return <svg {...common}><path d="M4 21h16" /><path d="M6 15l7-7-3-3-7 7z" /><path d="M17 4v6M14 7h6" /></svg>;
    case "rect":
      return <svg {...common}><rect x="4" y="5.5" width="16" height="13" rx="2" /></svg>;
    case "ellipse":
      return <svg {...common}><ellipse cx="12" cy="12" rx="8" ry="6.5" /></svg>;
    case "lasso":
      return <svg {...common}><path d="M12 4c4.4 0 8 2.7 8 6s-3.6 6-8 6c-1 0-2-.1-2.9-.4" /><path d="M9.1 15.6C6.1 14.7 4 12.6 4 10c0-3.3 3.6-6 8-6" /><path d="M9 16c-.6 1.2-.3 2.6.8 3.3" /></svg>;
    case "pen":
      return <svg {...common}><path d="M4 17l5-9 5 4 6-8" /><circle cx="4" cy="17" r="1.6" /><circle cx="9" cy="8" r="1.6" /><circle cx="14" cy="12" r="1.6" /><circle cx="20" cy="4" r="1.6" /></svg>;
    default:
      return null;
  }
}

let opSeq = 0;

/**
 * Редактор фона: цвета с допуском, произвольные области (прямоугольник, эллипс, лассо, перо),
 * кисти «стереть»/«вернуть», инверсии — всё считается прямо в браузере с живым превью.
 *
 * По умолчанию открывается с теми же настройками, что применяет сервер к пэкшотам
 * (белый фон от краёв), поэтому «ничего не трогая» получаем прежний результат.
 *
 * @param source File или ссылка на картинку (ссылка — только со своего домена: иначе с холста
 *               нельзя снять пиксели)
 * @param onApply получает готовый PNG-файл; пока промис не разрешён, окно показывает «Сохраняю…»
 */
export default function BackgroundEditor({ source, title = "Фон изображения",
                                           fileName = "cut.png", onCancel, onApply }) {
  const [pixels, setPixels] = useState(null);       // ImageData рабочего размера
  const [settings, setSettings] = useState(defaultSettings);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [tool, setTool] = useState("pick");
  const [brush, setBrush] = useState(28);           // диаметр кисти в пикселях рабочего холста
  const [shapeAction, setShapeAction] = useState("erase");
  const [shapeOutside, setShapeOutside] = useState(false);
  const [preview, setPreview] = useState("checker");
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [penActive, setPenActive] = useState(false);
  const [penSmooth, setPenSmooth] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);    // зажат пробел — курсор «рука»

  const imgRef = useRef(null);
  const settingsRef = useRef(settings);
  const baseRef = useRef(null);                     // {base, maxAlpha} для текущих цветовых правил
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const stageRef = useRef(null);
  const wrapRef = useRef(null);
  const panRef = useRef(null);                      // точка, от которой тянем картинку
  const draftRef = useRef(null);                    // фигура/мазок, который сейчас рисуют
  const penRef = useRef(null);                      // { points, curves } недорисованного контура
  const penDragRef = useRef(null);                  // что тянем у контура: вершину или изгиб
  const brushSizeRef = useRef(null);                // ПКМ тянут размер кисти: откуда начали
  const cursorRef = useRef(null);
  const drawingRef = useRef(false);
  const rafRef = useRef(0);

  /* ─────────────── Загрузка ─────────────── */

  useEffect(() => {
    let alive = true;
    setError(null);
    setPixels(null);
    setView({ zoom: 1, x: 0, y: 0 });
    loadImage(source)
      .then((img) => {
        if (!alive) return;
        imgRef.current = img;
        setPixels(pixelsOf(img, WORK_MAX_DIM));
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [source]);

  /* ─────────────── Размер холста на экране ─────────────── */

  useLayoutEffect(() => {
    if (!pixels) return undefined;
    const fit = () => {
      const stage = stageRef.current;
      const availW = Math.max(160, (stage ? stage.clientWidth : 480) - 28);
      const availH = Math.max(220, window.innerHeight * 0.62);
      const k = Math.min(availW / pixels.width, availH / pixels.height);
      setBox({ w: Math.round(pixels.width * k), h: Math.round(pixels.height * k) });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [pixels]);

  /* ─────────────── Масштаб и перетаскивание ─────────────── */

  /** Не даём укатить картинку из сцены; на масштабе 1 всегда возвращаем её в центр. */
  const clampView = useCallback((v) => {
    const zoom = Math.min(16, Math.max(1, v.zoom));
    if (zoom === 1) return { zoom: 1, x: 0, y: 0 };
    const limitX = (box.w * zoom - box.w) / 2 + 40;
    const limitY = (box.h * zoom - box.h) / 2 + 40;
    return {
      zoom,
      x: Math.min(limitX, Math.max(-limitX, v.x)),
      y: Math.min(limitY, Math.max(-limitY, v.y)),
    };
  }, [box.w, box.h]);

  // колесо — масштаб к точке под курсором. Слушатель нативный и не пассивный: React вешает
  // wheel пассивно, и preventDefault из onWheel не сработал бы (страница бы прокручивалась).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !pixels) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      setView((v) => {
        const zoom = Math.min(16, Math.max(1, v.zoom * Math.exp(-e.deltaY * 0.0015)));
        const k = zoom / v.zoom;
        return clampView({ zoom, x: v.x - cx * (k - 1), y: v.y - cy * (k - 1) });
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [pixels, clampView]);

  const zoomBy = (factor) => setView((v) => clampView({ ...v, zoom: v.zoom * factor }));

  const startPan = (e) => {
    if (!pixels || (e.button !== 1 && !panMode)) return;
    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const movePan = (e) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.x;
    const dy = e.clientY - panRef.current.y;
    panRef.current = { x: e.clientX, y: e.clientY };
    setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const endPan = () => { panRef.current = null; };

  /* ─────────────── Отрисовка ─────────────── */

  const paintPreview = useCallback((extraOp) => {
    const canvas = canvasRef.current;
    if (!canvas || !pixels || !baseRef.current) return;
    const cur = settingsRef.current;
    const ops = extraOp ? [...cur.ops, extraOp] : cur.ops;
    const opsData = rasterizeOps(ops, pixels.width, pixels.height);
    // во время рисования край не смягчаем — это самая дорогая часть, а на глаз в движении не видно
    const alpha = compose(baseRef.current.base, baseRef.current.maxAlpha, opsData,
      extraOp ? 0 : cur.feather, pixels.width, pixels.height);
    canvas.getContext("2d").putImageData(paint(pixels.data, alpha, pixels.width, pixels.height), 0, 0);
  }, [pixels]);

  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas || !pixels) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // экранный пиксель в пикселях холста: с увеличением обводка и точки не должны толстеть
    const k = box.w ? pixels.width / (box.w * view.zoom) : 1;
    ctx.lineWidth = 1.6 * k;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.setLineDash([6 * k, 5 * k]);

    const draft = draftRef.current;
    const toX = (p) => p[0] * pixels.width;
    const toY = (p) => p[1] * pixels.height;

    if (draft && draft.kind !== "brush") {
      ctx.beginPath();
      const p = draft.points;
      if (draft.kind === "rect") {
        ctx.rect(Math.min(p[0][0], p[1][0]) * pixels.width, Math.min(p[0][1], p[1][1]) * pixels.height,
          Math.abs(p[1][0] - p[0][0]) * pixels.width, Math.abs(p[1][1] - p[0][1]) * pixels.height);
      } else if (draft.kind === "ellipse") {
        ctx.ellipse(((p[0][0] + p[1][0]) / 2) * pixels.width, ((p[0][1] + p[1][1]) / 2) * pixels.height,
          (Math.abs(p[1][0] - p[0][0]) / 2) * pixels.width,
          (Math.abs(p[1][1] - p[0][1]) / 2) * pixels.height, 0, 0, Math.PI * 2);
      } else {
        ctx.moveTo(toX(p[0]), toY(p[0]));
        for (let i = 1; i < p.length; i++) ctx.lineTo(toX(p[i]), toY(p[i]));
      }
      ctx.stroke();
    }

    const pen = penRef.current;
    if (pen && pen.points.length) {
      ctx.beginPath();
      appendPenPath(ctx, { points: pen.points, curves: pen.curves, smooth: penSmooth },
        pixels.width, pixels.height, { close: false });
      ctx.stroke();

      // «резинка» от последней точки к курсору
      if (cursorRef.current && !penDragRef.current) {
        const last = pen.points[pen.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(toX(last), toY(last));
        ctx.lineTo(toX(cursorRef.current), toY(cursorRef.current));
        ctx.stroke();
      }

      ctx.setLineDash([]);
      // середины сегментов: тянешь — линия выгибается (у сглаженного контура их нет)
      if (!penSmooth) {
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        for (let i = 0; i < pen.points.length - 1; i++) {
          const m = segmentHandle(pen, i);
          ctx.beginPath();
          ctx.arc(toX(m), toY(m), 3.2 * k, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // вершины: первая крупнее — по ней контур замыкается
      for (let i = 0; i < pen.points.length; i++) {
        const p = pen.points[i];
        ctx.beginPath();
        ctx.arc(toX(p), toY(p), (i === 0 ? 4.5 : 3.4) * k, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#ff6b5e" : "rgba(255,255,255,0.92)";
        ctx.fill();
      }
    }

    if (BRUSH_TOOLS.includes(tool) && cursorRef.current && !draft) {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(toX(cursorRef.current), toY(cursorRef.current), brush / 2, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.4 * k;
      ctx.stroke();
    }
  }, [pixels, box.w, tool, brush, penSmooth, view.zoom]);

  const schedulePreview = useCallback((op) => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paintPreview(op);
      drawOverlay();
    });
  }, [paintPreview, drawOverlay]);

  // цветовые правила поменялись — пересчитываем базовую альфу (самая дорогая часть).
  // Небольшая задержка склеивает поток событий от ползунка допуска в один пересчёт.
  const colorSig = JSON.stringify([settings.colors, settings.invertColors, settings.invertResult]);
  useEffect(() => {
    if (!pixels) return undefined;
    const timer = setTimeout(() => {
      baseRef.current = computeBase(pixels.data, pixels.width, pixels.height, settingsRef.current);
      paintPreview();
    }, 30);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixels, colorSig]);

  // ручные правки и мягкость края считаются поверх готовой базы — это дёшево
  useEffect(() => {
    paintPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.ops, settings.feather]);

  useEffect(() => { drawOverlay(); }, [drawOverlay]);

  /* ─────────────── История ─────────────── */

  const update = useCallback((next) => {
    const value = typeof next === "function" ? next(settingsRef.current) : next;
    settingsRef.current = value;
    setSettings(value);
  }, []);

  const snapshot = useCallback(() => {
    setHistory((h) => ({ past: [...h.past, settingsRef.current].slice(-HISTORY_LIMIT), future: [] }));
  }, []);

  const commit = useCallback((next) => {
    snapshot();
    update(next);
  }, [snapshot, update]);

  const undo = () => {
    if (!history.past.length) return;
    const prev = history.past[history.past.length - 1];
    setHistory({ past: history.past.slice(0, -1), future: [settingsRef.current, ...history.future] });
    update(prev);
  };

  const redo = () => {
    if (!history.future.length) return;
    const next = history.future[0];
    setHistory({ past: [...history.past, settingsRef.current], future: history.future.slice(1) });
    update(next);
  };

  /* ─────────────── Работа с картинкой ─────────────── */

  const pointOf = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [x, y];
  };

  /* ─────────────── Перо ─────────────── */

  /** Расстояние между нормированными точками в пикселях холста. */
  const distPx = (a, b) => Math.hypot((a[0] - b[0]) * pixels.width, (a[1] - b[1]) * pixels.height);

  /** Порог попадания: на экране всегда ~11 px, поэтому с увеличением он «сужается». */
  const hitRadius = () => (box.w ? (11 * pixels.width) / (box.w * view.zoom) : 11);

  /**
   * Ручка сегмента лежит НА линии (для дуги — в её середине), а не в контрольной точке
   * квадратичной кривой: так линия тянется ровно за то место, за которое взялись.
   */
  const segmentHandle = (pen, i) => {
    const a = pen.points[i];
    const b = pen.points[(i + 1) % pen.points.length];
    const c = pen.curves && pen.curves[i];
    if (!c) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return [(a[0] + 2 * c[0] + b[0]) / 4, (a[1] + 2 * c[1] + b[1]) / 4];
  };

  const hitPen = (pt) => {
    const pen = penRef.current;
    if (!pen) return null;
    const r = hitRadius();
    for (let i = pen.points.length - 1; i >= 0; i--) {
      if (distPx(pen.points[i], pt) <= r) return { type: "point", index: i };
    }
    if (!penSmooth) {
      for (let i = 0; i < pen.points.length - 1; i++) {
        if (distPx(segmentHandle(pen, i), pt) <= r) return { type: "curve", index: i };
      }
    }
    return null;
  };

  const addColor = (rgb) => {
    const known = settingsRef.current.colors.some((c) => hex(c.rgb) === hex(rgb));
    if (known) return;
    commit((cur) => ({ ...cur, colors: [...cur.colors, { rgb, tolerance: 10, borderOnly: true }] }));
  };

  const closePen = () => {
    const pen = penRef.current;
    penRef.current = null;
    penDragRef.current = null;
    setPenActive(false);
    if (pen && pen.points.length >= 3) {
      commit((cur) => ({
        ...cur,
        ops: [...cur.ops, {
          id: ++opSeq, kind: "pen", action: shapeAction, outside: shapeOutside,
          points: pen.points, curves: pen.curves, smooth: penSmooth,
        }],
      }));
    }
    drawOverlay();
  };

  const onPointerDown = (e) => {
    if (!pixels || applying) return;
    // правая кнопка тянет размер кисти: вправо — крупнее, влево — мельче
    if (e.button === 2 && BRUSH_TOOLS.includes(tool) && !panMode) {
      e.preventDefault();
      brushSizeRef.current = { x: e.clientX, start: brush, at: pointOf(e) };
      cursorRef.current = brushSizeRef.current.at;
      e.currentTarget.setPointerCapture(e.pointerId);
      drawOverlay();
      return;
    }
    // средняя кнопка и пробел — это перетаскивание картинки, им занимается сцена
    if (e.button !== 0 || panMode) return;
    const pt = pointOf(e);
    cursorRef.current = pt;

    if (tool === "pick") {
      addColor(pixelColor(pixels, pt[0], pt[1]));
      return;
    }
    if (tool === "pen") {
      const pen = penRef.current;
      if (pen) {
        const hit = hitPen(pt);
        // по первой вершине контур замыкается, но если её потянуть — она просто переедет
        if (hit) {
          penDragRef.current = {
            ...hit, start: pt, moved: false,
            mayClose: hit.type === "point" && hit.index === 0 && pen.points.length >= 3,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
      const next = pen || { points: [], curves: [] };
      next.points = [...next.points, pt];
      penRef.current = next;
      setPenActive(true);
      drawOverlay();
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    draftRef.current = BRUSH_TOOLS.includes(tool)
      ? { kind: "brush", action: tool === "erase" ? "erase" : "keep",
          radius: brush / 2 / pixels.width, points: [pt] }
      : { kind: tool, action: shapeAction, outside: shapeOutside, points: [pt, pt] };
    schedulePreview(draftRef.current);
  };

  const onPointerMove = (e) => {
    if (!pixels) return;
    cursorRef.current = pointOf(e);

    const resize = brushSizeRef.current;
    if (resize) {
      // экранное смещение переводим в пиксели холста, чтобы на любом масштабе тянулось одинаково
      const k = box.w ? pixels.width / (box.w * view.zoom) : 1;
      setBrush(Math.round(Math.min(160, Math.max(4, resize.start + (e.clientX - resize.x) * k))));
      cursorRef.current = resize.at;   // кружок остаётся там, где нажали
      return;
    }

    const penDrag = penDragRef.current;
    if (penDrag) {
      const pen = penRef.current;
      const pt = cursorRef.current;
      if (!penDrag.moved && distPx(penDrag.start, pt) > hitRadius() / 3) penDrag.moved = true;
      if (penDrag.moved && pen) {
        if (penDrag.type === "point") {
          pen.points = pen.points.map((p, i) => (i === penDrag.index ? pt : p));
        } else {
          // ручка стоит на кривой, поэтому контрольную точку считаем обратно
          const a = pen.points[penDrag.index];
          const b = pen.points[(penDrag.index + 1) % pen.points.length];
          const curves = [...(pen.curves || [])];
          curves[penDrag.index] = [2 * pt[0] - (a[0] + b[0]) / 2, 2 * pt[1] - (a[1] + b[1]) / 2];
          pen.curves = curves;
        }
        drawOverlay();
      }
      return;
    }

    const draft = draftRef.current;
    if (drawingRef.current && draft) {
      const pt = cursorRef.current;
      if (draft.kind === "brush" || draft.kind === "lasso") {
        const last = draft.points[draft.points.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) * pixels.width >= 1) draft.points.push(pt);
      } else {
        draft.points[1] = pt;
      }
      schedulePreview(draft);
      return;
    }
    if (BRUSH_TOOLS.includes(tool) || penRef.current) drawOverlay();
  };

  const onPointerUp = () => {
    if (brushSizeRef.current) {
      brushSizeRef.current = null;
      drawOverlay();
      return;
    }
    const penDrag = penDragRef.current;
    if (penDrag) {
      penDragRef.current = null;
      // клик по первой вершине без перетаскивания = замкнуть контур
      if (penDrag.mayClose && !penDrag.moved) closePen();
      else drawOverlay();
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const draft = draftRef.current;
    draftRef.current = null;
    if (!draft) return;

    const tiny = (draft.kind === "rect" || draft.kind === "ellipse")
      ? Math.abs(draft.points[1][0] - draft.points[0][0]) < 0.01
        || Math.abs(draft.points[1][1] - draft.points[0][1]) < 0.01
      : draft.points.length < (draft.kind === "lasso" ? 3 : 1);
    if (tiny) {
      paintPreview();
      drawOverlay();
      return;
    }
    commit((cur) => ({ ...cur, ops: [...cur.ops, { ...draft, id: ++opSeq }] }));
    drawOverlay();
  };

  const onPointerLeave = () => {
    if (drawingRef.current) return;
    cursorRef.current = null;
    drawOverlay();
  };

  /* ─────────────── Горячие клавиши ─────────────── */

  useEffect(() => {
    const onKeyUp = (e) => {
      if (e.code === "Space") setPanMode(false);
    };
    const onKey = (e) => {
      const tag = e.target && e.target.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";

      // Буквы ловим по КОДУ клавиши, а не по e.key: на русской раскладке Ctrl+Z приходит
      // как «я», и сочетание бы не сработало.
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === "Space" && !e.repeat && !typing) {
        e.preventDefault();
        setPanMode(true);
        return;
      }
      if (!typing) {
        const byDigit = {
          Digit1: "pick", Digit2: "erase", Digit3: "restore", Digit4: "rect",
          Digit5: "ellipse", Digit6: "lasso", Digit7: "pen",
        };
        if (byDigit[e.code]) {
          setTool(byDigit[e.code]);
          return;
        }
        if (e.code === "BracketLeft" || e.code === "BracketRight") {
          const step = e.code === "BracketLeft" ? -4 : 4;
          setBrush((b) => Math.min(160, Math.max(4, b + step)));
          return;
        }
        if (e.code === "Digit0" || e.code === "Numpad0") {
          setView({ zoom: 1, x: 0, y: 0 });
          return;
        }
        if (e.code === "Equal" || e.code === "NumpadAdd") {
          zoomBy(1.25);
          return;
        }
        if (e.code === "Minus" || e.code === "NumpadSubtract") {
          zoomBy(0.8);
          return;
        }
      }
      if (e.key === "Backspace" && penRef.current && !typing) {
        e.preventDefault();
        const pen = penRef.current;
        pen.points = pen.points.slice(0, -1);
        pen.curves = (pen.curves || []).slice(0, Math.max(0, pen.points.length - 1));
        if (!pen.points.length) {
          penRef.current = null;
          setPenActive(false);
        }
        drawOverlay();
        return;
      }
      if (e.key === "Escape") {
        if (penRef.current) {
          penRef.current = null;
          penDragRef.current = null;
          setPenActive(false);
          drawOverlay();
        } else if (!applying) onCancel?.();
        return;
      }
      if (e.key === "Enter" && penRef.current) {
        e.preventDefault();
        closePen();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  });

  /* ─────────────── Сохранение ─────────────── */

  const apply = async () => {
    if (!imgRef.current) return;
    setApplying(true);
    setError(null);
    try {
      // даём React перерисовать кнопку: дальше идёт долгий синхронный счёт по полному размеру
      await new Promise((r) => setTimeout(r, 30));
      const full = pixelsOf(imgRef.current, OUTPUT_MAX_DIM);
      const out = render(full, settingsRef.current);
      const file = await toPngFile(out, fileName, MAX_UPLOAD_BYTES);
      await onApply(file);
    } catch (e) {
      setError(e.message || "Не удалось сохранить изображение");
      setApplying(false);
    }
  };

  /* ─────────────── Разметка ─────────────── */

  const colors = settings.colors;
  const opsCount = settings.ops.length;
  const activeTool = TOOLS.find((t) => t.id === tool);

  return (
    <div className="modal-overlay" onClick={() => !applying && onCancel?.()}>
      <div className="modal bge-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bge">
          <div className="bge-stage-wrap">
            <div className="modal-header bge-head">
              <h2 className="modal-title" style={{ fontSize: 17 }}>{title}</h2>
              <div className="bge-preview-switch">
                {view.zoom !== 1 && (
                  <button type="button" className="bge-chip on" title="Сбросить масштаб"
                    onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
                    {Math.round(view.zoom * 100)}% ×
                  </button>
                )}
                {[["checker", "Шахматка"], ["dark", "Тёмный"], ["light", "Светлый"]].map(([id, label]) => (
                  <button key={id} type="button" className={`bge-chip ${preview === id ? "on" : ""}`}
                    onClick={() => setPreview(id)}>{label}</button>
                ))}
              </div>
            </div>

            <div
              className={`bge-stage bge-stage-${preview} ${panMode ? "panning" : ""}`}
              ref={stageRef}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
            >
              {!pixels && !error && <div className="muted">Загрузка изображения…</div>}
              {pixels && (
                <div
                  className="bge-canvas-wrap"
                  ref={wrapRef}
                  style={{
                    width: box.w, height: box.h,
                    transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                    imageRendering: view.zoom >= 4 ? "pixelated" : "auto",
                  }}
                >
                  <canvas ref={canvasRef} className="bge-canvas"
                    width={pixels.width} height={pixels.height} />
                  <canvas
                    ref={overlayRef}
                    className={`bge-overlay bge-cursor-${BRUSH_TOOLS.includes(tool) ? "brush" : "cross"}`}
                    width={pixels.width} height={pixels.height}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onPointerLeave={onPointerLeave}
                    onContextMenu={(e) => e.preventDefault()}
                    onDoubleClick={() => penRef.current && closePen()}
                  />
                </div>
              )}
            </div>

            <div className="bge-stage-hint muted">
              {penActive
                ? "Перо: тяните вершины и середины линий, Enter — замкнуть, Backspace — убрать точку, Esc — сбросить"
                : activeTool?.hint}
              <span className="bge-hint-tail"> · Колесо — масштаб, пробел или средняя кнопка — двигать</span>
            </div>
          </div>

          <div className="bge-panel">
            <div className="bge-section-title">Инструмент</div>
            <div className="bge-tools">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" title={t.hint}
                  className={`bge-tool ${tool === t.id ? "on" : ""}`}
                  onClick={() => setTool(t.id)}>
                  <ToolIcon id={t.id} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {BRUSH_TOOLS.includes(tool) && (
              <div className="bge-section">
                <div className="bge-row-label">
                  <span>Размер кисти</span><span className="muted">{brush} px</span>
                </div>
                <input className="bge-range" type="range" min="4" max="160" step="2"
                  value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
                <div className="muted bge-empty">Правой кнопкой по картинке и вбок — тот же
                  размер, не отрывая руки от рисунка.</div>
              </div>
            )}

            {SHAPE_TOOLS.includes(tool) && (
              <div className="bge-section">
                <div className="bge-row-label"><span>Область</span></div>
                <div className="bge-seg">
                  <button type="button" className={`bge-chip ${shapeAction === "erase" ? "on" : ""}`}
                    onClick={() => setShapeAction("erase")}>Удалить</button>
                  <button type="button" className={`bge-chip ${shapeAction === "keep" ? "on" : ""}`}
                    onClick={() => setShapeAction("keep")}>Оставить</button>
                </div>
                <label className="switch-label bge-check">
                  <input type="checkbox" checked={shapeOutside}
                    onChange={(e) => setShapeOutside(e.target.checked)} />
                  <span>Применить снаружи контура</span>
                </label>
                {tool === "pen" && (
                  <label className="switch-label bge-check">
                    <input type="checkbox" checked={penSmooth}
                      onChange={(e) => setPenSmooth(e.target.checked)} />
                    <span>Скруглять контур<span className="muted"> — все линии станут плавными
                      дугами; иначе изгибайте их по одной, потянув за середину</span></span>
                  </label>
                )}
              </div>
            )}

            <div className="bge-section">
              <div className="bge-section-title">Цвета фона</div>
              {colors.length === 0 && (
                <div className="muted bge-empty">Цветов нет — картинка остаётся как есть,
                  фон убирайте кистью и областями.</div>
              )}
              {colors.map((c, i) => (
                <div className="bge-color" key={i}>
                  <div className="bge-color-head">
                    <span className="bge-swatch" style={{ background: hex(c.rgb) }} />
                    <input className="bge-hex" value={hex(c.rgb)} spellCheck="false"
                      onChange={(e) => {
                        const rgb = rgbFromHex(e.target.value);
                        if (rgb) commit((cur) => ({
                          ...cur,
                          colors: cur.colors.map((x, k) => (k === i ? { ...x, rgb } : x)),
                        }));
                      }} />
                    <button type="button" className={`bge-chip ${c.borderOnly ? "on" : ""}`}
                      title="От краёв: удаляется только фон, связанный с рамкой картинки. Везде: цвет убирается по всей картинке."
                      onClick={() => commit((cur) => ({
                        ...cur,
                        colors: cur.colors.map((x, k) => (k === i ? { ...x, borderOnly: !x.borderOnly } : x)),
                      }))}>
                      {c.borderOnly ? "от краёв" : "везде"}
                    </button>
                    <button type="button" className="bge-x" title="Убрать цвет"
                      onClick={() => commit((cur) => ({
                        ...cur, colors: cur.colors.filter((_, k) => k !== i),
                      }))}>×</button>
                  </div>
                  <div className="bge-color-range">
                    <input className="bge-range" type="range" min="0" max="60" step="1"
                      value={c.tolerance}
                      onPointerDown={snapshot}
                      onChange={(e) => update((cur) => ({
                        ...cur,
                        colors: cur.colors.map((x, k) => (
                          k === i ? { ...x, tolerance: Number(e.target.value) } : x)),
                      }))} />
                    <span className="bge-val muted">{c.tolerance}%</span>
                  </div>
                </div>
              ))}
              <label className="bge-add-color">
                <input type="color" defaultValue="#ffffff"
                  onChange={(e) => {
                    const rgb = rgbFromHex(e.target.value);
                    if (rgb) addColor(rgb);
                  }} />
                <span>Добавить цвет вручную</span>
              </label>
            </div>

            <div className="bge-section">
              <div className="bge-section-title">Инверсия</div>
              <label className="switch-label bge-check">
                <input type="checkbox" checked={settings.invertColors}
                  onChange={(e) => commit((cur) => ({ ...cur, invertColors: e.target.checked }))} />
                <span>Оставить только выбранные цвета<span className="muted"> — убрать всё остальное</span></span>
              </label>
              <label className="switch-label bge-check">
                <input type="checkbox" checked={settings.invertResult}
                  onChange={(e) => commit((cur) => ({ ...cur, invertResult: e.target.checked }))} />
                <span>Поменять местами результат<span className="muted"> — останется то, что удалялось</span></span>
              </label>
            </div>

            <div className="bge-section">
              <div className="bge-row-label">
                <span>Мягкость края</span><span className="muted">{settings.feather}</span>
              </div>
              <input className="bge-range" type="range" min="0" max="3" step="1"
                value={settings.feather}
                onPointerDown={snapshot}
                onChange={(e) => update((cur) => ({ ...cur, feather: Number(e.target.value) }))} />
            </div>

            <div className="bge-section">
              <div className="bge-row-label">
                <span>Ручные правки</span><span className="muted">{opsCount}</span>
              </div>
              <div className="bge-seg">
                <button type="button" className="bge-chip" disabled={!opsCount}
                  onClick={() => commit((cur) => ({ ...cur, ops: cur.ops.slice(0, -1) }))}>
                  Убрать последнюю
                </button>
                <button type="button" className="bge-chip" disabled={!opsCount}
                  onClick={() => commit((cur) => ({ ...cur, ops: [] }))}>Очистить</button>
              </div>
            </div>

            <div className="bge-section">
              <div className="bge-seg">
                <button type="button" className="bge-chip" title="Белый фон от краёв — как делает сервер"
                  onClick={() => commit(defaultSettings())}>Авто (белый фон)</button>
                <button type="button" className="bge-chip" title="Ничего не удалять — рисовать самому"
                  onClick={() => commit(emptySettings())}>С нуля</button>
              </div>
            </div>

            <div className="bge-section bge-keys">
              <div className="bge-section-title">Горячие клавиши</div>
              <div><kbd>Ctrl</kbd>+<kbd>Z</kbd> отменить · <kbd>Ctrl</kbd>+<kbd>Y</kbd> повторить</div>
              <div><kbd>1</kbd>…<kbd>7</kbd> инструменты · <kbd>[</kbd> <kbd>]</kbd> размер кисти</div>
              <div>ПКМ + вбок — размер кисти · колесо — масштаб</div>
              <div><kbd>Пробел</kbd> двигать · <kbd>0</kbd> сбросить масштаб · <kbd>+</kbd> <kbd>−</kbd> масштаб</div>
              <div>Перо: <kbd>Enter</kbd> замкнуть · <kbd>Backspace</kbd> убрать точку · <kbd>Esc</kbd> сбросить</div>
            </div>
          </div>
        </div>

        {error && <div className="error-text bge-error">{error}</div>}

        <div className="bge-foot">
          <button className="btn btn-ghost btn-sm" onClick={undo} disabled={!history.past.length || applying}>
            Отменить
          </button>
          <button className="btn btn-ghost btn-sm" onClick={redo} disabled={!history.future.length || applying}>
            Повторить
          </button>
          <div className="bge-foot-space" />
          <button className="btn btn-secondary btn-sm" onClick={() => onCancel?.()} disabled={applying}>
            Отмена
          </button>
          <button className="btn btn-primary btn-sm" onClick={apply} disabled={!pixels || applying}>
            {applying ? "Сохраняю…" : "Применить"}
          </button>
        </div>
      </div>
    </div>
  );
}
