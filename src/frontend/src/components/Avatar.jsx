import { mediaUrl } from "../services/api";

export default function Avatar({ url, name, size = 40 }) {
  const src = mediaUrl(url);
  const initial = (name || "?").trim().charAt(0) || "?";

  if (src) {
    return (
      <img
        className="avatar"
        src={src}
        alt={name || "avatar"}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="avatar-fallback"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
