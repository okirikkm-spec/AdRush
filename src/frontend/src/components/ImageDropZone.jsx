import { useRef, useState } from "react";

/**
 * Универсальный выбор изображения: перетаскивание файла, клик для выбора,
 * либо вставка ссылки. Сообщает выбор через onSelect({ file }) | onSelect({ url }).
 *
 * Переключатель фона показывается, только если передан onBgMode: «оставить» — грузим как есть,
 * «убрать белый» — сервер вырезает белый фон сам (как у пэкшотов из каталогов), «настроить» —
 * родитель открывает редактор фона. Состояние живёт у родителя: выбор файла где-то запускает
 * загрузку сразу (галерея), а где-то ждёт кнопки «Создать карточку» (админка), и в обоих
 * случаях нужно значение на момент отправки.
 */
export default function ImageDropZone({ onSelect, busy = false, bgMode = "none", onBgMode }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);

  const pickFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setPreview(URL.createObjectURL(file));
    onSelect({ file });
  };

  const submitUrl = () => {
    const v = url.trim();
    if (!v) return;
    setPreview(v);
    onSelect({ url: v });
    setUrl("");
  };

  return (
    <div className="imgdrop">
      {onBgMode && (
        <div className="imgdrop-bg">
          <span className="imgdrop-bg-label">Фон</span>
          <div className="bge-seg">
            {[
              ["none", "оставить", "Загрузить картинку как есть"],
              ["auto", "убрать белый", "Убрать белый фон автоматически — как у пэкшотов из каталогов"],
              ["manual", "настроить…", "Редактор: цвета с допуском, области, кисти, инверсии"],
            ].map(([id, label, hint]) => (
              <button key={id} type="button" title={hint} disabled={busy}
                className={`bge-chip ${bgMode === id ? "on" : ""}`}
                onClick={() => onBgMode(id)}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {onBgMode && bgMode === "manual" && (
        <div className="muted imgdrop-note">Редактор откроется, когда выберете файл или добавите ссылку.</div>
      )}

      <div
        className={`imgdrop-zone ${dragOver ? "dragover" : ""} ${preview ? "has-preview" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]); }}
      >
        {preview ? (
          <img className="imgdrop-preview" src={preview} alt="превью" />
        ) : (
          <div className="imgdrop-hint">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>Перетащите фото сюда<br />или нажмите, чтобы выбрать</span>
          </div>
        )}
        {busy && <div className="imgdrop-busy">Загрузка…</div>}
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => pickFile(e.target.files?.[0])} />

      <div className="imgdrop-url">
        <input
          className="input"
          placeholder="…или вставьте ссылку на изображение"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitUrl(); } }}
        />
        <button type="button" className="btn btn-secondary" onClick={submitUrl} disabled={!url.trim() || busy}>
          Добавить
        </button>
      </div>
    </div>
  );
}
