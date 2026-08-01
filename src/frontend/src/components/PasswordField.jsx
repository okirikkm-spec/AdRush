import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

/**
 * Поле пароля с кнопкой-глазком для просмотра введённого текста.
 * autoComplete обязателен к передаче явно (current-password / new-password) —
 * это не только для автозаполнения браузером, но и чтобы менеджеры паролей
 * корректно понимали назначение поля и не путали его с другими полями страницы.
 */
export default function PasswordField({
  className = "input", style, value, onChange, placeholder,
  name, autoComplete, required, disabled, autoFocus, onKeyDown, id,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field" style={style}>
      <input
        id={id}
        className={className}
        type={visible ? "text" : "password"}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="password-field-toggle"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
