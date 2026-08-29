import { Link } from "react-router-dom";
import { BoltIcon } from "./icons";

/**
 * Подвал сайта. Кроме навигации объясняет, как считается рейтинг: на карточке видно только
 * средний балл, и без пояснения непонятно, почему напиток с «8.5» стоит ниже напитка с «7.8».
 *
 * Ссылок на почту, правила и соцсети здесь намеренно нет — их некуда вести, пока страниц и
 * аккаунтов не существует; выдуманный контакт хуже отсутствующего.
 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-logo"><BoltIcon size={18} /> AdRush</span>
          <p className="site-footer-tagline">
            Народный рейтинг энергетиков: оценки и отзывы ставят пользователи, а не редакция.
          </p>
        </div>

        <nav className="site-footer-nav">
          <span className="site-footer-nav-title">Разделы</span>
          <Link to="/">Рейтинг</Link>
          <Link to="/games">Мини-игры</Link>
          <Link to="/profile">Профиль</Link>
          <Link to="/chats">Чаты</Link>
        </nav>

        <div className="site-footer-about">
          <span className="site-footer-nav-title">Как считается место</span>
          <p>
            Средний балл берётся с поправкой на число оценок: пока их мало, рейтинг притянут к
            среднему по сайту. Поэтому один отзыв на «десятку» не выносит банку в топ, а десять
            честных оценок — выносят.
          </p>
        </div>
      </div>
      <div className="site-footer-bottom">© {year} AdRush</div>
    </footer>
  );
}
