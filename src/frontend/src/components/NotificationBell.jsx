import { useState } from "react";

export function fmtNotif(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

/**
 * Колокол уведомлений (десктоп). Данные приходят из useNotifications через пропсы,
 * чтобы счётчик был общим с бургер-меню. onOpen вызывается при открытии (пометить прочитанным).
 */
export default function NotificationBell({ items, unread, loaded, onOpen, className = "" }) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && onOpen) onOpen();
  };

  return (
    <div className={"notif " + className}>
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
            <NotificationList items={items} loaded={loaded} />
          </div>
        </>
      )}
    </div>
  );
}

/** Переиспользуемый список уведомлений (колокол + бургер-меню). */
export function NotificationList({ items, loaded }) {
  if (!loaded) return <div className="notif-empty">Загрузка…</div>;
  if (items.length === 0) return <div className="notif-empty">Пока ничего нет</div>;
  return (
    <div className="notif-scroll">
      {items.map((n) => (
        <div className={`notif-item ${n.read ? "" : "unread"}`} key={n.id}>
          <div className="notif-msg">{n.message}</div>
          <div className="notif-date">{fmtNotif(n.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}
