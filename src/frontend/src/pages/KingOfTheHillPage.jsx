import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { CrownIcon, TrophyIcon } from "../components/icons";
import { mediaUrl } from "../services/api";
import { Arena, DrinkArt, Fighter } from "../games/Duel";
import GameSetup from "../games/GameSetup";
import { useGameCatalog } from "../games/useGameCatalog";
import { loadRecord, saveRecord, shuffle, winWord } from "../games/util";
import { findMode } from "../games/modes";

const MODE = findMode("king");
const RECORD_KEY = "ar-game-king-record";

export default function KingOfTheHillPage() {
  // setup — выбор состава, play — поединки, over — итоги забега
  const [phase, setPhase] = useState("setup");
  const [size, setSize] = useState(16);
  const [brandFilter, setBrandFilter] = useState(null);
  // оценки по умолчанию скрыты: увидев «9.1 против 6.4», выбираешь уже не вкус, а цифру
  const [showRatings, setShowRatings] = useState(false);
  // состав можно собрать только из банок, которые игрок оценил сам
  const [mineOnly, setMineOnly] = useState(false);

  const { drinks, loading, error, brands, brandCounts, pool, myRatedCount, canFilterMine } =
    useGameCatalog(brandFilter, mineOnly);

  const [roster, setRoster] = useState([]);   // весь состав забега
  const [queue, setQueue] = useState([]);     // очередь претендентов
  const [king, setKing] = useState(null);
  const [challenger, setChallenger] = useState(null);
  const [wins, setWins] = useState({});       // id → сколько поединков выиграл
  const [streak, setStreak] = useState(0);    // текущая серия царя
  const [best, setBest] = useState({ streak: 0, drink: null }); // лучшая серия забега
  const [record, setRecord] = useState(null); // рекорд из localStorage

  useEffect(() => {
    document.title = MODE.title + " — AdRush";
    setRecord(loadRecord(RECORD_KEY));
  }, []);

  // выбранный размер может не пережить смену фильтра — тогда играем всем, что осталось
  const effectiveSize = size > 0 && size <= pool.length ? size : 0;

  const start = useCallback(() => {
    const picked = shuffle(pool).slice(0, effectiveSize > 0 ? effectiveSize : pool.length);
    if (picked.length < 2) return;
    setRoster(picked);
    setKing(picked[0]);
    setChallenger(picked[1]);
    setQueue(picked.slice(2));
    setWins({});
    setStreak(0);
    setBest({ streak: 0, drink: null });
    setPhase("play");
  }, [pool, effectiveSize]);

  /** Выбор победителя поединка: он остаётся царём, справа встаёт следующий из очереди. */
  const pick = useCallback((kingWon) => {
    if (phase !== "play" || !king || !challenger) return;
    const winner = kingWon ? king : challenger;
    const nextStreak = kingWon ? streak + 1 : 1;
    const nextBest = nextStreak > best.streak ? { streak: nextStreak, drink: winner } : best;

    setWins((w) => ({ ...w, [winner.id]: (w[winner.id] || 0) + 1 }));
    setStreak(nextStreak);
    setBest(nextBest);
    setKing(winner);

    if (queue.length > 0) {
      setChallenger(queue[0]);
      setQueue((q) => q.slice(1));
      return;
    }
    // претенденты кончились — забег окончен
    setChallenger(null);
    setPhase("over");
    if (nextBest.streak > (record?.streak || 0)) {
      const fresh = { streak: nextBest.streak, drinkId: nextBest.drink.id, name: nextBest.drink.name };
      setRecord(fresh);
      saveRecord(RECORD_KEY, fresh);
    }
  }, [phase, king, challenger, queue, streak, best, record]);

  // стрелки на клавиатуре: подряд идущие поединки быстрее щёлкать с клавиш, чем мышью
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

  const total = Math.max(roster.length - 1, 0);
  const done = total - queue.length - (challenger ? 1 : 0);

  const standings = useMemo(
    () => roster
      .map((d) => ({ drink: d, count: wins[d.id] || 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.drink.name.localeCompare(b.drink.name, "ru"))
      .slice(0, 8),
    [roster, wins]
  );

  return (
    <>
      <Navbar />
      <div className="page page-wide">
        <div className="page-head" style={{ marginBottom: 6 }}>
          <h1 className="page-title"><CrownIcon size={24} /> {MODE.title}</h1>
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
              mineOnly={mineOnly} onMineOnly={setMineOnly}
              canMineOnly={canFilterMine} myRatedCount={myRatedCount}
              sizeHint="Банки берутся из каталога случайно — каждый забег новый."
              startLabel="Начать забег" onStart={start}
              footer={record && (
                <div className="game-record">
                  <TrophyIcon size={14} /> Рекорд серии: {record.streak} {winWord(record.streak)} подряд —{" "}
                  <Link to={`/drink/${record.drinkId}`}>{record.name}</Link>
                </div>
              )}
            />
          </>
        )}

        {/* ── Поединок ── */}
        {phase === "play" && king && challenger && (
          <>
            <div className="game-bar">
              <span className="game-count">Поединок {done + 1} из {total}</span>
              {streak > 0 && (
                <span className="game-count">
                  Серия царя: {streak} {winWord(streak)}
                  {best.streak > streak ? ` · лучшая за забег: ${best.streak}` : ""}
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setPhase("setup")}>Прервать</button>
            </div>
            <div className="game-track">
              <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>

            <Arena
              onPickFirst={() => pick(true)} onPickSecond={() => pick(false)}
              left={<Fighter key={`k-${king.id}`} drink={king} crowned showRating={showRatings} side="first"
                tag={<><CrownIcon size={13} /> {streak > 0 ? `Царь · ${streak} ${winWord(streak)}` : "На горе"}</>}
                onPick={() => pick(true)} />}
              right={<Fighter key={`c-${challenger.id}`} drink={challenger} tag="Претендент"
                showRating={showRatings} side="second" onPick={() => pick(false)} />}
            />

            <p className="game-hint">
              Нажмите на банку, которая нравится больше, — она останется на горе и встретит следующего.
            </p>
          </>
        )}

        {/* ── Итоги ── */}
        {phase === "over" && king && (
          <div className="game-result">
            <div className="game-champion">
              <span className="game-tag"><CrownIcon size={13} /> Царь горы</span>
              <DrinkArt drink={king} className="game-art game-art-lg" />
              <span className="game-champion-name">{king.name}</span>
              {king.brand && <span className="drink-card-brand">{king.brand}</span>}
              <span className="game-champion-sub">
                {wins[king.id] || 0} {winWord(wins[king.id] || 0)} из {total} · серия {streak}
              </span>
            </div>

            {standings.length > 0 && (
              <div className="game-standings">
                <div className="related-title">Кто сколько выиграл</div>
                {standings.map(({ drink, count }, i) => (
                  <Link className="game-stand-row" to={`/drink/${drink.id}`} key={drink.id}>
                    <span className="game-stand-place">{i + 1}</span>
                    {mediaUrl(drink.coverUrl)
                      ? <img className="game-stand-img" src={mediaUrl(drink.coverUrl)} alt="" loading="lazy" />
                      : <span className="game-stand-img" />}
                    <span className="game-stand-name">{drink.name}</span>
                    <span className="game-stand-wins">{count} {winWord(count)}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="game-actions">
              <button className="btn btn-primary" onClick={start}>Ещё забег</button>
              <Link className="btn btn-secondary" to={`/drink/${king.id}`}>Карточка чемпиона</Link>
              <button className="btn btn-ghost" onClick={() => setPhase("setup")}>Изменить состав</button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </>
  );
}
