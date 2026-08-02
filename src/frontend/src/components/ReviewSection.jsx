import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchReviews, fetchRating, submitReview, deleteMyReview, isAuthenticated,
  fetchMe, deleteReviewAsAdmin, warnUser, reactToReview,
} from "../services/api";
import RatingStars from "./RatingStars";
import RatingSlider from "./RatingSlider";
import Avatar from "./Avatar";
import UserCard from "./UserCard";
import BanModal from "./BanModal";
import { ShareModal } from "./ShareControl";
import { ShareIcon, WarnIcon, HammerIcon, TrashIcon } from "./icons";

export default function ReviewSection({ drinkId, showSummary = true, onChanged, highlightReviewId }) {
  const navigate = useNavigate();
  const authed = isAuthenticated();

  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState({ average: 0, count: 0, myRating: 0 });
  const [myRating, setMyRating] = useState(0);
  const [myText, setMyText] = useState("");
  const [hasMine, setHasMine] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // порядок отзывов: по умолчанию новые сверху, как приходят с сервера
  const [reviewSort, setReviewSort] = useState("new");
  const [banTarget, setBanTarget] = useState(null);
  // мини-профиль автора: { userId, anchor, self } — anchor задаёт, где всплыть
  const [cardTarget, setCardTarget] = useState(null);

  /* Повторный клик по тому же автору закрывает карточку (кнопка работает как переключатель). */
  const openCard = (review, anchor) => setCardTarget((prev) =>
    prev && prev.anchor === anchor ? null : { userId: review.userId, anchor, self: review.mine });
  const closeCard = useCallback(() => setCardTarget(null), []);

  useEffect(() => {
    if (authed) fetchMe().then((me) => setIsAdmin(me?.role === "ADMIN")).catch(() => {});
  }, [authed]);

  const load = useCallback(async () => {
    const [list, rate] = await Promise.all([fetchReviews(drinkId), fetchRating(drinkId)]);
    setReviews(list);
    setRating(rate);
    const mine = list.find((r) => r.mine);
    if (mine) {
      setHasMine(true);
      setMyRating(mine.rating);
      setMyText(mine.text || "");
    } else {
      setHasMine(false);
    }
  }, [drinkId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  // сервер отдаёт отзывы «свежие сверху»; остальные порядки считаем на месте
  const sortedReviews = useMemo(() => {
    if (reviewSort === "high") return [...reviews].sort((a, b) => b.rating - a.rating);
    if (reviewSort === "low") return [...reviews].sort((a, b) => a.rating - b.rating);
    return reviews;
  }, [reviews, reviewSort]);

  // прокрутка и подсветка отзыва, на который перешли из чата (?review=id) — однократно
  const scrolledTo = useRef(null);
  useEffect(() => {
    if (!highlightReviewId || reviews.length === 0 || scrolledTo.current === highlightReviewId) return;
    const el = document.getElementById(`review-${highlightReviewId}`);
    if (!el) return;
    scrolledTo.current = highlightReviewId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("review-flash");
    const t = setTimeout(() => el.classList.remove("review-flash"), 2300);
    return () => clearTimeout(t);
  }, [highlightReviewId, reviews]);

  const handleAdminDelete = async (reviewId) => {
    const reason = window.prompt("Причина удаления отзыва (будет показана автору):", "");
    if (reason === null) return;
    try {
      await deleteReviewAsAdmin(reviewId, reason);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleWarnAuthor = async (r) => {
    const msg = window.prompt(`Предупреждение для «${r.userDisplayName}» (придёт уведомлением):`, "");
    if (msg === null) return;
    try {
      await warnUser(r.userId, msg);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSubmit = async () => {
    if (!authed) { navigate("/login"); return; }
    if (myRating < 1) { setError("Поставьте оценку от 1 до 10"); return; }
    setSaving(true);
    setError(null);
    try {
      await submitReview(drinkId, myRating, myText);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReact = async (reviewId, emoji) => {
    if (!authed) { navigate("/login"); return; }
    try {
      const updated = await reactToReview(reviewId, emoji);
      setReviews((list) => list.map((r) => (r.id === reviewId ? updated : r)));
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteMyReview(drinkId);
      setMyRating(0);
      setMyText("");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {showSummary && (
        <div className="rating-summary">
          <div className="rating-big">{rating.average > 0 ? rating.average.toFixed(1) : "—"}</div>
          <div>
            <RatingStars value={Math.round(rating.average)} readonly size={18} />
            <div className="meta">Средняя оценка · {rating.count} отзывов</div>
          </div>
        </div>
      )}

      <div className="section">
        <h3 className="section-title">{hasMine ? "Ваш отзыв" : "Оставить отзыв"}</h3>
        {authed ? (
          <div className="review-form">
            <div className="review-form-row">
              <RatingSlider value={myRating} onRate={setMyRating} />
            </div>
            <div className="input-group">
              <textarea
                className="input"
                placeholder="Поделитесь впечатлением о вкусе, газировке, бодрящем эффекте…"
                value={myText}
                onChange={(e) => setMyText(e.target.value)}
              />
            </div>
            <div className="row">
              <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                {hasMine ? "Сохранить изменения" : "Опубликовать"}
              </button>
              {hasMine && (
                <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                  Удалить
                </button>
              )}
            </div>
            {error && <div className="error-text">{error}</div>}
          </div>
        ) : (
          <div className="badge-info">
            Чтобы оценить и оставить отзыв, <Link to="/login" style={{ color: "var(--accent)" }}>войдите</Link>.
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-head">
          <h3 className="section-title">Отзывы пользователей ({reviews.length})</h3>
          {reviews.length > 1 && (
            <label className="sort-control">
              <span className="sort-label">Сначала</span>
              <select className="sort-select" value={reviewSort} onChange={(e) => setReviewSort(e.target.value)}>
                <option value="new">новые</option>
                <option value="high">высокие оценки</option>
                <option value="low">низкие оценки</option>
              </select>
            </label>
          )}
        </div>
        {reviews.length === 0 ? (
          <div className="state" style={{ padding: 30 }}>Пока никто не оставил отзыв.</div>
        ) : (
          <div className="review-list">
            {sortedReviews.map((r) => (
              <div key={r.id} id={`review-${r.id}`} className={`review ${r.mine ? "mine" : ""}`}>
                <div className="review-head">
                  {/* Автор открывает мини-профиль, а не уводит со страницы: карточку
                      читают, не теряя список отзывов. Переход в профиль — уже из неё. */}
                  <button type="button" className="review-author-btn"
                    onClick={(e) => openCard(r, e.currentTarget)} title="Показать профиль">
                    <Avatar url={r.userAvatarUrl} name={r.userDisplayName} size={32} />
                  </button>
                  <button type="button" className="review-author-btn review-author"
                    onClick={(e) => openCard(r, e.currentTarget)} title="Показать профиль">
                    {r.userDisplayName}
                  </button>
                  <span className="review-rating">★ {r.rating}/10</span>
                  <span className="review-date">{formatDate(r.updatedAt)}</span>
                  <ReviewActions
                    review={r}
                    isAdmin={isAdmin}
                    onWarn={handleWarnAuthor}
                    onBan={(rv) => setBanTarget({ id: rv.userId, displayName: rv.userDisplayName, avatarUrl: rv.userAvatarUrl })}
                    onDelete={handleAdminDelete}
                  />
                </div>
                {r.text && <div className="review-text">{r.text}</div>}
                <ReviewReactions review={r} authed={authed} onReact={handleReact} />
              </div>
            ))}
          </div>
        )}
      </div>

      {cardTarget && <UserCard {...cardTarget} onClose={closeCard} />}

      {banTarget && (
        <BanModal user={banTarget} onClose={() => setBanTarget(null)}
          onDone={() => { setBanTarget(null); load(); }} />
      )}
    </>
  );
}

/**
 * Меню «⋮» справа сверху отзыва: все действия в одном месте — для любого авторизованного
 * «Поделиться» (отзывом), для админа — модерация (предупредить/забанить/удалить).
 */
function ReviewActions({ review, isAdmin, onWarn, onBan, onDelete }) {
  const [open, setOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState(null); // { drinkId } | { reviewId } — что шарим
  const ref = useRef(null);
  const authed = isAuthenticated();
  const adminActions = isAdmin && !review.mine;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    // capture-фаза: не блокируется stopPropagation у .drink-page (фаза всплытия)
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open]);

  if (!authed && !adminActions) return null; // гостям без прав — меню не нужно

  return (
    <div className="share-control review-actions" ref={ref}>
      <button type="button" className="share-dots" title="Действия"
        onClick={() => setOpen((v) => !v)} aria-label="Действия">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {open && (
        <div className="share-menu">
          {authed && (
            <button type="button" className="share-menu-item"
              onClick={() => { setOpen(false); setShareTarget({ reviewId: review.id }); }}>
              <ShareIcon size={15} /> Поделиться
            </button>
          )}
          {adminActions && (
            <>
              <button type="button" className="share-menu-item"
                onClick={() => { setOpen(false); onWarn(review); }}>
                <WarnIcon size={15} /> Предупредить
              </button>
              <button type="button" className="share-menu-item"
                onClick={() => { setOpen(false); onBan(review); }}>
                <HammerIcon size={15} /> Забанить
              </button>
              <button type="button" className="share-menu-item danger"
                onClick={() => { setOpen(false); onDelete(review.id); }}>
                <TrashIcon size={15} /> Удалить отзыв
              </button>
            </>
          )}
        </div>
      )}

      {shareTarget && <ShareModal {...shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
}

/** Набор эмодзи-реакций (синхронизирован с бэкендом ReviewService.ALLOWED_REACTIONS). */
const REACTION_EMOJIS = ["👍", "👎", "❤️", "🔥", "😂", "😮", "😢"];

/**
 * Реакции под отзывом: чипы с количеством (видны всем) и кнопка «＋» с палитрой эмодзи
 * для авторизованных. Повторный клик по своей реакции снимает её.
 */
function ReviewReactions({ review, authed, onReact }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef(null);
  const reactions = review.reactions || [];
  const mine = review.myReaction || null;

  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setPickerOpen(false); };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [pickerOpen]);

  if (reactions.length === 0 && !authed) return null;

  return (
    <div className="review-reactions">
      {reactions.map((rc) => (
        <button
          key={rc.emoji}
          type="button"
          className={"reaction-chip" + (mine === rc.emoji ? " mine" : "")}
          disabled={!authed}
          onClick={() => onReact(review.id, rc.emoji)}
          title={mine === rc.emoji ? "Убрать реакцию" : "Поддержать реакцию"}
        >
          <span className="reaction-emoji">{rc.emoji}</span>
          <span className="reaction-count">{rc.count}</span>
        </button>
      ))}

      {authed && (
        <div className="reaction-add" ref={ref}>
          <button
            type="button"
            className="reaction-add-btn"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            title="Добавить реакцию"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8.5 14a4 4 0 0 0 7 0" /><path d="M9 9h.01" /><path d="M15 9h.01" />
            </svg>
          </button>
          {pickerOpen && (
            <div className="reaction-picker" role="menu">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={"reaction-pick" + (mine === e ? " mine" : "")}
                  onClick={() => { onReact(review.id, e); setPickerOpen(false); }}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}
