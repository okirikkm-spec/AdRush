/**
 * Характеристики банки: объём, кофеин, сахар, калорийность. На банках в РФ пишут «на 100 мл»,
 * так и храним — а «на банку» считается из объёма, чтобы два числа не разошлись между собой.
 */

/** Число без хвостовых нулей: 32.0 → «32», 11.5 → «11,5» (десятичная запятая — как на этикетке). */
const num = (value, digits = 1) => {
  if (value == null) return null;
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return String(rounded).replace(".", ",");
};

/** Кофеин на всю банку, мг — считается, только если известны и концентрация, и объём. */
export const caffeinePerCan = (drink) =>
  drink?.caffeinePer100Ml != null && drink?.volumeMl != null
    ? (drink.caffeinePer100Ml * drink.volumeMl) / 100
    : null;

/** Сахар на всю банку, г. */
export const sugarPerCan = (drink) =>
  drink?.sugarPer100Ml != null && drink?.volumeMl != null
    ? (drink.sugarPer100Ml * drink.volumeMl) / 100
    : null;

/** Заполнена ли у карточки хоть одна характеристика. */
export const hasSpecs = (drink) =>
  drink != null &&
  [drink.volumeMl, drink.caffeinePer100Ml, drink.sugarPer100Ml, drink.kcalPer100Ml,
    drink.ingredients, drink.country].some((v) => v != null && v !== "");

/**
 * Короткая строка для карточки в списке — то, по чему энергетики и выбирают:
 * «449 мл · 32 мг/100 мл · без сахара». Пустые поля пропускаются, всё пусто → null.
 */
export function specSummary(drink) {
  if (!drink) return null;
  const parts = [];
  if (drink.volumeMl != null) parts.push(`${drink.volumeMl} мл`);
  if (drink.caffeinePer100Ml != null) parts.push(`${num(drink.caffeinePer100Ml)} мг кофеина/100 мл`);
  if (drink.sugarPer100Ml != null) {
    parts.push(drink.sugarPer100Ml === 0 ? "без сахара" : `${num(drink.sugarPer100Ml)} г сахара/100 мл`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Полный набор строк для страницы напитка: пары «подпись → значение». Там, где известен объём,
 * рядом с концентрацией показывается пересчёт на банку — именно это число человек и сравнивает.
 */
export function specRows(drink) {
  if (!drink) return [];
  const rows = [];
  if (drink.volumeMl != null) rows.push({ label: "Объём", value: `${drink.volumeMl} мл` });

  if (drink.caffeinePer100Ml != null) {
    const perCan = caffeinePerCan(drink);
    rows.push({
      label: "Кофеин",
      value: `${num(drink.caffeinePer100Ml)} мг/100 мл`,
      hint: perCan != null ? `${num(perCan, 0)} мг на банку` : null,
    });
  }
  if (drink.sugarPer100Ml != null) {
    const perCan = sugarPerCan(drink);
    rows.push({
      label: "Сахар",
      value: drink.sugarPer100Ml === 0 ? "нет" : `${num(drink.sugarPer100Ml)} г/100 мл`,
      hint: perCan ? `${num(perCan)} г на банку` : null,
    });
  }
  if (drink.kcalPer100Ml != null) {
    const perCan = drink.volumeMl != null ? (drink.kcalPer100Ml * drink.volumeMl) / 100 : null;
    rows.push({
      label: "Калорийность",
      value: `${num(drink.kcalPer100Ml)} ккал/100 мл`,
      hint: perCan != null ? `${num(perCan, 0)} ккал на банку` : null,
    });
  }
  if (drink.country) rows.push({ label: "Страна", value: drink.country });
  return rows;
}
