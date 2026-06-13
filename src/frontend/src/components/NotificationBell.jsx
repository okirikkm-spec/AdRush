import { useEffect, useState } from "react";
import { fetchNotifications, fetchUnreadCount, markNotificationsRead } from "../services/api";

function fmt(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchUnreadCount().then((d) => setUnread(d.count || 0)).catch(() => {});
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        const data = await fetchNotifications();
        setItems(data);
        setLoaded(true);
        if (unread > 0) { await markNotificationsRead(); setUnread(0); }
      } catch { /* ignore */ }
    }
  };

  return (
    <div className="notif">
      <button className="btn-icon notif-btn" onClick={toggle} aria-label="Уведомления" title="Уведомления">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="notif-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-head">Уведомления</div>
            {!loaded ? (
              <div className="notif-empty">Загрузка…</div>
            ) : items.length === 0 ? (
              <div className="notif-empty">Пока ничего нет</div>
            ) : (
              <div className="notif-scroll">
                {items.map((n) => (
                  <div className={`notif-item ${n.read ? "" : "unread"}`} key={n.id}>
                    <div className="notif-msg">{n.message}</div>
                    <div className="notif-date">{fmt(n.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
