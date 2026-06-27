import { useEffect, useState, useCallback, useRef } from "react";
import { fetchDrink, fetchMe, updateDrink, deleteDrink, isAuthenticated, mediaUrl } from "../services/api";
import { coverStyle } from "../utils/coverStyle";
import { useSwipeToClose } from "../hooks/useSwipeToClose";
import PhotoGallery from "./PhotoGallery";
import ReviewSection from "./ReviewSection";
import CoverFramerModal from "./CoverFramerModal";
import ShareControl from "./ShareControl";

function ratingWord(n) {
  const a = n % 100, b = n % 10;
  if (a >= 11 && a <= 14) return "оценок";
  if (b === 1) return "оценка";
  if (b >= 2 && b <= 4) return "оценки";
  return "оценок";
}

/**
 * Полноэкранная страница энергетика (поверх главной, deep-link /drink/:id).
 * Сверху — картинка-карусель (свайп) с кнопкой «назад»; ниже название + «⋮», оценки,
 * описание, форма отзыва и отзывы. Для админа — режим правки (фото/название/описание/удаление).
 *
 * @param drinkId id энергетика (страница сама подтягивает полные данные)
 * @param summary краткие данные из списка — для мгновенного показа до загрузки
 * @param onChanged вызывается после изменений, чтобы обновить список на главной
 */
