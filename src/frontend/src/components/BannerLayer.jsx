import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Слой обложки. Используется и в карточке профиля, и в предпросмотре, и в
 * редакторе кадра — одна математика, поэтому «как показали» = «как получится».
 *
 * Размер картинки считается явно: масштаб «покрытия» = max(шир.плашки/шир.картинки,
 * выс.плашки/выс.картинки). Через CSS это не выразить: min-width/min-height задают
 * лишь нижнюю границу, и крупное фото рисуется в натуральную величину — кадр тогда
 * зависит от размера плашки, из-за чего предпросмотр расходился с карточкой.
 *
 * Обёртка занимает ровно плашку, поэтому её translate считается в процентах от
 * плашки. Картинка отцентрована: при overflow:hidden это обрезка, при visible —
 * видно изображение целиком (нужно редактору).
 */
export default function BannerLayer({ url, scale = 1, rotate = 0, offsetX = 0, offsetY = 0 }) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState(null);        // размер плашки
  const [natural, setNatural] = useState(null); // размер исходника

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    /* Размер берём только из ResizeObserver: он отдаёт дробный layout-размер и
       не зависит от transform родителей. getBoundingClientRect врал во время
       анимации открытия окна (−4%), а offsetWidth/Height округляет до целых —
       на низкой плашке это давало расхождение кадра в пару процентов.
       Первый вызов приходит сразу при observe(), отдельный замер не нужен. */
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [url]);

  const onLoad = useCallback((e) => {
    const img = e.currentTarget;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  if (!url) return null;

  let size = null;
  if (natural?.w && natural?.h && box?.w && box?.h) {
    const cover = Math.max(box.w / natural.w, box.h / natural.h);
    size = { width: natural.w * cover, height: natural.h * cover };
  }

  return (
    <div className="banner-layer" ref={wrapRef} style={{ transform: `translate(${offsetX}%, ${offsetY}%)` }}>
      <img
        className="banner-img"
        src={url}
        alt=""
        draggable={false}
        onLoad={onLoad}
        style={{
          ...(size ? { width: size.width, height: size.height } : {}),
          // до замера не показываем: иначе мелькнёт картинка в натуральную величину
          visibility: size ? "visible" : "hidden",
          transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
        }}
      />
    </div>
  );
}

/** Значения кадрирования из профиля с подстановкой значений по умолчанию. */
export function framingOf(user) {
  return {
    scale: user?.bannerScale ?? 1,
    rotate: user?.bannerRotate ?? 0,
    offsetX: user?.bannerOffsetX ?? 0,
    offsetY: user?.bannerOffsetY ?? 0,
  };
}
