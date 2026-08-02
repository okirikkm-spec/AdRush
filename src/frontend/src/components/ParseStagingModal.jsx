import { useEffect, useState } from "react";
import {
  fetchParseSources, runParse, fetchParseCandidates, applyCandidates,
  unignoreCandidate, forgetCandidate,
} from "../services/api";
import { CheckIcon, RefreshIcon } from "./icons";

/**
 * Приёмка каталога: показывает, что нашли парсеры, и даёт решить судьбу каждой позиции.
 *
 * Карточки каталога создаются только по кнопке «Добавить выбранные». Позиции без галочки уходят в
 * игнор и при следующих обходах предлагаться не будут — вкладка «Игнор» их показывает, оттуда можно
 * вернуть или забыть совсем. Позиции, похожие на уже существующие карточки, приходят с пометкой и
 * по умолчанию не отмечены: у одного напитка на разных сайтах названия расходятся, и решить, дубль
 * это или нет, может только человек.
 */
export default function ParseStagingModal({ onClose }) {
  const [tab, setTab] = useState("pending");
  const [sources, setSources] = useState([]);
  const [selectedSources, setSelectedSources] = useState(() => new Set());
  const [items, setItems] = useState([]);
  const [ignored, setIgnored] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [edits, setEdits] = useState({});
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const loadCandidates = async () => {
    const [pendingRes, ignoredRes] = await Promise.all([
      fetchParseCandidates("PENDING"),
      fetchParseCandidates("IGNORED"),
    ]);
    const pending = pendingRes.items || [];
    setItems(pending);
    setIgnored(ignoredRes.items || []);
    // по умолчанию отмечаем только то, что не похоже на уже существующую карточку
    setPicked(new Set(pending.filter((i) => !i.similarTo).map((i) => i.id)));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchParseSources().then((list) => { setSources(list); setSelectedSources(new Set(list)); }),
      loadCandidates(),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleSource = (name) => setSelectedSources((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const togglePick = (id) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const allPicked = items.length > 0 && items.every((i) => picked.has(i.id));
  const setAllPicked = () => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.id)));

  const scan = async () => {
    setMsg(null); setError(null); setScanning(true);
    try {
      const r = await runParse({ brands: [...selectedSources] });
      await loadCandidates();
      setTab("pending");
      setMsg(`Обход завершён. Найдено: ${r.found} · новых в приёмке: ${r.added} · уже в каталоге: ${r.alreadyInCatalog}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    setMsg(null); setError(null); setApplying(true);
    try {
      const accept = items.filter((i) => picked.has(i.id)).map((i) => ({
        id: i.id,
        name: edits[i.id]?.name ?? i.name,
        description: edits[i.id]?.description ?? i.description,
      }));
      const ignore = items.filter((i) => !picked.has(i.id)).map((i) => i.id);
      const r = await applyCandidates({ accept, ignore });
      await loadCandidates();
      setEdits({});
      setMsg(`Добавлено в каталог: ${r.created} · отправлено в игнор: ${r.ignored}`
        + (r.failed ? ` · ошибок: ${r.failed}` : ""));
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  const restore = async (id) => {
    try {
      await unignoreCandidate(id);
      await loadCandidates();
    } catch (e) { setError(e.message); }
  };

  const forget = async (id) => {
    try {
      await forgetCandidate(id);
      await loadCandidates();
    } catch (e) { setError(e.message); }
  };

  const editField = (id, field, value) => setEdits((prev) => ({
    ...prev, [id]: { ...prev[id], [field]: value },
  }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-picker modal-staging" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="picker-head">
          <div className="picker-head-main">
            <span className="picker-icon"><RefreshIcon size={20} /></span>
            <div>
              <h2 className="picker-title">Приёмка каталога</h2>
              <p className="picker-sub">Отметьте напитки для добавления — остальные уйдут в игнор</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="picker-body">
          <div className="admin-tabs" role="tablist" style={{ marginBottom: 14 }}>
            <button className={`admin-tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>
              Найдено{items.length ? ` · ${items.length}` : ""}
            </button>
            <button className={`admin-tab ${tab === "ignored" ? "active" : ""}`} onClick={() => setTab("ignored")}>
              Игнор{ignored.length ? ` · ${ignored.length}` : ""}
            </button>
            <button className={`admin-tab ${tab === "scan" ? "active" : ""}`} onClick={() => setTab("scan")}>
              Обход источников
            </button>
          </div>

          {loading && <div className="muted" style={{ fontSize: 13 }}>Загрузка…</div>}

          {tab === "scan" && !loading && (
            <>
              <div className="picker-section-label">Источники</div>
              <div className="opt-list">
                {sources.map((name) => (
                  <button type="button" key={name}
                    className={`opt ${selectedSources.has(name) ? "sel" : ""}`}
                    onClick={() => toggleSource(name)}>
                    <span className="opt-check">{selectedSources.has(name) && <CheckIcon />}</span>
                    <span className="opt-label">{name}</span>
                  </button>
                ))}
              </div>
              <div className="badge-info" style={{ marginTop: 14 }}>
                Обход только собирает позиции в приёмку — карточки каталога при этом не создаются.
                То, что уже есть в каталоге, в список не попадает.
              </div>
              <button className="btn btn-secondary" style={{ marginTop: 12 }}
                onClick={scan} disabled={scanning || selectedSources.size === 0}>
                {scanning ? "Обход…" : "Обойти выбранные"}
              </button>
            </>
          )}

          {tab === "pending" && !loading && (
            items.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Приёмка пуста — запустите обход на вкладке «Обход источников».
              </div>
            ) : (
              <>
                <button type="button" className={`opt opt-all ${allPicked ? "sel" : ""}`} onClick={setAllPicked}>
                  <span className="opt-check">{allPicked && <CheckIcon />}</span>
                  <span className="opt-label">Выбрать все</span>
                  <span className="opt-meta">{picked.size} / {items.length}</span>
                </button>
                <div className="picker-divider" />
                <div className="staging-list">
                  {items.map((item) => (
                    <div key={item.id} className={`staging-row ${picked.has(item.id) ? "sel" : ""}`}>
                      <button type="button" className="opt-check staging-check"
                        onClick={() => togglePick(item.id)} aria-label="Выбрать">
                        {picked.has(item.id) && <CheckIcon />}
                      </button>
                      {item.imageUrl && (
                        <img className="staging-thumb" src={item.imageUrl} alt="" loading="lazy" />
                      )}
                      <div className="staging-main">
                        <input className="input staging-name"
                          value={edits[item.id]?.name ?? item.name}
                          onChange={(e) => editField(item.id, "name", e.target.value)} />
                        <textarea className="input staging-desc" rows={2}
                          placeholder="Описание (необязательно)"
                          value={edits[item.id]?.description ?? item.description ?? ""}
                          onChange={(e) => editField(item.id, "description", e.target.value)} />
                        <div className="staging-meta">
                          <span className="muted">{item.brand} · {item.source}</span>
                          {item.similarTo && (
                            <span className="staging-warn">похоже на «{item.similarTo}»</span>
                          )}
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer">источник ↗</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}

          {tab === "ignored" && !loading && (
            ignored.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>
                Игнор пуст. Сюда попадают позиции, которые вы не отметили при добавлении.
              </div>
            ) : (
              <div className="staging-list">
                {ignored.map((item) => (
                  <div key={item.id} className="staging-row">
                    {item.imageUrl && <img className="staging-thumb" src={item.imageUrl} alt="" loading="lazy" />}
                    <div className="staging-main">
                      <div className="staging-name-static">{item.name}</div>
                      <div className="staging-meta">
                        <span className="muted">{item.brand} · {item.source}</span>
                        {item.similarTo && <span className="staging-warn">похоже на «{item.similarTo}»</span>}
                      </div>
                    </div>
                    <div className="staging-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => restore(item.id)}>Вернуть</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => forget(item.id)}>Забыть</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {error && <div className="error-text">{error}</div>}
          {msg && <div className="picker-result">{msg}</div>}
        </div>

        <div className="picker-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={applying || scanning}>Закрыть</button>
          {tab === "pending" && items.length > 0 && (
            <button className="btn btn-primary" onClick={apply} disabled={applying}>
              {applying ? "Добавление…" : `Добавить выбранные (${picked.size})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
