import { Link } from "react-router-dom";

const TIERS = [
  { label: "S", min: 9, color: "#ff3b30" },
  { label: "A", min: 7, color: "#ff8a3d" },
  { label: "B", min: 5, color: "#ffb02e" },
  { label: "C", min: 3, color: "#7aa3ff" },
  { label: "D", min: 1, color: "#8a8aa0" },
];

function tierFor(rating) {
  return TIERS.find((t) => rating >= t.min) || TIERS[TIERS.length - 1];
}

/** Тир-лист энергетиков на основе оценок пользователя. */
export default function TierList({ reviews }) {
  if (!reviews || reviews.length === 0) {
    return <div className="tier-empty">Тир-лист появится после первых оценок.</div>;
  }

  const grouped = {};
  reviews.forEach((r) => {
    const t = tierFor(r.rating).label;
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(r);
  });
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => b.rating - a.rating));

  return (
    <div className="tier-list">
      {TIERS.map((tier) => (
        <div className="tier-row" key={tier.label}>
          <div className="tier-label" style={{ background: tier.color }}>{tier.label}</div>
          <div className="tier-items">
            {(grouped[tier.label] || []).length === 0 ? (
              <span className="tier-empty">—</span>
            ) : (
              grouped[tier.label].map((r) => (
                <Link className="tier-item" to={`/drink/${r.drinkId}`} key={r.id}>
                  {r.drinkName} <strong style={{ color: tier.color }}>{r.rating}</strong>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
