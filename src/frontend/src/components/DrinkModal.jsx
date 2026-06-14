import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { mediaUrl, fetchReviews } from "../services/api";
import Avatar from "./Avatar";

export default function DrinkModal({ drink, onClose }) {
  const navigate = useNavigate();
  const cover = mediaUrl(drink.coverUrl);

  const [showComments, setShowComments] = useState(false);
  const [reviews, setReviews] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState("new");

  // Блокируем прокрутку основной страницы, пока открыто окно
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const toggleComments = () => {
    const next = !showComments;
    setShowComments(next);
    if (next && !loaded) {
      fetchReviews(drink.id)
        .then((data) => { setReviews(data); setLoaded(true); })
        .catch(() => setLoaded(true));
    }
  };

  const sortedReviews = useMemo(() => {
    const arr = [...reviews];
    if (sort === "high") arr.sort((a, b) => b.rating - a.rating);
    else if (sort === "low") arr.sort((a, b) => a.rating - b.rating);
    // "new" — порядок уже по дате с бэкенда
    return arr;
  }, [reviews, sort]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        {cover ? (
          <img className="modal-image" src={cover} alt={drink.name} />
        ) : (
          <div className="modal-image gallery-main-empty">⚡ нет фото</div>
        )}

        <div className="modal-body">
          <div className="modal-header">
            <h2 className="modal-title">{drink.name}</h2>
          </div>

          <div className="row" style={{ marginBottom: 6 }}>
            <span className="rating-badge" style={{ fontSize: 18 }}>
              {drink.averageRating > 0 ? drink.averageRating.toFixed(1) : "—"}
              <span className="max">/10</span>
            </span>
            <span className="muted" style={{ fontSize: 13 }}>· {drink.reviewCount} оценок</span>
          </div>

          <p className="modal-desc">
            {drink.description || "Описание пока не добавлено."}
          </p>

          <div className="modal-actions">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate(`/drink/${drink.id}`)}>
              Подробнее
            </button>
            <button className={`btn ${showComments ? "btn-primary" : "btn-secondary"}`} onClick={toggleComments}>
              💬 Отзывы{drink.reviewCount ? ` (${drink.reviewCount})` : ""}
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
          </div>

          {showComments && (
            <div className="modal-comments">
              <div className="modal-comments-bar">
                <span className="muted" style={{ fontSize: 13 }}>Отзывы пользователей</span>
                <select className="mini-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="new">Сначала новые</option>
                  <option value="high">Высокая оценка</option>
                  <option value="low">Низкая оценка</option>
                </select>
              </div>

              {!loaded ? (
                <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>Загрузка…</div>
              ) : sortedReviews.length === 0 ? (
                <div className="muted" style={{ fontSize: 13, padding: "8px 0" }}>Пока нет отзывов.</div>
              ) : (
                <div className="mini-review-list">
                  {sortedReviews.map((r) => (
                    <div className="mini-review" key={r.id}>
                      <Link to={`/user/${r.userId}`}>
                        <Avatar url={r.userAvatarUrl} name={r.userDisplayName} size={28} />
                      </Link>
                      <div className="mini-review-body">
                        <div className="mini-review-head">
                          <Link to={`/user/${r.userId}`} className="mini-review-name">{r.userDisplayName}</Link>
                          <span className="review-rating">★ {r.rating}</span>
                        </div>
                        {r.text && <div className="mini-review-text">{r.text}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
