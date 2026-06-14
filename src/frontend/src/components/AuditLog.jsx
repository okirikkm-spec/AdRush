import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAuditLog, fetchAuditActors } from "../services/api";

// Метки типов действий + визуальный стиль бейджа
const ACTIONS = {
  BAN:           { label: "Бан",                icon: "🔨", cls: "audit-act-ban" },
  UNBAN:         { label: "Снятие бана",        icon: "✅", cls: "audit-act-unban" },
  DELETE_USER:   { label: "Удаление аккаунта",  icon: "🗑", cls: "audit-act-del" },
  DELETE_REVIEW: { label: "Удаление отзыва",    icon: "✖",  cls: "audit-act-del" },
  WARN:          { label: "Предупреждение",     icon: "⚠",  cls: "audit-act-warn" },
  GRANT_ADMIN:   { label: "Выдача админки",     icon: "⭐", cls: "audit-act-role" },
  REVOKE_ADMIN:  { label: "Снятие админки",     icon: "↓",  cls: "audit-act-role" },
  DRINK_CREATE:  { label: "Карточка создана",   icon: "➕", cls: "audit-act-drink" },
  DRINK_UPDATE:  { label: "Карточка изменена",  icon: "✏",  cls: "audit-act-drink" },
  DRINK_DELETE:  { label: "Карточка удалена",   icon: "🗑", cls: "audit-act-del" },
};

function fmt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AuditLog() {
  const [actors, setActors] = useState([]);
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // дебаунс свободного поиска
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => { fetchAuditActors().then(setActors).catch(() => {}); }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAuditLog({ actorId, action, q, page, size: 50 })
      .then(setData)
      .catch((e) => setError(e.message || "Не удалось загрузить журнал"))
      .finally(() => setLoading(false));
  }, [actorId, action, q, page]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setActorId(""); setAction(""); setQInput(""); setQ(""); setPage(0); };
  const hasFilters = !!(actorId || action || q);

  return (
    <div className="card">
      <div className="card-title">🧾 Журнал аудита</div>
      <div className="badge-info" style={{ marginBottom: 14 }}>
        Все действия модераторов — кто, что и с кем. Записи неизменяемы и сохраняются даже после удаления пользователя.
      </div>

      <div className="audit-filters">
        <select className="mini-select" value={actorId}
          onChange={(e) => { setActorId(e.target.value); setPage(0); }}>
          <option value="">Кто: все модераторы</option>
          {actors.filter((a) => a.id != null).map((a) => (
            <option key={a.id} value={a.id}>{a.username}</option>
          ))}
        </select>

        <select className="mini-select" value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0); }}>
          <option value="">Действие: любое</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <input className="input audit-search" placeholder="Поиск по пользователю или деталям…"
          value={qInput} onChange={(e) => setQInput(e.target.value)} />

        {hasFilters && <button className="btn btn-ghost btn-sm" onClick={reset}>Сбросить</button>}
      </div>

      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div className="muted">Загрузка…</div>
      ) : data.items.length === 0 ? (
        <div className="muted">{hasFilters ? "Ничего не найдено по фильтрам." : "Журнал пуст — действий ещё не было."}</div>
      ) : (
        <div className="audit-list">
          {data.items.map((it) => {
            const a = ACTIONS[it.action] || { label: it.action, icon: "•", cls: "" };
            return (
              <div className="audit-row" key={it.id}>
                <div className="audit-when">{fmt(it.createdAt)}</div>
                <div className="audit-main">
                  <div className="audit-line">
                    <span className={`audit-badge ${a.cls}`}>{a.icon} {a.label}</span>
                    <span className="audit-who">
                      {it.actorId
                        ? <Link to={`/user/${it.actorId}`}>{it.actorUsername}</Link>
                        : <span>{it.actorUsername}</span>}
                    </span>
                    {it.targetLabel && (
                      <span className="audit-target">
                        →{" "}
                        {it.targetType === "USER" && it.targetId ? (
                          <Link to={`/user/${it.targetId}`}>@{it.targetLabel}</Link>
                        ) : it.targetType === "DRINK" && it.targetId ? (
                          <Link to={`/drink/${it.targetId}`}>«{it.targetLabel}»</Link>
                        ) : (
                          <span>{it.targetLabel}</span>
                        )}
                      </span>
                    )}
                  </div>
                  {it.details && <div className="audit-details">{it.details}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="audit-pager">
          <button className="btn btn-ghost btn-sm" disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}>← Назад</button>
          <span className="muted">Стр. {page + 1} из {data.totalPages} · всего {data.total}</span>
          <button className="btn btn-ghost btn-sm" disabled={page >= data.totalPages - 1}
            onClick={() => setPage((p) => p + 1)}>Вперёд →</button>
        </div>
      )}
    </div>
  );
}
