package com.adrenrush.web.service;

import org.springframework.stereotype.Component;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Опознание вкуса напитка по названию — «отпечаток», по которому две записи из разных источников
 * узнаются как один и тот же напиток.
 *
 * Зачем: у одного напитка на каждом сайте своё написание — «Java Monster Café Latte» и
 * «Монстр Java Cafe Latte», «Monster Ultra Rosá» и «Monster Energy Ultra Rosa». Поэтому из названия
 * выкидывается всё, что вкус не определяет (бренд, объём, страна, тара, пометка про сахар,
 * диакритика, скобочная транслитерация), а оставшиеся слова сортируются: порядок слов у магазинов
 * тоже не устоялся («Ultra Zero» и «Zero Ultra»).
 *
 * Отпечаток не всесилен: синонимичные названия одного продукта («Ultra White» и «Ultra Zero») он
 * связать не может, поэтому окончательное решение принимает администратор в окне приёмки — там
 * похожие позиции только помечаются подсказкой.
 */
@Component
public class FlavorKeys {

    /** Объём порции: «473мл», «500 мл». UNICODE_CHARACTER_CLASS — иначе \b после «мл» не срабатывает. */
    private static final Pattern VOLUME = Pattern.compile(
        "(\\d{2,4})\\s*(?:мл|ml)\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    /** Скобочная вставка — обычно русская транслитерация латинского названия. */
    private static final Pattern PARENTHESES = Pattern.compile("\\([^)]*\\)");
    /** Диакритические знаки, остающиеся после разложения по Unicode NFD: Café → Cafe. */
    private static final Pattern DIACRITICS = Pattern.compile("\\p{Mn}+");
    private static final Pattern NON_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

    /** Страны-изготовители: на вкус не влияют, но в названиях магазинов встречаются постоянно. */
    public static final Set<String> COUNTRY_WORDS = Set.of(
        "сша", "америка", "американский", "китай", "япония", "турция", "европа", "ирландия",
        "корея", "тайланд", "вьетнам", "польша", "нидерланды", "германия", "англия",
        "usa", "china", "japan", "europe");

    /**
     * Слова, не участвующие в опознании вкуса: бренды-источники, страны, тара и пометка «без
     * сахара». Слово {@code zero} намеренно НЕ здесь — «Original» и «Original Zero Sugar» это
     * разные напитки.
     */
    private static final Set<String> STOP_WORDS = Set.of(
        "monster", "monsters", "energy", "drink", "монстер", "монстр", "монстра", "монстеры",
        "энерджи", "adrenaline", "rush", "адреналин", "раш", "red", "bull", "redbull",
        "без", "сахара", "sugar", "стекло", "банка", "пэт", "шт");

    /**
     * Отпечаток вкуса: набор значимых слов в алфавитном порядке. Пустая строка — если значимых слов
     * не осталось (например, название состояло только из бренда).
     */
    public String flavorKey(String name) {
        if (name == null || name.isBlank()) return "";
        String s = PARENTHESES.matcher(name.toLowerCase(Locale.ROOT)).replaceAll(" ");
        s = VOLUME.matcher(s).replaceAll(" ");
        s = DIACRITICS.matcher(Normalizer.normalize(s, Normalizer.Form.NFD)).replaceAll("");
        Set<String> tokens = new TreeSet<>();
        for (String token : NON_WORD.split(s)) {
            if (token.isBlank() || STOP_WORDS.contains(token) || COUNTRY_WORDS.contains(token)) continue;
            tokens.add(token);
        }
        return String.join(" ", tokens);
    }

    /** Ключ сопоставления с брендом: вкусы разных марок («Original» у Monster и Red Bull) не путаем. */
    public String matchKey(String brand, String name) {
        String brandPart = brand == null ? "" : brand.trim().toLowerCase(Locale.ROOT);
        return brandPart + "|" + flavorKey(name);
    }

    /** Объём порции из названия в мл; 0 — если не указан. */
    public int volumeOf(String name) {
        if (name == null) return 0;
        var m = VOLUME.matcher(name);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    /** Есть ли в названии страна-изготовитель («… 473мл Америка»). */
    public boolean mentionsCountry(String name) {
        if (name == null) return false;
        for (String token : NON_WORD.split(name.toLowerCase(Locale.ROOT))) {
            if (COUNTRY_WORDS.contains(token)) return true;
        }
        return false;
    }
}
