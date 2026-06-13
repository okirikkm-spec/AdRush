import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchReviews, fetchRating, submitReview, deleteMyReview, isAuthenticated,
  fetchMe, deleteReviewAsAdmin, warnUser,
} from "../services/api";
import RatingStars from "./RatingStars";
import Avatar from "./Avatar";
import BanModal from "./BanModal";

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
              <RatingStars value={myRating} onRate={setMyRating} size={26} showValue />
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
                  {isAdmin && !r.mine && (
                    <span className="review-mod">
                      <button className="review-mod-btn" title="Предупредить автора"
                        onClick={() => handleWarnAuthor(r)}>⚠</button>
                      <button className="review-mod-btn" title="Забанить автора"
                        onClick={() => setBanTarget({ id: r.userId, displayName: r.userDisplayName, avatarUrl: r.userAvatarUrl })}>🔨</button>
                      <button className="review-mod-btn review-mod-del" title="Удалить отзыв (с причиной)"
                        onClick={() => handleAdminDelete(r.id)}>×</button>
                    </span>
                  )}
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

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}
