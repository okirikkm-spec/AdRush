import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { BracketIcon, TrophyIcon } from "../components/icons";
import { Arena, DrinkArt, Fighter } from "../games/Duel";
import GameSetup from "../games/GameSetup";
import { useGameCatalog } from "../games/useGameCatalog";
import { loadRecord, nextPow2, roundLabel, roundLabelAt, saveRecord, shuffle, winWord } from "../games/util";
import { findMode } from "../games/modes";

const MODE = findMode("bracket");
const RECORD_KEY = "ar-game-bracket-champion";

/**
 * Раунд из списка участников: пары идут подряд (1-й со 2-м, 3-й с 4-м…).
 * Если участников не степень двойки, лишним достаётся автопроход — тогда в следующем
 * раунде их ровно степень двойки и сетка дальше сходится без остатка.
 */
function buildRound(list) {
  const byes = nextPow2(list.length) - list.length;
  const passing = list.slice(0, byes);
  const playing = list.slice(byes);
  const pairs = [];
  for (let i = 0; i < playing.length; i += 2) pairs.push([playing[i], playing[i + 1]]);
  return { pairs, passing };
}

/**
 * Состав следующего раунда: автопроходы вставляем через одного с победителями. Иначе
 * отдохнувшие банки во втором раунде встречались бы только между собой.
 */
function mergeAdvanced(passing, winners) {
  const merged = [];
  for (let i = 0; i < Math.max(passing.length, winners.length); i++) {
    if (i < passing.length) merged.push(passing[i]);
    if (i < winners.length) merged.push(winners[i]);
  }
  return merged;
}

