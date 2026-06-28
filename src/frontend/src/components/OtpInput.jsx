import { useRef } from "react";

/**
 * Ввод одноразового кода: N отдельных ячеек с автопереходом, backspace и вставкой.
 * Контролируется строкой value (только цифры), длина по умолчанию 6.
 */
export default function OtpInput({ value = "", onChange, length = 6, autoFocus = true }) {
  const refs = useRef([]);
  const focus = (i) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const onCell = (i, e) => {
    const digit = (e.target.value.match(/\d/g) || []).pop();
    if (!digit) return;
    onChange((value.slice(0, i) + digit + value.slice(i + 1)).slice(0, length));
    focus(i + 1);
  };

  const onKey = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) onChange(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) { onChange(value.slice(0, i - 1) + value.slice(i)); focus(i - 1); }
    } else if (e.key === "ArrowLeft") focus(i - 1);
    else if (e.key === "ArrowRight") focus(i + 1);
  };

  const onPaste = (e) => {
    const d = (e.clipboardData.getData("text").match(/\d/g) || []).join("").slice(0, length);
    if (!d) return;
    e.preventDefault();
    onChange(d);
    focus(d.length);
  };

  return (
    <div className="otp-input" onPaste={onPaste}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="otp-cell"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={value[i] || ""}
          onChange={(e) => onCell(i, e)}
          onKeyDown={(e) => onKey(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Цифра ${i + 1}`}
        />
      ))}
    </div>
  );
}
