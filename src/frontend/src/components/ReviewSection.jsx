import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchReviews, fetchRating, submitReview, deleteMyReview, isAuthenticated,
  fetchMe, deleteReviewAsAdmin, warnUser,
} from "../services/api";
import RatingStars from "./RatingStars";
import RatingSlider from "./RatingSlider";
import Avatar from "./Avatar";
import BanModal from "./BanModal";
import { ShareModal } from "./ShareControl";

export default function ReviewSection({ drinkId }) {
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
  const [banTarget, setBanTarget] = useState(null);

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

  const handleAdminDelete = async (reviewId) => {
    const reason = window.prompt("Причина удаления отзыва (будет показана автору):", "");
    if (reason === null) return;
    try {
      await deleteReviewAsAdmin(reviewId, reason);
      await load();
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
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteMyReview(drinkId);
      setMyRating(0);
      setMyText("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="rating-summary">
        <div className="rating-big">{rating.average > 0 ? rating.average.toFixed(1) : "—"}</div>
        <div>
          <RatingStars value={Math.round(rating.average)} readonly size={18} />
          <div className="meta">Средняя оценка · {rating.count} отзывов</div>
        </div>
      </div>

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
        <h3 className="section-title">Отзывы пользователей ({reviews.length})</h3>
        {reviews.length === 0 ? (
          <div className="state" style={{ padding: 30 }}>Пока никто не оставил отзыв.</div>
        ) : (
          <div className="review-list">
            {reviews.map((r) => (
              <div key={r.id} className={`review ${r.mine ? "mine" : ""}`}>
                <div className="review-head">
                  <Link to={`/user/${r.userId}`}>
                    <Avatar url={r.userAvatarUrl} name={r.userDisplayName} size={32} />
                  </Link>
                  <Link to={`/user/${r.userId}`} className="review-author">{r.userDisplayName}</Link>
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
              </div>
            ))}
          </div>
        )}
      </div>

      {banTarget && (
        <BanModal user={banTarget} onClose={() => setBanTarget(null)}
          onDone={() => { setBanTarget(null); load(); }} />
      )}
    </>
  );
}

/**
 * Меню «⋮» справа сверху отзыва: все действия в одном месте —
 * «Переслать» (всем авторизованным) + модерация (предупредить/забанить/удалить) для админа.
 */
function ReviewActions({ review, isAdmin, onWarn, onBan, onDelete }) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const ref = useRef(null);
  const authed = isAuthenticated();
  const adminActions = isAdmin && !review.mine;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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
              onClick={() => { setOpen(false); setShareOpen(true); }}>
              <span aria-hidden>↗</span> Переслать
            </button>
          )}
          {adminActions && (
            <>
              <button type="button" className="share-menu-item"
                onClick={() => { setOpen(false); onWarn(review); }}>
                <span aria-hidden>⚠</span> Предупредить
              </button>
              <button type="button" className="share-menu-item"
                onClick={() => { setOpen(false); onBan(review); }}>
                <span aria-hidden>🔨</span> Забанить
              </button>
              <button type="button" className="share-menu-item danger"
                onClick={() => { setOpen(false); onDelete(review.id); }}>
                <span aria-hidden>×</span> Удалить отзыв
              </button>
            </>
          )}
        </div>
      )}

      {shareOpen && <ShareModal reviewId={review.id} onClose={() => setShareOpen(false)} />}
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
