import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";
import BannerLayer, { framingOf, HERO_ASPECT } from "./BannerLayer";
import { useChat } from "../ChatContext";
import { fetchUserCard, isAuthenticated, mediaUrl } from "../services/api";
import { LockIcon, MailIcon, TrophyIcon, UserIcon } from "./icons";

const GAP = 8;        // отступ от строки, по которой кликнули
// Минимальный зазор до краёв экрана. Ширину карточки задаёт CSS (.user-card-pos),
// здесь тот же зазор используется для вертикали — держать значения согласованными.
const EDGE = 12;

/**
 * Всплывающий мини-профиль автора отзыва: обложка с тем же кадром, что на странице
 * профиля, дата регистрации и сводка активности. Открывается по клику на аватарку
 * или имя в шапке отзыва (ReviewSection).
 *
 * Рисуется порталом в body: у .drink-page и модалок свои контексты наложения и
 * overflow, внутри них карточка обрезалась бы краем окна.
 *
 * @param anchor элемент, у которого показывать карточку (кнопка автора)
 * @param self   отзыв самого зрителя — тогда «Написать» не нужно
 */
export default function UserCard({ userId, anchor, self = false, onClose }) {
  const navigate = useNavigate();
  const chat = useChat();
  const boxRef = useRef(null);
  const frameRef = useRef(0);
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setCard(null);
    setError(null);
    fetchUserCard(userId)
      .then((d) => { if (alive) setCard(d); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [userId]);

  /**
   * Позиция: под строкой отзыва, а если снизу не помещается — над ней.
   * Пишем прямо в style.transform, а не через состояние: при прокрутке это
   * событие на каждый кадр, и перерисовка компонента (плюс пересчёт left/top)
   * заметно отставала от содержимого — карточка ехала рывками.
   */
  const place = useCallback(() => {
    const el = boxRef.current;
    const a = anchor?.getBoundingClientRect();
    if (!el || !a) return;
    const vh = window.innerHeight;
    // строку отзыва увели прокруткой за экран — карточке не к чему прижиматься
    if (a.bottom < 0 || a.top > vh) { onClose(); return; }

    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const width = el.offsetWidth;
    const left = Math.min(Math.max(EDGE, a.left), vw - width - EDGE);
    const below = a.bottom + GAP;
    const above = a.top - GAP - h;
    // выбранную сторону всё равно вгоняем в экран: у нижних отзывов места нет ни там, ни там
    const preferred = below + h > vh - EDGE ? above : below;
    const top = Math.max(EDGE, Math.min(preferred, vh - h - EDGE));
    // округляем до целых пикселей: дробные координаты дают дрожание текста
    el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    el.style.visibility = "visible";
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    place();
    /* Скролл сыплется чаще кадра — сводим к одному пересчёту на кадр.
       capture: ловим прокрутку внутренних контейнеров (тело модалки), а не только окна. */
    const onScroll = () => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => { frameRef.current = 0; place(); });
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
    };
  }, [place, card, error]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };
    // Esc гасим в фазе перехвата: иначе тем же нажатием закроется и окно карточки энергетика
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose]);

  const go = (to) => { onClose(); navigate(to); };

  const write = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const conv = await chat.openDirect(card.id);
      go(`/chats/${conv.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const stats = card?.stats;

  return createPortal(
    /* Внешний слой только позиционирует (его transform двигает карточку), сама
       карточка — внутри: её анимация появления тоже идёт через transform и
       затирала бы позицию. */
    <div
      className="user-card-pos"
      ref={boxRef}
      // клик по карточке не должен закрывать окно карточки энергетика под ней
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="user-card" role="dialog" aria-label="Профиль пользователя">
      {!card && !error && <div className="user-card-state">Загрузка…</div>}
      {error && <div className="user-card-state error-text">{error}</div>}

      {card && (
        <>
          <div className={"user-card-hero" + (card.bannerUrl ? " has-banner" : "")}>
            {/* refAspect: карточка площе плашки профиля — кадр считаем по её пропорции */}
            <BannerLayer url={mediaUrl(card.bannerUrl)} {...framingOf(card)} refAspect={HERO_ASPECT} />
            <div className="user-card-head">
              <Avatar url={card.avatarUrl} name={card.displayName} size={52} />
              <div className="user-card-id">
                <SelectableName onOpen={() => go(`/user/${card.id}`)}>{card.displayName}</SelectableName>
                <div className="user-card-login">@{card.username}</div>
                {card.role === "ADMIN" && <span className="profile-role user-card-role">Администратор</span>}
              </div>
            </div>
          </div>

          <div className="user-card-body">
            <div className="user-card-line">
              <UserIcon size={14} /> На сайте с {formatDate(card.createdAt)}
            </div>

            {stats ? (
              <>
                <div className="user-card-stats">
                  <Stat value={stats.reviewCount} label={plural(stats.reviewCount, "отзыв", "отзыва", "отзывов")} />
                  <Stat value={stats.averageRating != null ? stats.averageRating.toFixed(1) : "—"} label="средняя оценка" />
                  <Stat value={stats.reactionsReceived} label={plural(stats.reactionsReceived, "реакция", "реакции", "реакций")} />
                </div>

                {stats.topDrinkId && (
                  <div className="user-card-top">
                    <TrophyIcon size={14} />
                    <div className="user-card-top-body">
                      <div className="user-card-top-label">Выше всего оценил</div>
                      <div className="user-card-top-drink">
                        {/* название переносится: у энергетиков они длинные, обрезать нечестно */}
                        <button type="button" className="user-card-link" onClick={() => go(`/drink/${stats.topDrinkId}`)}>
                          {stats.topDrinkName}
                        </button>
                        <span className="user-card-rating">★ {stats.topDrinkRating}/10</span>
                      </div>
                    </div>
                  </div>
                )}

                {stats.lastReviewAt && (
                  <div className="user-card-line muted">Последний отзыв · {formatDate(stats.lastReviewAt)}</div>
                )}
              </>
            ) : (
              <div className="user-card-line muted"><LockIcon size={14} /> Профиль закрыт — статистика скрыта</div>
            )}
          </div>

          <div className="user-card-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => go(`/user/${card.id}`)}>
              Открыть профиль
            </button>
            {isAuthenticated() && !self && (
              <button type="button" className="btn btn-primary btn-sm" onClick={write} disabled={busy}>
                <MailIcon size={14} /> Написать
              </button>
            )}
          </div>
        </>
      )}
      </div>
    </div>,
    document.body,
  );
}

function Stat({ value, label }) {
  return (
    <div className="user-card-stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

/**
 * Ник ведёт на профиль, но остаётся выделяемым: переход — только если это был
 * именно клик. Протяжку выделения (курсор сдвинулся) и двойной клик по слову
 * (после него в документе есть выделение) пропускаем.
 */
function SelectableName({ onOpen, children }) {
  const down = useRef(null);

  const onClick = (e) => {
    const start = down.current;
    const dragged = start && (Math.abs(e.clientX - start.x) > 3 || Math.abs(e.clientY - start.y) > 3);
    const selected = !!window.getSelection?.().toString();
    if (dragged || selected) return;
    onOpen();
  };

  return (
    <span
      className="user-card-name"
      role="link"
      tabIndex={0}
      title="Перейти в профиль"
      onMouseDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      {children}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

/** Склонение существительного при числе: 1 отзыв, 2 отзыва, 5 отзывов. */
function plural(n, one, few, many) {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
