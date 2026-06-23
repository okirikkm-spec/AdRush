import { useState, useEffect, useRef, useCallback } from "react";
import { fetchNotifications, fetchUnreadCount, markNotificationsRead } from "../services/api";

/**
 * Единый источник данных уведомлений: количество непрочитанных + список.
 * Используется и колоколом (десктоп), и бургер-меню (мобильные), чтобы не дублировать запросы.
 */
export function useNotifications(enabled) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const unreadRef = useRef(0);

  useEffect(() => {
    unreadRef.current = unread;
  }, [unread]);

  useEffect(() => {
    if (!enabled) return;
    fetchUnreadCount().then((d) => setUnread(d.count || 0)).catch(() => {});
  }, [enabled]);

  /** Загрузить список и (если были непрочитанные) пометить всё прочитанным. */
  const loadAndMarkRead = useCallback(async () => {
    try {
      const data = await fetchNotifications();
      setItems(data);
      setLoaded(true);
      if (unreadRef.current > 0) {
        await markNotificationsRead();
        setUnread(0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return { items, unread, loaded, loadAndMarkRead };
}
