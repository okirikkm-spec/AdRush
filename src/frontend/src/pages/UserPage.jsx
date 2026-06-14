import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Avatar from "../components/Avatar";
import TierList from "../components/TierList";
import RatingStars from "../components/RatingStars";
import BanModal from "../components/BanModal";
import {
  fetchUserProfile, fetchMe, isAuthenticated,
  deleteReviewAsAdmin, warnUser,
} from "../services/api";

export default function UserPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [me, setMe] = useState(null);
  const [banTarget, setBanTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    return fetchUserProfile(id)
      .then((d) => {
        setData(d);
        document.title = `${d.user.displayName} — AdRush`;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
    if (isAuthenticated()) fetchMe().then(setMe).catch(() => {});
  }, [load]);

  const isSelf = me && data && me.id === data.user.id;
  const isAdmin = me?.role === "ADMIN";
  const targetIsAdmin = data?.user.role === "ADMIN";
  const canModerate = isAdmin && !isSelf && !targetIsAdmin;

  const handleAdminDelete = async (reviewId) => {
    const reason = window.prompt("Причина удаления отзыва (будет показана автору):", "");
    if (reason === null) return;
    try { await deleteReviewAsAdmin(reviewId, reason); await load(); }
    catch (e) { alert(e.message); }
  };

  const handleWarn = async () => {
    const msg = window.prompt(`Предупреждение для «${data.user.displayName}» (придёт уведомлением):`, "");
    if (msg === null) return;
    try { await warnUser(data.user.id, msg); alert("Предупреждение отправлено."); }
    catch (e) { alert(e.message); }
  };

  return (
    <>
      <Navbar />
      <div className="page">
        {loading && <div className="state">Загрузка…</div>}
        {error && <div className="state error-text">{error}</div>}

        {data && (
          <>
            <div className="card">
              <div className="profile-head" style={{ marginBottom: 0 }}>
                <Avatar url={data.user.avatarUrl} name={data.user.displayName} size={72} />
                <div>
                  <div className="profile-name">{data.user.displayName}</div>
                  <div className="muted" style={{ fontSize: 13 }}>@{data.user.username}</div>
                  {data.user.role === "ADMIN" && <span className="profile-role">Администратор</span>}
                </div>
              </div>

              {canModerate && (
                <div className="row" style={{ marginTop: 16 }}>
                  <button className="btn btn-secondary btn-sm" onClick={handleWarn}>⚠ Предупредить</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setBanTarget(data.user)}>🔨 Забанить</button>
                </div>
              )}
            </div>

            {!data.canSeeReviews ? (
              <div className="card">
                <div className="state" style={{ padding: 30 }}>🔒 Этот профиль закрыт.</div>
              </div>
            ) : (
              <>
                <div className="card">
                  <div className="card-title">🏆 Тир-лист</div>
                  <TierList reviews={data.reviews} />
                </div>

                <div className="card">
                  <div className="card-title">Отзывы ({data.reviews.length})</div>
                  {data.reviews.length === 0 ? (
                    <div className="muted">Пока нет отзывов.</div>
                  ) : (
                    <div className="review-list">
                      {data.reviews.map((r) => (
                        <div key={r.id} className="review">
                          <div className="review-head">
                            <Link to={`/drink/${r.drinkId}`} className="review-author">{r.drinkName}</Link>
                            <span className="review-rating">★ {r.rating}/10</span>
                            {isAdmin && !isSelf && (
                              <span className="review-mod" style={{ marginLeft: "auto" }}>
                                <button className="review-mod-btn review-mod-del" title="Удалить отзыв (с причиной)"
                                  onClick={() => handleAdminDelete(r.id)}>×</button>
                              </span>
                            )}
                          </div>
                          <RatingStars value={r.rating} readonly size={15} />
                          {r.text && <div className="review-text" style={{ marginTop: 6 }}>{r.text}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {banTarget && (
        <BanModal user={banTarget} onClose={() => setBanTarget(null)}
          onDone={() => { setBanTarget(null); load(); }} />
      )}
    </>
  );
}
