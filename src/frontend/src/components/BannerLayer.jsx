import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * Пропорция карточки мини-профиля (ширина/высота) — эталон, под который человек
 * настраивал кадр. Реальная карточка меряется на месте (ProfilePage), это её
 * типичное значение: ~878 × 128. Нужен там, где обложку показывают в плашке
 * других пропорций (см. refAspect).
 */
export const HERO_ASPECT = 7;

/**
 * Слой обложки. Используется и в карточке профиля, и в предпросмотре, и в
 * редакторе кадра — одна математика, поэтому «как показали» = «как получится».
 *
 * Размер картинки считается явно: масштаб «покрытия» = max(шир.плашки/шир.картинки,
 * выс.плашки/выс.картинки). Через CSS это не выразить: min-width/min-height задают
 * лишь нижнюю границу, и крупное фото рисуется в натуральную величину — кадр тогда
 * зависит от размера плашки, из-за чего предпросмотр расходился с карточкой.
 *
 * Плашка — отдельный слой внутри контейнера, её translate считается в процентах
 * от неё самой. Картинка отцентрована: при overflow:hidden это обрезка, при
 * visible — видно изображение целиком (нужно редактору).
 *
 * refAspect — пропорция «эталонной» плашки для мест, где обложка лежит в полосе
 * других пропорций (шапка чата площе карточки профиля, мини-профиль автора —
 * наоборот выше). Эталонная плашка масштабируется «по покрытию»: берётся
 * наибольшая из сторон, при которой она накрывает контейнер, и центрируется —
 * контейнер показывает её середину. Так виден тот же кусок картинки, что и в
 * профиле: без этого низкий контейнер показывал бы полосу вдвое шире эталонной
 * (лишний фон сверху и снизу), а те же offsetY (они в процентах от высоты
 * плашки) уводили бы кадр вверх или вниз относительно профиля.
 */
export default function BannerLayer({ url, scale = 1, rotate = 0, offsetX = 0, offsetY = 0, refAspect = 0 }) {
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

  /* Плашка, по которой считается кадр: сам контейнер либо эталонная плашка,
     растянутая до покрытия контейнера (её размер задаём слою .banner-plate,
     поэтому проценты translate остаются «от плашки»). */
  let plate = box;
  if (refAspect > 0 && box?.w) {
    const w = Math.max(box.w, box.h * refAspect);
    plate = { w, h: w / refAspect };
  }

  let size = null;
  if (natural?.w && natural?.h && plate?.w && plate?.h) {
    const cover = Math.max(plate.w / natural.w, plate.h / natural.h);
    size = { width: natural.w * cover, height: natural.h * cover };
  }

  return (
    /* Контейнер только меряется (ResizeObserver): размер плашки задаётся слою
       внутри, иначе замер зависел бы от собственного результата. */
    <div className="banner-layer" ref={wrapRef}>
      <div
        className="banner-plate"
        style={{
          ...(plate ? { width: plate.w, height: plate.h } : {}),
          transform: `translate(calc(-50% + ${offsetX}%), calc(-50% + ${offsetY}%))`,
        }}
      >
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
