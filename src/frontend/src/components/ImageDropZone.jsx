import { useRef, useState } from "react";

/**
 * Универсальный выбор изображения: перетаскивание файла, клик для выбора,
 * либо вставка ссылки. Сообщает выбор через onSelect({ file }) | onSelect({ url }).
 */
export default function ImageDropZone({ onSelect, busy = false }) {
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
