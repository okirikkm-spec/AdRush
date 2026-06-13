import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAdminUsers, fetchLinkedAccounts, unbanUser, deleteUserAccount,
  setUserAdmin, warnUser, fetchMe,
} from "../services/api";
import Avatar from "./Avatar";
import BanModal from "./BanModal";

function fmtDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function BanBadge({ user }) {
  if (user.role !== "BANNED") return null;
  const txt = user.bannedUntil ? `бан · до ${fmtDate(user.bannedUntil)}` : "бан · навсегда";
  return <span className="ban-badge" title={user.banReason || ""}>{txt}</span>;
}

function RoleBadge({ user }) {
  if (user.superAdmin) return <span className="profile-role" style={{ marginLeft: 6 }}>super-admin</span>;
  if (user.role === "ADMIN") return <span className="profile-role" style={{ marginLeft: 6 }}>admin</span>;
  return null;
}

export default function UserModeration() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [banTarget, setBanTarget] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [linkedCache, setLinkedCache] = useState({});
  const [myUsername, setMyUsername] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetchAdminUsers()
      .then(setUsers)
      .catch((e) => setError(e.message || "Не удалось загрузить пользователей"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetchMe().then((me) => setMyUsername(me?.username)).catch(() => {});
  }, []);

  const iAmSuper = !!users.find((u) => u.username === myUsername)?.superAdmin;

  const toggleLinked = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!linkedCache[id]) {
      try {
        const data = await fetchLinkedAccounts(id);
        setLinkedCache((c) => ({ ...c, [id]: data }));
      } catch { setLinkedCache((c) => ({ ...c, [id]: [] })); }
    }
  };

  const handleUnban = async (id) => { await unbanUser(id); load(); };

  const handleDelete = async (u) => {
    if (!window.confirm(`Удалить аккаунт «${u.displayName}» из базы безвозвратно? Его отзывы тоже удалятся.`)) return;
    try { await deleteUserAccount(u.id); load(); } catch (e) { alert(e.message); }
  };

  const handleWarn = async (u) => {
    const msg = window.prompt(`Предупреждение для «${u.displayName}» (придёт ему уведомлением):`, "");
    if (msg === null) return;
    try { await warnUser(u.id, msg); alert("Предупреждение отправлено."); } catch (e) { alert(e.message); }
  };

  const handleSetRole = async (u, makeAdmin) => {
    const verb = makeAdmin ? "выдать права администратора" : "снять права администратора";
    if (!window.confirm(`Точно ${verb} пользователю «${u.displayName}»?`)) return;
    try { await setUserAdmin(u.id, makeAdmin); load(); } catch (e) { alert(e.message); }
  };

  const filtered = query
    ? users.filter((u) => {
        const q = query.toLowerCase();
        return (u.username || "").toLowerCase().includes(q)
          || (u.displayName || "").toLowerCase().includes(q)
          || (u.lastIp || "").includes(q)
          || (u.registrationIp || "").includes(q);
      })
    : users;

  return (
    <div className="card">
      <div className="card-title">🛡️ Пользователи и модерация</div>

      <input className="input" placeholder="Поиск по логину, имени или IP…"
        value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 14 }} />

      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div className="muted">Загрузка…</div>
      ) : !error && filtered.length === 0 ? (
        <div className="muted">{users.length === 0 ? "Пользователей пока нет." : "Никого не найдено по запросу."}</div>
      ) : (
        <div className="mod-list">
          {filtered.map((u) => {
            const isSelf = u.username === myUsername;
            const showActions = u.linkedCount > 0 || u.role !== "ADMIN"
              || (iAmSuper && !isSelf && !u.superAdmin);

            return (
              <div className="mod-user" key={u.id}>
                <div className="mod-user-row">
                  <Avatar url={u.avatarUrl} name={u.displayName} size={36} />
                  <div className="mod-user-main">
                    <div className="mod-user-name">
                      <Link to={`/user/${u.id}`}>{u.displayName}</Link>
                      <span className="muted"> @{u.username}</span>
                      <RoleBadge user={u} />
                      <BanBadge user={u} />
                    </div>
                    <div className="mod-user-meta">
                      отзывов: {u.reviewCount} · IP: {u.lastIp || "—"}
                      {u.lastFingerprint && <> · устр.: {u.lastFingerprint.slice(0, 10)}</>}
                      {u.linkedCount > 0 && <> · связанных: {u.linkedCount}</>}
                    </div>
                  </div>
                </div>

                {showActions && (
                  <div className="mod-user-actions">
                    {u.linkedCount > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleLinked(u.id)}>
                        Связанные ({u.linkedCount})
                      </button>
                    )}

                    {u.role !== "ADMIN" && !isSelf && (
                      <button className="btn btn-ghost btn-sm" onClick={() => handleWarn(u)}>Предупредить</button>
                    )}

                    {u.role === "BANNED" ? (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleUnban(u.id)}>Снять бан</button>
                    ) : u.role !== "ADMIN" ? (
                      <button className="btn btn-danger btn-sm" onClick={() => setBanTarget(u)}>Бан</button>
                    ) : null}

                    {iAmSuper && !isSelf && !u.superAdmin && (
                      u.role === "ADMIN" ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSetRole(u, false)}>Снять админку</button>
                      ) : (
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSetRole(u, true)}>Сделать админом</button>
                      )
                    )}

                    {u.role !== "ADMIN" && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>Удалить</button>
                    )}
                  </div>
                )}

                {expanded === u.id && (
                  <div className="linked-list" style={{ marginTop: 10 }}>
                    {(linkedCache[u.id] || []).length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>Нет связанных аккаунтов.</div>
                    ) : (
                      linkedCache[u.id].map((l) => (
                        <div className="linked-row" key={l.id}>
                          <Avatar url={l.avatarUrl} name={l.displayName} size={24} />
                          <span className="linked-name">
                            <Link to={`/user/${l.id}`}>{l.displayName}</Link>
                            <span className="muted"> @{l.username} · IP {l.lastIp || "—"}</span>
                          </span>
                          <BanBadge user={l} />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {banTarget && (
        <BanModal user={banTarget} onClose={() => setBanTarget(null)}
          onDone={() => { setBanTarget(null); load(); }} />
      )}
    </div>
  );
}
