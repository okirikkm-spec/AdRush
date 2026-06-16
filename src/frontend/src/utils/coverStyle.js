/**
 * Inline-стиль для обложки энергетика с учётом админских настроек кадрирования.
 * @param fit "cover" | "contain" (по умолчанию contain — видно всю банку)
 * @param pos object-position, например "50% 30%" (по умолчанию центр)
 */
export function coverStyle(fit, pos) {
  const f = fit === "cover" ? "cover" : "contain";
  return {
    objectFit: f,
    objectPosition: pos || "center",
    // в режиме «Заполнить» убираем отступы, чтобы изображение заполняло плашку целиком
    padding: f === "cover" ? 0 : undefined,
  };
}

/** Левый/верхний процент из строки object-position "NN% NN%" (для маркера фокуса). */
export const posX = (pos) => (pos ? pos.split(" ")[0] : "50%");
export const posY = (pos) => (pos ? pos.split(" ")[1] : "50%");
