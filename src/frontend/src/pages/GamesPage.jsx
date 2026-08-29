import { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { GamepadIcon } from "../components/icons";
import { GAME_MODES } from "../games/modes";

/**
 * Хаб мини-игр: карточки режимов из GAME_MODES. Новый режим добавляется туда
 * и появляется здесь сам.
 */
export default function GamesPage() {
  useEffect(() => { document.title = "Мини-игры — AdRush"; }, []);

  return (
    <>
      <Navbar />
      <div className="page">
        <div className="page-head" style={{ marginBottom: 6 }}>
          <h1 className="page-title"><GamepadIcon size={24} /> Мини-игры</h1>
        </div>
        <p className="page-subtitle">
          Сравниваем энергетики вслепую: никакой статистики - только вы и две банки.
        </p>

        <div className="games-grid">
          {GAME_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <Link className="game-mode" to={mode.path} key={mode.id}>
                <span className="game-mode-icon"><Icon size={26} /></span>
                <span className="game-mode-body">
                  <span className="game-mode-head">
                    <span className="game-mode-title">{mode.title}</span>
                  </span>
                  <span className="game-mode-desc">{mode.description}</span>
                  <span className="game-mode-go">Играть →</span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      <Footer />
    </>
  );
}
