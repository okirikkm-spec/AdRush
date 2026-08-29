import { useEffect, useRef } from "react";

/**
 * Выбор одной из двух банок свайпом (сенсорные устройства). Возвращает ref, который
 * вешается на арену — общий контейнер обеих карточек.
 *
 * Свайп влево выбирает первую банку, вправо — вторую. Вертикальные движения отдаются
 * прокрутке страницы: пока не понятно, куда ведут палец, жест не перехватывается, а как
 * только по вертикали ушли дальше, чем по горизонтали, — бросается совсем.
 *
 * Сама арена состоит из кнопок, поэтому главная забота — не выбрать банку случайно:
 *   • порог срабатывания большой (threshold), короткий сдвиг ничего не выбирает;
 *   • после любого заметного движения пальца следующий click глушится на фазе перехвата,
 *     иначе браузер после свайпа дошлёт клик по той карточке, где палец оторвался.
 * Обычный тап (палец почти не двигался) при этом работает как раньше.
 *
 * Слушатели нативные, а не React-onTouch*: touchmove нужен НЕ passive, чтобы
 * preventDefault блокировал прокрутку и overscroll-навигацию во время жеста.
 * На десктопе (pointer: fine) хук ничего не вешает.
 *
 * @param {() => void} onFirst   выбрана первая банка (свайп влево)
 * @param {() => void} onSecond  выбрана вторая банка (свайп вправо)
 * @param {{threshold?: number}} opts  порог срабатывания в px (по умолчанию 70)
 */
export function useSwipeChoice(onFirst, onSecond, { threshold = 70 } = {}) {
  const ref = useRef(null);
  const cb = useRef({ onFirst, onSecond });
  cb.current = { onFirst, onSecond };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia || !window.matchMedia("(pointer: coarse)").matches) return;

    let active = false;   // палец на арене, жест ещё может стать выбором
    let decided = false;  // подтверждён горизонтальный свайп
    let moved = false;    // палец уехал дальше «дрожания» — клик после него не нужен
    let startX = 0, startY = 0, dx = 0;

    /** Глушим click, который браузер дошлёт после свайпа (иначе сработает и тап по карточке). */
    const swallowClick = (e) => { e.stopPropagation(); e.preventDefault(); };
    const suppressClick = () => {
      el.addEventListener("click", swallowClick, { capture: true, once: true });
      // клика может и не быть (палец оторвали вне кнопки) — снимаем страховку сами
      setTimeout(() => el.removeEventListener("click", swallowClick, { capture: true }), 400);
    };

    const mark = () => {
      el.classList.toggle("will-first", dx <= -threshold);
      el.classList.toggle("will-second", dx >= threshold);
    };

    const reset = () => {
      el.style.transform = "";
      el.classList.remove("will-first", "will-second");
    };

    const onStart = (e) => {
      if (e.touches.length !== 1) return;
      active = true; decided = false; moved = false; dx = 0;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const onMove = (e) => {
      if (!active) return;
      dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) moved = true;

      if (!decided) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;   // направление ещё не ясно
        if (Math.abs(dy) >= Math.abs(dx)) { active = false; return; } // это прокрутка
        decided = true;
        el.classList.add("swiping");   // на время жеста арена ходит без анимации
      }

      if (e.cancelable) e.preventDefault();
      el.style.transform = `translateX(${dx * 0.5}px)`;   // затухание: палец «тянет» арену
      mark();
    };

    const onEnd = () => {
      const hit = active && decided && Math.abs(dx) >= threshold;
      const pick = hit ? (dx < 0 ? cb.current.onFirst : cb.current.onSecond) : null;
      active = false;
      if (moved) suppressClick();

      if (hit) {
        // выбор сделан: пара сейчас сменится, арену возвращаем на место без анимации
        reset();
        requestAnimationFrame(() => el.classList.remove("swiping"));
      } else {
        el.classList.remove("swiping");   // не дотянули — пружинит обратно
        reset();
      }
      pick?.();
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
      el.removeEventListener("click", swallowClick, { capture: true });
    };
  }, [threshold]);

  return ref;
}
