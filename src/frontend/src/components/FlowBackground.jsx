import { useEffect, useRef } from "react";
import { isLightBg } from "../theme/palette";

/**
 * Анимированный фон «Контуры»: светящаяся топографическая карта, которая медленно
 * перетекает. Рисуется не картинкой, а фрагментным шейдером — поэтому берёт цвета прямо
 * из палитры сайта (--accent для свечения, --bg для подложки) и не весит ни килобайта
 * трафика. На светлой теме те же изолинии рисуются «чернилами» акцента, а не свечением.
 *
 * Если WebGL недоступен (старый браузер, отключённое ускорение, потеря контекста) —
 * зовём onFail, и SiteBackground молча возвращает обычную сетку.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * Поле высот: fbm с доменным искажением (два fbm сдвигают координаты третьего) — именно
 * оно даёт органические «завихрения» вместо ровных холмов. Изолинии берутся как fract()
 * этого поля, а ширина линии считается из fwidth: линия всегда ~одинаковой толщины на
 * экране, независимо от того, насколько круто поле меняется в этом месте.
 */
const FRAG = `#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;    // размер буфера в пикселях
uniform float uTime;   // секунды
uniform float uPx;     // пикселей буфера на «опорный» пиксель (учёт Retina)
uniform vec3  uGlow;   // --accent
uniform vec3  uBase;   // --bg
uniform float uDark;   // 1 — тёмная тема, 0 — светлая

vec3 permute3(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute3(permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

/* Три октавы — больше не нужно: мелкая рябь превращает плавные изолинии в кашу. */
float fbm(vec2 p) {
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * snoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return s / 1.75;
}

float height(vec2 p, float t) {
  float qx = fbm(p + vec2(0.0, 0.045 * t));
  float qy = fbm(p + vec2(5.2 + 0.030 * t, 1.3));
  return fbm(p + vec2(qx, qy) - vec2(0.0, 0.012 * t));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 sp = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  // Наклонённая плоскость: чем выше по экрану, тем «дальше» и мельче рельеф.
  // Горизонт вынесен за пределы экрана (1.15), чтобы не ловить деление на ноль.
  float d = 1.0 / max(1.15 - sp.y, 0.2);
  vec2 P = vec2(sp.x * d * 0.5, -d * 0.5 + t * 0.010);

  float hh = height(P, t) * 30.0;
  float gw = fwidth(hh);
  float f  = fract(hh);
  float dist = min(f, 1.0 - f) / max(gw, 1e-4);

  // Глубина резкости: полоса в середине экрана в фокусе, низ и «даль» размыты.
  float blur = clamp(abs(d - 1.0) * 2.2, 0.0, 1.0);
  float lw   = mix(0.85, 5.0, blur) * uPx;
  float fall = mix(0.32, 0.075, blur) / uPx;
  float fog  = exp(-max(d - 1.0, 0.0) * 1.2);

  // Не все жилы раскалены одинаково: медленное поле задаёт, где линии яркие и толстые,
  // а где почти гаснут — без него экран превращается в равномерную сетку.
  float heat = smoothstep(-0.35, 0.45, snoise(P * 2.2 + vec2(11.0, -4.0 + t * 0.02)));

  float core = 1.0 - smoothstep(0.0, lw * (0.55 + 0.45 * heat), dist);
  float halo = exp(-dist * fall) + 0.15 * exp(-dist * fall * 0.16);
  // У горизонта изолинии сходятся плотнее пикселя — гасим, иначе мерцающая рябь.
  float dense = 1.0 - smoothstep(0.22, 0.70, gw * uPx);

  float ink = (core + halo * 0.28) * (0.06 + 0.94 * heat) * dense * fog;
  // Середина экрана приглушена — там лежат карточки и текст.
  ink *= mix(0.55, 1.0, smoothstep(0.08, 0.55, abs(uv.x - 0.5)));
  ink *= 0.6;
  float hot = pow(core * dense, 2.5) * 0.55 * heat * heat * heat * 0.6 * fog;

  // Смешиваем в линейном пространстве, иначе свечение выглядит грязным.
  vec3 base = pow(uBase, vec3(2.2));
  vec3 glow = pow(uGlow, vec3(2.2));
  vec3 dark  = base + glow * ink * 1.15 + vec3(hot);
  vec3 light = mix(base, glow * 0.42, clamp(ink * 3.45, 0.0, 1.0) * 0.85);
  vec3 col = pow(max(mix(light, dark, uDark), 0.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Буфер рендерится в 0.75 CSS-пикселя: линии по замыслу мягкие, разница не видна. */
const BUFFER_SCALE = 0.75;
/** Выше 1.75 плотность пикселей не окупается — только греет видеокарту. */
const MAX_DPR = 1.75;
/** Потолок площади буфера (4K-мониторы): дальше растём только вниз по чёткости. */
const MAX_PIXELS = 2400000;
/** Фон меняется медленно — 30 кадров/с хватает, а батарею экономит вдвое. */
const FRAME_MS = 1000 / 30;
/** Кадр для статичного режима (анимация выключена): «красивый» срез поля. */
const STATIC_TIME = 8;

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** hex → [r, g, b] в 0..1; при мусоре возвращает запасной цвет. */
function toRgb(value, fallback) {
  const m = HEX_RE.exec((value || "").trim());
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 1, 2].map((i) => parseInt(h.slice(i * 2, i * 2 + 2), 16) / 255);
}

const toHex = (rgb) =>
  "#" + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(log || "shader compile failed");
  }
  return sh;
}

export default function FlowBackground({ onFail }) {
  const canvasRef = useRef(null);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let gl = null;
    let program = null;
    let buffer = null;
    let raf = 0;
    let dead = false;

    const fail = () => {
      if (dead) return;
      dead = true;
      if (failRef.current) failRef.current();
    };

    try {
      gl = canvas.getContext("webgl", {
        alpha: false, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: false, powerPreference: "low-power",
      });
    } catch {
      gl = null;
    }
    // fwidth в WebGL 1 живёт в расширении; без него шейдер даже не скомпилируется.
    if (!gl || !gl.getExtension("OES_standard_derivatives")) {
      fail();
      return undefined;
    }

    let vs = null;
    let fs = null;
    try {
      vs = compile(gl, gl.VERTEX_SHADER, VERT);
      fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "link failed");
      }
    } catch {
      fail();
      return undefined;
    } finally {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }

    gl.useProgram(program);
    // Один треугольник с запасом перекрывает экран — дешевле квада из двух.
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = ["uRes", "uTime", "uPx", "uGlow", "uBase", "uDark"].reduce((acc, name) => {
      acc[name] = gl.getUniformLocation(program, name);
      return acc;
    }, {});

    let bufW = 0;
    let bufH = 0;
    let time = STATIC_TIME;
    let lastFrame = 0;
    let speed = 1;

    /** Забирает цвета и скорость из CSS-переменных — так фон следует за темой сайта. */
    const syncTheme = () => {
      const cs = getComputedStyle(root);
      const glow = toRgb(cs.getPropertyValue("--accent"), [1, 0.231, 0.188]);
      const base = toRgb(cs.getPropertyValue("--bg"), [0.047, 0.047, 0.063]);
      const sp = parseFloat(cs.getPropertyValue("--bg-speed"));
      speed = sp > 0 ? Math.min(sp, 4) : 1;
      gl.uniform3f(u.uGlow, glow[0], glow[1], glow[2]);
      gl.uniform3f(u.uBase, base[0], base[1], base[2]);
      gl.uniform1f(u.uDark, isLightBg(toHex(base)) ? 0 : 1);
    };

    /** Подгоняет буфер под окно. true — размер изменился. */
    const resize = () => {
      const q = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cw = canvas.clientWidth || window.innerWidth;
      const ch = canvas.clientHeight || window.innerHeight;
      let w = Math.max(2, Math.round(cw * q * BUFFER_SCALE));
      let h = Math.max(2, Math.round(ch * q * BUFFER_SCALE));
      let extra = 1;
      if (w * h > MAX_PIXELS) {
        extra = Math.sqrt(MAX_PIXELS / (w * h));
        w = Math.max(2, Math.round(w * extra));
        h = Math.max(2, Math.round(h * extra));
      }
      if (w === bufW && h === bufH) return false;
      bufW = w;
      bufH = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uPx, q * extra);
      return true;
    };

    const draw = () => {
      gl.uniform1f(u.uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const animating = () =>
      root.getAttribute("data-bg-anim") !== "off" && !reduce.matches && !document.hidden;

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = lastFrame ? now - lastFrame : FRAME_MS;
      if (dt < FRAME_MS) return;
      lastFrame = now;
      // Пауза (вкладка в фоне, долгий кадр) не должна давать рывок поля.
      time += (Math.min(dt, 100) / 1000) * speed;
      draw();
    };

    /** Включает/выключает цикл под текущие настройки и перерисовывает статичный кадр. */
    const sync = () => {
      resize();
      if (animating()) {
        if (!raf) {
          lastFrame = 0;
          raf = requestAnimationFrame(loop);
        }
      } else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        draw();
      }
    };

    const onContextLost = (e) => {
      e.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      fail();
    };

    canvas.addEventListener("webglcontextlost", onContextLost);
    resize();
    syncTheme();

    // Тема меняется через инлайновые CSS-переменные на <html> (см. theme/palette.js), а
    // предпросмотр чужой темы вообще не трогает состояние React — поэтому следим за атрибутами.
    const observer = new MutationObserver(() => {
      syncTheme();
      sync();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["style", "data-bg-anim"] });

    const onResize = () => sync();
    const onVisibility = () => sync();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    if (reduce.addEventListener) reduce.addEventListener("change", sync);
    else reduce.addListener(sync);

    sync();

    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (reduce.removeEventListener) reduce.removeEventListener("change", sync);
      else reduce.removeListener(sync);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    };
  }, []);

  return <canvas className="bg-flow" ref={canvasRef} aria-hidden="true" />;
}
