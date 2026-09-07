import { useState } from "react";
import { useTheme } from "../ThemeContext";
import FlowBackground from "./FlowBackground";

/**
 * Задний фон сайта. Стиль выбирает пользователь в «Оформлении»:
 * сетка (CSS), контуры (WebGL-шейдер) или ничего. Если шейдер не запустился —
 * бесшумно откатываемся на сетку.
 */
export default function SiteBackground() {
  const { activeBgStyle } = useTheme();
  const [flowFailed, setFlowFailed] = useState(false);
  const style = activeBgStyle === "flow" && flowFailed ? "grid" : activeBgStyle;

  return (
    <>
      {style === "grid" && <div className="bg-grid" aria-hidden="true" />}
      {style === "flow" && <FlowBackground onFail={() => setFlowFailed(true)} />}
      {/* Поверх контуров угловое свечение только мешает — они и так светятся. */}
      {style !== "flow" && <div className="corner-glow" aria-hidden="true" />}
    </>
  );
}
