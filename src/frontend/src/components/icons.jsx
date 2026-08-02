// Небольшие inline-SVG иконки (наследуют currentColor).

/** Иконка фильтра — три горизонтальные палочки убывающей длины. */
export function FilterIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="10" y1="17" x2="14" y2="17" />
    </svg>
  );
}

/** Иконка отзыва — речевой пузырь. */
export function CommentIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

/** Галочка для выбранных пунктов. */
export function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── Иконки профиля. Тот же контурный стиль, что в шапке сайта:
      viewBox 24, без заливки, обводка currentColor толщиной 2. ── */

/** Силуэт пользователя — вкладка публичного профиля. */
export function UserIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** Шестерёнка — вкладка настроек аккаунта. */
export function SettingsIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.2 5.2l1.9 1.9M16.9 16.9l1.9 1.9M18.8 5.2l-1.9 1.9M7.1 16.9l-1.9 1.9" />
    </svg>
  );
}

/** Кубок — заголовок тир-листа. */
export function TrophyIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v5.5a5 5 0 0 1-10 0V4z" />
      <path d="M17 5.5h3v1.8a3 3 0 0 1-3 3M7 5.5H4v1.8a3 3 0 0 0 3 3" />
      <path d="M12 14.5V18M8.5 21h7" />
    </svg>
  );
}

/** Конверт — заголовок карточки почты. */
export function MailIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.6 6.4l8.4 5.9 8.4-5.9" />
    </svg>
  );
}

/** Крестик — отмена редактирования. */
export function CloseIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Карандаш — кнопка редактирования мини-профиля. */
export function EditIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

/** Изображение — загрузка обложки. */
export function ImageIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15.5l-5-4.5L5 20" />
    </svg>
  );
}

/** Две карточки внахлёст — кнопка «копировать». */
export function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** Лупа — поиск по каталогу энергетиков. */
export function SearchIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

/** Открытый глаз — показать введённый пароль. */
export function EyeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Перечёркнутый глаз — скрыть пароль. */
export function EyeOffIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 10.5 7 10.5 7a13.4 13.4 0 0 1-2.35 3.22M6.6 6.6C3.7 8.4 1.5 12 1.5 12s3.5 7 10.5 7a10.5 10.5 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

/** Щит с галочкой — заголовок двухфакторной аутентификации. */
export function ShieldIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 2.8v5.4c0 4.1-2.9 7.5-7 8.4-4.1-.9-7-4.3-7-8.4V5.8L12 3z" />
      <polyline points="9.2 12 11.3 14.1 15 10.4" />
    </svg>
  );
}

/* ── Молния логотипа: заглушка там, где у энергетика нет фото.
      Единственная заливаемая иконка набора — форма совпадает с молнией в шапке. ── */
export function BoltIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 L4 14 h6 l-2 8 11-14 h-6 z" />
    </svg>
  );
}

/** Коробка — раздел каталога. */
export function BoxIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.2l9-4.2 9 4.2v7.6l-9 4.2-9-4.2V8.2z" />
      <path d="M3 8.2l9 4.2 9-4.2M12 12.4V20" />
    </svg>
  );
}

/** Два силуэта — раздел пользователей. */
export function UsersIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-1.8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21" />
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M22 21v-1.8a4 4 0 0 0-3-3.85M16.5 4.2a4 4 0 0 1 0 7.1" />
    </svg>
  );
}

/** Планшет со строками — журнал аудита. */
export function ClipboardIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M8.5 11h7M8.5 15h4.5" />
    </svg>
  );
}

/** Плюс — добавление карточки. */
export function PlusIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Круговые стрелки — парсинг каталогов. */
export function RefreshIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9M3.5 12a8.5 8.5 0 0 1 14.6-5.9" />
      <polyline points="18.2 2.6 18.2 6.5 14.3 6.5" />
      <polyline points="5.8 21.4 5.8 17.5 9.7 17.5" />
    </svg>
  );
}

/** Гаечный ключ — вход в админку. */
export function WrenchIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9l-8.4 8.4a2.4 2.4 0 0 1-3.4-3.4l8.4-8.4z" />
      <path d="M14.7 6.3L11.2 2.8a4.5 4.5 0 0 0-5.9 5.9l3.5 3.5" />
    </svg>
  );
}

/** Молоток — бан пользователя. */
export function HammerIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 7.5L20 14l-2.5 2.5L11 10" />
      <path d="M15.8 3.2l5 5-2.3 2.3-5-5z" />
      <path d="M10.3 8.7L3 16v5h5l7.3-7.3" />
    </svg>
  );
}

/** Треугольник с восклицательным знаком — предупреждение. */
export function WarnIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.6l9 15.6H3l9-15.6z" />
      <path d="M12 9.5v4M12 16.6h.01" />
    </svg>
  );
}

/** Корзина — удаление. */
export function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6.5h16M9.5 6.5V4.2h5v2.3" />
      <path d="M6.5 6.5l.8 13a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-13" />
      <path d="M10.5 10.5v6.5M13.5 10.5v6.5" />
    </svg>
  );
}

/** Звезда — выдача прав администратора. */
export function StarIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.7l5.9-.8L12 3.5z" />
    </svg>
  );
}

/** Стрелка вниз — снятие прав администратора. */
export function ArrowDownIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4.5v15" />
      <polyline points="6 13.5 12 19.5 18 13.5" />
    </svg>
  );
}

/** Фотоаппарат — снимок или фото в сообщении. */
export function CameraIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5a2 2 0 0 1 2-2h2.2l1.3-2h6l1.3 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

/** Палитра — тема оформления (та же, что на кнопке редактора тем в шапке). */
export function PaletteIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r="1.4" /><circle cx="17.5" cy="10.5" r="1.4" />
      <circle cx="8.5" cy="7.5" r="1.4" /><circle cx="6.5" cy="12.5" r="1.4" />
      <path d="M12 2a10 10 0 0 0 0 20c1.7 0 2.5-1.3 2-2.7-.4-1.1.4-2.3 1.6-2.3H18a4 4 0 0 0 4-4 10 10 0 0 0-10-11z" />
    </svg>
  );
}

/** Стакан с трубочкой — карточка энергетика. */
export function CupIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8h12l-1.3 11.3a1.8 1.8 0 0 1-1.8 1.6H9.1a1.8 1.8 0 0 1-1.8-1.6L6 8z" />
      <path d="M5 8h14M13.5 8l2-5" />
    </svg>
  );
}

/** Стрелка из рамки — «поделиться». */
export function ShareIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" />
      <path d="M14.5 3.5H21v6.5M21 3.5L11.5 13" />
    </svg>
  );
}

/** Колокольчик — системные уведомления. */
export function BellIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 9a6 6 0 0 0-12 0c0 6-2.2 7.5-2.2 7.5h16.4S18 15 18 9z" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

/** Замок — закрытый профиль. */
export function LockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Дверь со стрелкой — выход из аккаунта. */
export function LogoutIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" />
      <path d="M17.5 8.5L21 12l-3.5 3.5M20.5 12H10" />
    </svg>
  );
}