export default function BracketPage() {
  const [phase, setPhase] = useState("setup");
  const [size, setSize] = useState(16);
  const [brandFilter, setBrandFilter] = useState(null);
  const [showRatings, setShowRatings] = useState(false);
  // в каталоге много ещё не оценённых находок парсеров — их можно исключить из состава
  const [ratedOnly, setRatedOnly] = useState(false);

  const { drinks, loading, error, brands, brandCounts, pool, ratedCount } =
    useGameCatalog(brandFilter, ratedOnly);

  const [roster, setRoster] = useState([]);     // весь состав турнира
  const [roundNo, setRoundNo] = useState(1);
  const [entrants, setEntrants] = useState([]); // участники текущего раунда
  const [pairs, setPairs] = useState([]);       // пары текущего раунда
  const [pairIdx, setPairIdx] = useState(0);
  const [passing, setPassing] = useState([]);   // автопроходы текущего раунда
  const [winners, setWinners] = useState([]);   // победители сыгранных пар раунда
  const [log, setLog] = useState([]);           // { round, winner, loser } по всем парам
  const [champion, setChampion] = useState(null);
  const [last, setLast] = useState(null);       // прошлый чемпион из localStorage

  useEffect(() => {
    document.title = MODE.title + " — AdRush";
    setLast(loadRecord(RECORD_KEY));
  }, []);

  const effectiveSize = size > 0 && size <= pool.length ? size : 0;

  const start = useCallback(() => {
    const picked = shuffle(pool).slice(0, effectiveSize > 0 ? effectiveSize : pool.length);
    if (picked.length < 2) return;
    const first = buildRound(picked);
    setRoster(picked);
    setEntrants(picked);
    setRoundNo(1);
    setPairs(first.pairs);
    setPassing(first.passing);
    setPairIdx(0);
    setWinners([]);
    setLog([]);
    setChampion(null);
    setPhase("play");
  }, [pool, effectiveSize]);

  /** Выбор в паре: проигравший вылетает, победитель ждёт следующего раунда. */
  const pick = useCallback((leftWon) => {
    if (phase !== "play") return;
    const pair = pairs[pairIdx];
    if (!pair) return;
    const winner = leftWon ? pair[0] : pair[1];
    const loser = leftWon ? pair[1] : pair[0];
    const nextWinners = [...winners, winner];

    setWinners(nextWinners);
    setLog((l) => [...l, { round: roundNo, winner, loser }]);

    // в раунде остались пары — просто идём дальше
    if (pairIdx + 1 < pairs.length) {
      setPairIdx(pairIdx + 1);
      return;
    }

    // раунд сыгран: победители (вместе с автопроходами) образуют следующий
    const advanced = mergeAdvanced(passing, nextWinners);
    if (advanced.length === 1) {
      setChampion(advanced[0]);
      setPhase("over");
      const fresh = { drinkId: advanced[0].id, name: advanced[0].name, size: roster.length };
      setLast(fresh);
      saveRecord(RECORD_KEY, fresh);
      return;
    }
    const next = buildRound(advanced);
    setEntrants(advanced);
    setPairs(next.pairs);
    setPassing(next.passing);
    setPairIdx(0);
    setWinners([]);
    setRoundNo(roundNo + 1);
  }, [phase, pairs, pairIdx, winners, passing, roundNo, roster.length]);

  useEffect(() => {
    if (phase !== "play") return;
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      pick(e.key === "ArrowLeft");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, pick]);

  // в сетке всегда ровно «участников минус один» поединков: каждый, кроме чемпиона, вылетает
  const total = Math.max(roster.length - 1, 0);
  const wins = useMemo(() => {
    const m = {};
    for (const { winner } of log) m[winner.id] = (m[winner.id] || 0) + 1;
    return m;
  }, [log]);

  /** Кого чемпион обыграл по дороге — самое интересное в итогах турнира. */
  const path = useMemo(
    () => (champion ? log.filter((m) => m.winner.id === champion.id) : []),
    [log, champion]
  );
  const finalist = log.length > 0 ? log[log.length - 1].loser : null;

  /** Подпись банки в паре: сколько боёв она уже выиграла в этом турнире. */
  const fighterTag = (drink) => {
    const w = wins[drink.id] || 0;
    return w > 0 ? `${w} ${winWord(w)} в сетке` : "Первый бой";
  };

  const pair = pairs[pairIdx];

  return (
    <>
      <Navbar />
      <div className="page page-wide">
        <div className="page-head" style={{ marginBottom: 6 }}>
          <h1 className="page-title"><BracketIcon size={24} /> {MODE.title}</h1>
          <Link className="btn btn-ghost btn-sm" to="/games">Все мини-игры</Link>
        </div>

        {loading && <div className="state">Загрузка каталога…</div>}
        {error && <div className="state error-text">{error}</div>}
        {!loading && !error && drinks.length < 2 && (
          <div className="state">В каталоге пока меньше двух энергетиков — играть не с чем.</div>
        )}

        {!loading && !error && drinks.length >= 2 && phase === "setup" && (
          <>
            <p className="page-subtitle">{MODE.description}</p>
            <GameSetup
              pool={pool} brands={brands} brandCounts={brandCounts}
              brandFilter={brandFilter} onBrandFilter={setBrandFilter}
              size={effectiveSize} onSize={setSize}
              showRatings={showRatings} onShowRatings={setShowRatings}
              ratedOnly={ratedOnly} onRatedOnly={setRatedOnly} ratedCount={ratedCount}
              sizeHint="Лучше степень двойки — иначе лишним достанется автопроход в следующий раунд."
              startLabel="Начать турнир" onStart={start}
              footer={last && (
                <div className="game-record">
                  <TrophyIcon size={14} /> Прошлый чемпион:{" "}
                  <Link to={`/drink/${last.drinkId}`}>{last.name}</Link> ({last.size} участников)
                </div>
              )}
            />
          </>
        )}

        {/* ── Пара текущего раунда ── */}
        {phase === "play" && pair && (
          <>
            <div className="game-bar">
              <span className="game-count">
                Раунд {roundNo} · {roundLabel(entrants.length)}
              </span>
              <span className="game-count">Пара {pairIdx + 1} из {pairs.length}</span>
              {passing.length > 0 && (
                <span className="game-count">Автопроход: {passing.length}</span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setPhase("setup")}>Прервать</button>
            </div>
            <div className="game-track">
              <span style={{ width: `${total ? (log.length / total) * 100 : 0}%` }} />
            </div>

            <Arena
              onPickFirst={() => pick(true)} onPickSecond={() => pick(false)}
              left={<Fighter key={`a-${pair[0].id}`} drink={pair[0]} tag={fighterTag(pair[0])}
                showRating={showRatings} side="first" onPick={() => pick(true)} />}
              right={<Fighter key={`b-${pair[1].id}`} drink={pair[1]} tag={fighterTag(pair[1])}
                showRating={showRatings} side="second" onPick={() => pick(false)} />}
            />

            <p className="game-hint">
              Проигравший вылетает из сетки. Когда пары раунда кончатся, победители сойдутся между собой.
            </p>
          </>
        )}

        {/* ── Итоги ── */}
        {phase === "over" && champion && (
          <div className="game-result">
            <div className="game-champion">
              <span className="game-tag"><TrophyIcon size={13} /> Чемпион</span>
              <DrinkArt drink={champion} className="game-art game-art-lg" />
              <span className="game-champion-name">{champion.name}</span>
              {champion.brand && <span className="drink-card-brand">{champion.brand}</span>}
              <span className="game-champion-sub">
                {roster.length} участников · {path.length} {winWord(path.length)}
              </span>
            </div>

            {finalist && (
              <div className="game-finalist">
                Финалист: <Link to={`/drink/${finalist.id}`}>{finalist.name}</Link>
              </div>
            )}

            {path.length > 0 && (
              <div className="game-standings">
                <div className="related-title">Путь чемпиона</div>
                {path.map((m, i) => (
                  <Link className="game-stand-row" to={`/drink/${m.loser.id}`} key={`${m.round}-${m.loser.id}`}>
                    <span className="game-stand-place">{i + 1}</span>
                    <span className="game-stand-name">{m.loser.name}</span>
                    <span className="game-stand-wins">{roundLabelAt(roster.length, m.round)}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="game-actions">
              <button className="btn btn-primary" onClick={start}>Ещё турнир</button>
              <Link className="btn btn-secondary" to={`/drink/${champion.id}`}>Карточка чемпиона</Link>
              <button className="btn btn-ghost" onClick={() => setPhase("setup")}>Изменить состав</button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
