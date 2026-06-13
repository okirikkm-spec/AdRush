import { useEffect, useState } from "react";
import { banUser, fetchLinkedAccounts } from "../services/api";
import Avatar from "./Avatar";

export default function BanModal({ user, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [permanent, setPermanent] = useState(true);
  const [days, setDays] = useState(7);
  const [deleteComments, setDeleteComments] = useState(false);
  const [linked, setLinked] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLinkedAccounts(user.id).then(setLinked).catch(() => {});
  }, [user.id]);

  const toggleLinked = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!reason.trim()) { setError("Укажите причину бана"); return; }
    setSaving(true);
    setError(null);
    try {
      await banUser(user.id, {
        reason: reason.trim(),
        durationDays: permanent ? null : Number(days),
        deleteComments,
        alsoBanUserIds: [...selected],
      });
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-body">
          <div className="modal-header">
            <h2 className="modal-title" style={{ fontSize: 18 }}>Бан · {user.displayName}</h2>
          </div>

          <div className="input-group">
            <label className="input-label">Причина</label>
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="За что блокируется аккаунт…" style={{ minHeight: 70 }} />
          </div>

          <div className="input-group">
            <label className="input-label">Срок</label>
            <div className="row">
              <label className="switch-label">
                <input type="radio" checked={permanent} onChange={() => setPermanent(true)} /> Навсегда
              </label>
              <label className="switch-label">
                <input type="radio" checked={!permanent} onChange={() => setPermanent(false)} /> На срок
              </label>
              {!permanent && (
                <span className="row" style={{ gap: 6 }}>
                  <input className="input" type="number" min="1" value={days}
                    onChange={(e) => setDays(e.target.value)} style={{ width: 70 }} />
                  <span className="muted" style={{ fontSize: 13 }}>дней</span>
                </span>
              )}
            </div>
          </div>

          <label className="switch-label" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={deleteComments} onChange={(e) => setDeleteComments(e.target.checked)} />
            Удалить все комментарии пользователя
          </label>

          {linked.length > 0 && (
            <div className="input-group">
              <label className="input-label">Связанные аккаунты — забанить выбранные ({selected.size})</label>
              <div className="linked-list">
                {linked.map((u) => (
                  <label className="linked-row" key={u.id}>
                    <input type="checkbox" checked={selected.has(u.id)}
                      onChange={() => toggleLinked(u.id)} disabled={u.role === "ADMIN"} />
                    <Avatar url={u.avatarUrl} name={u.displayName} size={24} />
                    <span className="linked-name">{u.displayName} <span className="muted">@{u.username}</span></span>
                    {u.role === "BANNED" && <span className="ban-badge">бан</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <div className="error-text">{error}</div>}

          <div className="modal-actions" style={{ marginTop: 14 }}>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={submit} disabled={saving}>
              {saving ? "…" : `Забанить${selected.size ? ` (+${selected.size})` : ""}`}
            </button>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}
