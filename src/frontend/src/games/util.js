/** Общие мелочи мини-игр: перемешивание состава, сетка раундов, рекорды. */

/** Перемешивание Фишера — Йетса. Работает с копией: исходный список каталога не трогаем. */
export function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function winWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "победа";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "победы";
  return "побед";
}

/** Ближайшая степень двойки не меньше n — размер полной турнирной сетки. */
export function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Название раунда по числу участников в нём. Считается по размеру полной сетки: при 103
 * участниках первый раунд честнее назвать «1/64 финала», чем «1/51,5».
 */
export function roundLabel(count) {
  const c = nextPow2(count);
  if (c <= 2) return "Финал";
  if (c === 4) return "Полуфинал";
  if (c === 8) return "Четвертьфинал";
  return `1/${c / 2} финала`;
}

/* Итоги забегов держим в localStorage: ради одной строчки на игрока заводить таблицу рано. */

export function loadRecord(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveRecord(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
}

/** Название раунда №round в турнире на total участников (1 — самый первый). */
export function roundLabelAt(total, round) {
  return roundLabel(nextPow2(total) / 2 ** (round - 1));
}