export default function DrinkModal({ drinkId, summary, onClose, onChanged }) {
  const [drink, setDrink] = useState(summary || null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [framing, setFraming] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const [nameDraft, setNameDraft] = useState(summary?.name || "");
  const [descDraft, setDescDraft] = useState(summary?.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // блокируем прокрутку фона + Esc для закрытия
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const load = useCallback(async () => {
    try {
      const full = await fetchDrink(drinkId);
      setDrink(full);
      setNameDraft(full.name || "");
      setDescDraft(full.description || "");
    } catch (e) {
      setError(e.message);
    }
  }, [drinkId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isAuthenticated()) fetchMe().then((me) => setIsAdmin(me?.role === "ADMIN")).catch(() => {});
  }, []);

  const applyUpdate = (updated) => { setDrink(updated); onChanged?.(); };
  // после изменения отзыва — обновить и страницу (строку оценок), и список на главной
  const handleReviewChange = useCallback(() => { load(); onChanged?.(); }, [load, onChanged]);

  const saveInfo = async () => {
    if (!nameDraft.trim()) { setError("Введите название"); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDrink(drinkId, { name: nameDraft.trim(), description: descDraft });
      applyUpdate(updated);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Удалить энергетик «${drink?.name}» вместе со всеми отзывами и фото?`)) return;
    try {
      await deleteDrink(drinkId);
      onChanged?.();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  const heroRef = useRef(null);
  const onHeroScroll = (e) => {
    const el = e.currentTarget;
    if (el.clientWidth) setActiveIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  // перемотка картинок (стрелки на ПК, клик по точкам)
  const goTo = (i) => {
    const el = heroRef.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(el.children.length - 1, i));
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  // прокрутка картинок зажатием ЛКМ и протягиванием вбок (мышь; тач листает нативно)
  const drag = useRef({ active: false, startX: 0, startLeft: 0 });
  const onTrackDown = (e) => {
    if (e.pointerType !== "mouse") return;
    const el = heroRef.current;
    if (!el || el.children.length < 2) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft };
    el.setPointerCapture?.(e.pointerId);
    el.classList.add("dragging");
    e.preventDefault();
  };
  const onTrackMove = (e) => {
    if (!drag.current.active) return;
    const el = heroRef.current;
    if (el) el.scrollLeft = drag.current.startLeft - (e.clientX - drag.current.startX);
  };
  const onTrackUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const el = heroRef.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const startIdx = Math.round(drag.current.startLeft / w);
    const moved = (el.scrollLeft - drag.current.startLeft) / w; // в «страницах»; знак — направление
    let target = startIdx;
    if (moved > 0.12) target = startIdx + Math.max(1, Math.round(moved));        // протянул влево — дальше
    else if (moved < -0.12) target = startIdx + Math.min(-1, Math.round(moved)); // вправо — назад
    target = Math.max(0, Math.min(el.children.length - 1, target));
    // плавно докручиваем к цели; снап (.dragging выкл) возвращаем ТОЛЬКО после остановки,
    // иначе мгновенное включение mandatory-снапа даёт «прыжок» вместо прокрутки
    el.scrollTo({ left: target * w, behavior: "smooth" });
    let done = false;
    const restore = () => { if (done) return; done = true; el.classList.remove("dragging"); el.removeEventListener("scrollend", restore); };
    el.addEventListener("scrollend", restore);
    setTimeout(restore, 600); // подстраховка, если scrollend не поддерживается
  };

  const swipeRef = useSwipeToClose(onClose);

  const photos = Array.isArray(drink?.photos) ? drink.photos : [];
  const cover = drink ? mediaUrl(drink.coverUrl) : null;
  const name = drink?.name || summary?.name || "…";
  const reviewCount = drink?.reviewCount || 0;
  const avg = drink?.averageRating || 0;

  const BackBtn = (
    <button className="drink-hero-back" onClick={onClose} aria-label="Назад">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );

  return (
    <div className="modal-overlay drink-page-overlay" onMouseDown={onClose}>
      <div className="drink-page" ref={swipeRef} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        {editing ? (
          /* ── Режим правки (админ) ── */
          <>
            <div className="drink-edit-head">
              {BackBtn}
              <span className="drink-edit-title">Редактирование</span>
            </div>
            <div className="drink-page-body">
              {drink && Array.isArray(drink.photos) && (
                <PhotoGallery
                  drinkId={drinkId}
                  photos={drink.photos}
                  canManage
                  onUpdated={applyUpdate}
                  coverFit={drink.coverFitModal}
                  coverPos={drink.coverPosModal}
                />
              )}
              <div className="input-group">
                <label className="input-label">Название</label>
                <input className="input" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
              </div>
              <div className="input-group">
                <label className="input-label">Описание</label>
                <textarea className="input" style={{ minHeight: 90 }} value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)} placeholder="Вкус, состав, впечатления…" />
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <button className="btn btn-primary btn-sm" onClick={saveInfo} disabled={saving}>
                  {saving ? "…" : "Сохранить"}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setFraming(true)}>🖼️ Кадрирование</button>
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>Удалить</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setError(null); }}>Готово</button>
              </div>
              {error && <div className="error-text">{error}</div>}
            </div>
          </>
        ) : (
          /* ── Просмотр ── */
          <>
            <div className="drink-hero">
              {BackBtn}
              {isAdmin && (
                <button className="drink-hero-edit" onClick={() => setEditing(true)} aria-label="Редактировать" title="Редактировать">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
              )}
              {photos.length > 0 ? (
                <div className={"drink-hero-track" + (photos.length > 1 ? " draggable" : "")} ref={heroRef}
                  onScroll={onHeroScroll} onPointerDown={onTrackDown} onPointerMove={onTrackMove}
                  onPointerUp={onTrackUp} onPointerCancel={onTrackUp}>
                  {photos.map((p, i) => (
                    <img key={p.id} className="drink-hero-img" src={mediaUrl(p.url)} alt={name} draggable={false}
                      style={i === 0 ? coverStyle(drink?.coverFitModal, drink?.coverPosModal) : undefined}
                      loading={i === 0 ? "eager" : "lazy"} decoding="async" />
                  ))}
                </div>
              ) : cover ? (
                <div className="drink-hero-track">
                  <img className="drink-hero-img" src={cover} alt={name}
                    style={coverStyle(drink?.coverFitModal, drink?.coverPosModal)} decoding="async" />
                </div>
              ) : (
                <div className="drink-hero-empty">⚡</div>
              )}
              {photos.length > 1 && (
                <>
                  <button type="button" className="drink-hero-nav prev" onClick={() => goTo(activeIdx - 1)}
                    disabled={activeIdx === 0} aria-label="Предыдущее фото">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <button type="button" className="drink-hero-nav next" onClick={() => goTo(activeIdx + 1)}
                    disabled={activeIdx >= photos.length - 1} aria-label="Следующее фото">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                  <div className="drink-hero-dots">
                    {photos.map((p, i) => (
                      <button type="button" key={p.id} className={"drink-hero-dot" + (i === activeIdx ? " on" : "")}
                        onClick={() => goTo(i)} aria-label={`Фото ${i + 1}`} />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="drink-page-body">
              <div className="drink-page-titlebar">
                <h2 className="modal-title">{name}</h2>
                <ShareControl drinkId={drinkId} className="modal-detail-share" />
              </div>

              {drink?.brand && <span className="drink-card-brand">{drink.brand}</span>}

              <div className="drink-page-rating">
                {reviewCount > 0 ? (
                  <>
                    <span className="drink-page-stat"><b className="drink-rating-avg">{avg.toFixed(1)}</b> средний балл</span>
                    <span className="drink-page-stat"><b>{reviewCount}</b> {ratingWord(reviewCount)}</span>
                  </>
                ) : (
                  <span className="muted">Пока нет оценок</span>
                )}
              </div>

              {drink?.description && <p className="modal-desc">{drink.description}</p>}

              <ReviewSection drinkId={drinkId} showSummary={false} onChanged={handleReviewChange} />
            </div>
          </>
        )}

        {framing && drink && (
          <CoverFramerModal drink={drink} onClose={() => setFraming(false)} onSaved={applyUpdate} />
        )}
      </div>
    </div>
  );
}
