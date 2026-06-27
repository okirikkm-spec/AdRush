import { useEffect, useRef } from "react";

/**
 * Закрытие по свайпу справа налево на сенсорных устройствах.
 *
 * Возвращает ref, который вешается на закрываемый элемент (саму карточку/модалку).
 * Жест считается закрывающим, только если он преимущественно горизонтальный и направлен
 * влево: вертикальные движения отдаются прокрутке тела, свайп вправо игнорируется. Палец
 * тянет карточку за собой (translateX + затухание); если протянули дальше порога — карточка
 * уезжает влево и вызывается onClose, иначе пружинит обратно.
 *
 * Слушатели нативные (а не React-onTouch*), чтобы touchmove был НЕ passive и можно было
 * вызвать preventDefault, блокируя горизонтальную прокрутку/overscroll во время жеста.
 * Активен только при pointer: coarse — на десктопе хук ничего не вешает.
 *
 * @param {() => void} onClose   закрытие карточки
 * @param {{threshold?: number}} opts  порог срабатывания в px (по умолчанию 80)
 */
export function useSwipeToClose(onClose, { threshold = 80 } = {}) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;

    let active = false;   // палец на карточке, жест ещё может стать закрывающим
    let decided = false;  // подтверждено, что это горизонтальный свайп влево
    let startX = 0;
    let startY = 0;
    let dx = 0;

    // не перехватываем жесты на интерактивных/прокручиваемых зонах ВНУТРИ карточки
    // (поля ввода, кнопки, ссылки, лента миниатюр, вложенные модалки). Идём от target
    // вверх только до самой карточки (el), поэтому внешний оверлей-предок не учитывается.
    const isInteractive = (target) => {
      for (let n = target; n && n !== el; n = n.parentElement) {
        const tag = n.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") return true;
        if (n.classList && (n.classList.contains("modal-overlay") || n.classList.contains("gallery-thumbs") || n.classList.contains("drink-hero"))) return true;
      }
      return false;
    };

    const settle = (animate) => {
      el.style.transition = animate ? "transform 0.22s ease, opacity 0.22s ease" : "";
      el.style.transform = "";
      el.style.opacity = "";
      active = false;
      decided = false;
      dx = 0;
    };

    const onStart = (e) => {
      if (e.touches.length !== 1 || isInteractive(e.target)) return;
      active = true;
      decided = false;
      dx = 0;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      el.style.transition = "";
    };

    const onMove = (e) => {
      if (!active) return;
      const ddx = e.touches[0].clientX - startX;
      const ddy = e.touches[0].clientY - startY;
      if (!decided) {
        if (Math.abs(ddx) < 10 && Math.abs(ddy) < 10) return; // направление ещё не ясно
        if (Math.abs(ddy) >= Math.abs(ddx) || ddx > 0) { active = false; return; } // вертикаль/вправо — не наш жест
        decided = true;
      }
      dx = Math.min(0, ddx);
      el.style.transform = `translateX(${dx}px)`;
      el.style.opacity = String(Math.max(0.35, 1 + dx / (el.offsetWidth || 400)));
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (!active || !decided) { settle(false); return; }
      active = false;
      if (dx <= -threshold) {
        el.style.transition = "transform 0.2s ease, opacity 0.2s ease";
        el.style.transform = "translateX(-110%)";
        el.style.opacity = "0";
        // даём уехать кадру, затем закрываем (родитель размонтирует карточку)
        setTimeout(() => onCloseRef.current && onCloseRef.current(), 200);
      } else {
        settle(true);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [threshold]);

  return ref;
}
