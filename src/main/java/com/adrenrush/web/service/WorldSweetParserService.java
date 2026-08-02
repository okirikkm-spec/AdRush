package com.adrenrush.web.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.jsoup.Jsoup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Парсер каталога Monster магазина worldsweet.ru — пришёл на смену ручному парсеру
 * monsterenergy.com (тот сайт за Cloudflare отдаёт серверу 403 и требовал загрузки HTML руками).
 * По умолчанию разбирает раздел {@code /napitki/energeticheskie/monster-2/} вместе со всеми его
 * подкатегориями (Европа и Турция, США, Китай, Япония).
 *
 * Ходит не по HTML каталога (9 страниц пагинации плюс отдельная страница на каждый товар ради
 * описания), а по публичному JSON того же сайта — WooCommerce Store API:
 * <ul>
 *   <li>{@code /wp-json/wc/store/v1/products/categories} — всё дерево категорий; бренд товара это
 *       категория-потомок раздела каталога (например «Monster США» → «Monster»);</li>
 *   <li>{@code /wp-json/wc/store/v1/products?category=ID} — товары раздела ВМЕСТЕ с подкатегориями,
 *       по 100 штук за запрос, сразу с описанием и полноразмерной картинкой.</li>
 * </ul>
 * Итого ~2 запроса вместо ~90 и полные данные без открытия карточек товаров. Сайт обычный
 * WordPress за nginx, без Cloudflare/Akamai — обходов ботозащиты (как у Monster и Red Bull) не нужно.
 *
 * Раздел задаётся ссылкой на страницу каталога в конфиге ({@code worldsweet.parser.url}): парсер
 * берёт из неё slug последнего сегмента и находит по нему id категории. Поэтому источник можно
 * расширить до всех энергетиков магазина (…/napitki/energeticheskie/) — код от бренда не зависит.
 *
 * Названия в магазине оптовые («[M]Энерг. напиток Monster Ultra … 473мл (24)»), поэтому перед
 * сохранением чистятся: маркер поставки, слова «энергетический напиток», количество в упаковке и
 * дата поставки убираются, вкус/объём/страна остаются (см. {@link #cleanName}).
 *
 * Один и тот же вкус магазин продаёт в разных объёмах и странах-изготовителях («Original 330мл
 * КИТАЙ» и «Original 500 мл»); в каталог рейтинга такие позиции должны попасть один раз, поэтому
 * они схлопываются — см. {@link #dropVolumeDuplicates}. По той же причине перед записью каждый
 * вкус сверяется с уже существующими карточками ({@link #indexExisting}): напиток мог попасть в
 * базу с другого сайта, и дедупликация по {@code sourceUrl} такую пару не поймает.
 */
@Service
@RequiredArgsConstructor
public class WorldSweetParserService implements CatalogParser {

    private static final Logger log = LoggerFactory.getLogger(WorldSweetParserService.class);
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    /** Метка источника в списке парсеров админки (сайт-источник, а не бренд каталога). */
    public static final String SOURCE = "Monster (WorldSweet)";

    /** Сколько товаров запрашиваем за раз — предел Store API. */
    private static final int PAGE_SIZE = 100;
    /** Страховка от бесконечного цикла, если сайт вдруг перестанет уменьшать выдачу. */
    private static final int MAX_PAGES = 20;

    /** Служебный маркер поставки в начале названия: «[M]Энерг. напиток …». */
    private static final Pattern MARKER = Pattern.compile("^\\s*\\[[^\\]]{1,4}]\\s*");
    /**
     * Родовое начало названия: «Энергетический/Газированный напиток», «Энерг. напиток», «Энергетик».
     * UNICODE_CHARACTER_CLASS обязателен: без него {@code \b} после кириллицы не срабатывает
     * (по умолчанию границу слова Java считает по ASCII-{@code \w}), и префикс не отрезается.
     */
    private static final Pattern GENERIC_PREFIX = Pattern.compile(
        "^(?:(?:энергетическ|газированн|безалкогольн)\\p{L}*\\s+напиток"
            + "|энерг\\.?\\s*напиток"
            + "|напиток\\s+энергетическ\\p{L}*"
            + "|энергетик)\\b\\s*",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    /** Количество банок в упаковке: «(12)», «(24 шт.)», «(5х10)». */
    private static final Pattern PACK_SIZE = Pattern.compile(
        "\\(\\s*\\d+\\s*(?:[xх*]\\s*\\d+\\s*)?(?:шт\\.?)?\\s*\\)", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    /** Дата поставки в хвосте названия: «… 350 мл (12) 15.06.24». */
    private static final Pattern SUPPLY_DATE = Pattern.compile("\\b\\d{2}\\.\\d{2}\\.\\d{2,4}\\b");
    /** Объём в конце названия бренда-категории: «Arizona 444мл» → «Arizona». */
    private static final Pattern BRAND_VOLUME = Pattern.compile(
        "\\s+\\d+\\s*(?:мл|ml|л|l)\\.?$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);
    /**
     * Объём порции в названии товара: «Ultra Vice Guava 473мл Америка» → 473.
     * UNICODE_CHARACTER_CLASS — как и в {@link #GENERIC_PREFIX}: иначе {@code \b} после «мл»
     * не находит границу слова и объём не распознаётся вообще.
     */
    private static final Pattern SERVING_VOLUME = Pattern.compile(
        "(\\d{2,4})\\s*(?:мл|ml)\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    /**
     * «Банка-переросток»: если тот же вкус есть в другом объёме, 710 мл не берём (решение владельца
     * каталога). Единственный вариант вкуса на 710 мл при этом сохраняется — иначе вкус пропал бы.
     */
    private static final int OVERSIZED_ML = 710;

    /** Страны-изготовители как регулярка — чтобы вырезать их из названия карточки. */
    private static final Pattern COUNTRY_IN_NAME = Pattern.compile(
        "\\b(?:" + String.join("|", FlavorKeys.COUNTRY_WORDS) + ")\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    /**
     * Магазинная пометка «БЕЗ САХАРА» в хвосте названия. В карточку не идёт: у большинства позиций
     * она дублирует Zero/Ultra в самом названии продукта, а капслоком выглядит как часть имени.
     */
    private static final Pattern ZERO_SUGAR_LABEL = Pattern.compile(
        "\\bбез\\s+сахара\\b",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);

    private final ObjectMapper objectMapper;
    private final FlavorKeys flavorKeys;

    @Value("${worldsweet.parser.url}")
    private String catalogUrl;

    @Value("${worldsweet.parser.enabled:true}")
    private boolean enabled;

    /**
     * Бренд для всех карточек источника. Задан явно, потому что ссылка ведёт в категорию одного
     * бренда: внутри неё категории — это страны-изготовители («Monster США», «Япония»), и вывод
     * бренда по дереву дал бы их вместо «Monster». Пустое значение — определять по категории
     * (нужно, если источник расширят до всего раздела энергетиков), см. {@link #brandOf}.
     */
    @Value("${worldsweet.parser.brand:Monster}")
    private String brand;

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Обходит все товары раздела каталога и схлопывает один вкус в разных объёмах. Ничего не пишет
     * в базу: найденное уходит в приёмку, где решение принимает администратор.
     */
    @Override
    public List<ParsedItem> collect() {
        try {
            String origin = origin(catalogUrl);
            String slug = lastSegment(catalogUrl);

            Map<Long, Category> categories = fetchCategories(origin);
            Category root = findBySlug(categories, slug);
            if (root == null) {
                log.warn("WorldSweet-парсер: категория «{}» не найдена в каталоге {} — проверьте worldsweet.parser.url",
                    slug, origin);
                return List.of();
            }

            List<Candidate> candidates = collectCandidates(origin, root, categories);
            if (candidates.isEmpty()) {
                log.warn("WorldSweet-парсер: в категории «{}» не найдено ни одного товара. "
                    + "Store API мог быть отключён на сайте либо категория опустела.", root.name());
                return List.of();
            }
            List<Candidate> chosen = dropVolumeDuplicates(candidates);
            log.info("WorldSweet-парсер: найдено позиций {} (товаров в каталоге: {}, схлопнуто дублей по объёму: {})",
                chosen.size(), candidates.size(), candidates.size() - chosen.size());

            return chosen.stream()
                // объём уже посчитан для схлопывания дублей — заодно сохраняем его в карточку
                .map(c -> new ParsedItem(c.name(), c.description(), c.brand(), c.imageUrl(), c.sourceUrl(), SOURCE,
                    c.volumeMl() > 0 ? c.volumeMl() : null))
                .toList();
        } catch (Exception e) {
            log.warn("WorldSweet-парсер: ошибка обхода {}: {}", catalogUrl, e.getMessage());
            return List.of();
        }
    }

    /** Категория магазина: нужны id, имя (оно же бренд) и родитель — для подъёма по дереву. */
    private record Category(long id, String name, String slug, long parent) {}

    /**
     * Разобранный товар до отбора: {@code flavorKey} опознаёт вкус (без объёма, страны и бренда),
     * {@code volumeMl} и {@code fromCountry} нужны, чтобы выбрать лучший вариант среди одинаковых.
     */
    private record Candidate(String name, String description, String brand, String imageUrl,
                             String sourceUrl, String flavorKey, int volumeMl, boolean fromCountry) {}

    /** Постранично забирает товары раздела и превращает их в кандидатов (без записи в БД). */
    private List<Candidate> collectCandidates(String origin, Category root, Map<Long, Category> categories)
            throws IOException {
        List<Candidate> candidates = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (int page = 1; page <= MAX_PAGES; page++) {
            JsonNode products = fetchJson(origin + "/wp-json/wc/store/v1/products"
                + "?category=" + root.id() + "&per_page=" + PAGE_SIZE + "&page=" + page);
            if (!products.isArray() || products.isEmpty()) break;

            for (JsonNode product : products) {
                String sourceUrl = product.path("permalink").asText("");
                if (sourceUrl.isBlank() || !seen.add(sourceUrl)) continue;

                // из магазинного названия сначала выкидываем оптовый мусор (объём и страна пока
                // нужны — по ним выбирается вариант при схлопывании), и только потом их самих
                String shopName = cleanName(product.path("name").asText(""));
                String name = stripVolumeAndCountry(shopName);
                String imageUrl = firstImage(product);
                if (name.isBlank() || imageUrl == null) continue;

                candidates.add(new Candidate(
                    name,
                    cleanDescription(product, name),
                    brand != null && !brand.isBlank() ? brand.trim() : brandOf(product, categories, root.id()),
                    imageUrl,
                    sourceUrl,
                    flavorKeys.flavorKey(shopName),
                    flavorKeys.volumeOf(shopName),
                    flavorKeys.mentionsCountry(shopName)));
            }

            if (products.size() < PAGE_SIZE) break;
        }
        return candidates;
    }

    /**
     * Схлопывает позиции одного вкуса, отличающиеся только объёмом и страной-изготовителем
     * («Original 330мл КИТАЙ» + «Original 500 мл» → одна карточка): в каталоге рейтинга такой
     * напиток должен быть один. Победитель выбирается в {@link #prefers}.
     */
    private List<Candidate> dropVolumeDuplicates(List<Candidate> candidates) {
        Map<String, Candidate> best = new LinkedHashMap<>();
        for (Candidate c : candidates) {
            String key = c.brand() + "|" + c.flavorKey();
            Candidate current = best.get(key);
            if (current == null) {
                best.put(key, c);
            } else if (prefers(c, current)) {
                log.debug("WorldSweet-парсер: '{}' вытесняет дубль '{}'", c.name(), current.name());
                best.put(key, c);
            } else {
                log.debug("WorldSweet-парсер: дубль по объёму пропущен — '{}' (оставлен '{}')",
                    c.name(), current.name());
            }
        }
        return new ArrayList<>(best.values());
    }

    /**
     * Кто из двух вариантов одного вкуса попадёт в каталог: 710 мл проигрывает любому другому
     * объёму, дальше выигрывает больший объём, при равенстве — название без страны-изготовителя
     * («Pipeline Punch 500 мл» вместо «Pipeline Punch 500мл ЯПОНИЯ»).
     */
    private boolean prefers(Candidate candidate, Candidate current) {
        boolean candidateOversized = candidate.volumeMl() >= OVERSIZED_ML;
        boolean currentOversized = current.volumeMl() >= OVERSIZED_ML;
        if (candidateOversized != currentOversized) return currentOversized;
        if (candidate.volumeMl() != current.volumeMl()) return candidate.volumeMl() > current.volumeMl();
        return current.fromCountry() && !candidate.fromCountry();
    }

    /**
     * Всё дерево категорий магазина одним запросом. Store API отдаёт список целиком (постраничность
     * включается только явным per_page), поэтому карту строим за один заход.
     */
    private Map<Long, Category> fetchCategories(String origin) throws IOException {
        JsonNode arr = fetchJson(origin + "/wp-json/wc/store/v1/products/categories");
        Map<Long, Category> map = new LinkedHashMap<>();
        for (JsonNode c : arr) {
            long id = c.path("id").asLong();
            if (id == 0) continue;
            map.put(id, new Category(
                id,
                unescape(c.path("name").asText("")),
                decode(c.path("slug").asText("")),
                c.path("parent").asLong()));
        }
        return map;
    }

    /** Категория по slug из ссылки на страницу каталога (у кириллических slug'ов оба конца декодированы). */
    private Category findBySlug(Map<Long, Category> categories, String slug) {
        for (Category c : categories.values()) {
            if (c.slug().equalsIgnoreCase(slug)) return c;
        }
        return null;
    }

    /**
     * Бренд товара — категория, лежащая непосредственно в разделе каталога: у товара проставлена
     * листовая категория («Monster США»), поэтому поднимаемся по родителям до потомка раздела
     * ({@code rootId}) и берём его имя («Monster»). Если цепочка до раздела не доходит (товар лежит
     * ещё и в чужой ветке), берём имя самой категории товара.
     */
    private String brandOf(JsonNode product, Map<Long, Category> categories, long rootId) {
        String fallback = null;
        for (JsonNode ref : product.path("categories")) {
            Category node = categories.get(ref.path("id").asLong());
            if (node == null) continue;
            if (fallback == null) fallback = node.name();

            Set<Long> visited = new HashSet<>();
            while (node != null && node.parent() != rootId && visited.add(node.id())) {
                node = categories.get(node.parent());
            }
            if (node != null && node.parent() == rootId) return cleanBrand(node.name());
        }
        return fallback != null ? cleanBrand(fallback) : null;
    }

    /**
     * Убирает из названия оптовые пометки: объём, страну-изготовителя и «БЕЗ САХАРА»
     * («Monster Energy Ultra Paradise 500 мл БЕЗ САХАРА» → «Monster Energy Ultra Paradise»). В
     * карточке каталога они не нужны — она одна на вкус, а какого объёма банку человек пил, к
     * оценке отношения не имеет. Вызывать только после {@link #cleanName} и после того, как объём
     * уже считан для выбора варианта.
     */
    private String stripVolumeAndCountry(String name) {
        String s = SERVING_VOLUME.matcher(name).replaceAll(" ");
        s = COUNTRY_IN_NAME.matcher(s).replaceAll(" ");
        s = ZERO_SUGAR_LABEL.matcher(s).replaceAll(" ");
        return trimPunctuation(normalize(s));
    }

    /**
     * Оптовое название магазина → название карточки: убираем служебный маркер поставки, родовое
     * «энергетический напиток», количество в упаковке и дату поставки. Объём и страна на этом шаге
     * ещё нужны (по ним выбирается вариант в {@link #prefers}), их снимает
     * {@link #stripVolumeAndCountry}.
     */
    private String cleanName(String raw) {
        String s = unescape(raw);
        s = MARKER.matcher(s).replaceFirst("");
        s = GENERIC_PREFIX.matcher(s).replaceFirst("");
        s = PACK_SIZE.matcher(s).replaceAll(" ");
        s = SUPPLY_DATE.matcher(s).replaceAll(" ");
        s = s.replace("«", "").replace("»", "");
        return trimPunctuation(normalize(s));
    }

    /** Название бренда-категории без хвостового объёма: «Arizona 444мл» и «Arizona» — один бренд. */
    private String cleanBrand(String raw) {
        String s = normalize(raw);
        return trimPunctuation(BRAND_VOLUME.matcher(s).replaceFirst(""));
    }

    /**
     * Описание товара из JSON (приходит HTML-разметкой). В магазине оно либо пустое, либо повторяет
     * название другими словами («Энергетический напиток Монстер MIXXD Пунш 500 мл (12)») — такой
     * текст в карточку не берём, поэтому оставляем только заметно более длинные, «настоящие»
     * описания. null означает «описание не трогаем»: при reparse существующий текст не затрётся.
     */
    private String cleanDescription(JsonNode product, String name) {
        String html = product.path("description").asText("");
        if (html.isBlank()) html = product.path("short_description").asText("");
        String text = normalize(Jsoup.parse(html).text());
        return text.length() >= Math.max(120, name.length() * 2) ? text : null;
    }

    /** Первая (основная) картинка товара в полном размере. */
    private String firstImage(JsonNode product) {
        for (JsonNode img : product.path("images")) {
            String src = img.path("src").asText("");
            if (!src.isBlank()) return src;
        }
        return null;
    }

    /** Загружает JSON Store API. Лимит на размер тела снят: список категорий магазина ~800 КБ. */
    private JsonNode fetchJson(String url) throws IOException {
        String body = Jsoup.connect(url)
            .userAgent(USER_AGENT)
            .header("Accept", "application/json")
            .ignoreContentType(true)
            .maxBodySize(0)
            .timeout(30000)
            .execute()
            .body();
        return objectMapper.readTree(body);
    }

    /** Схема и хост из ссылки на каталог — от них строятся адреса Store API. */
    private String origin(String url) {
        URI uri = URI.create(url.trim());
        return uri.getScheme() + "://" + uri.getAuthority();
    }

    /** Последний сегмент пути ссылки на каталог — slug категории («…/energeticheskie/» → energeticheskie). */
    private String lastSegment(String url) {
        String path = URI.create(url.trim()).getPath();
        if (path == null) return "";
        path = path.replaceAll("/+$", "");
        int slash = path.lastIndexOf('/');
        return decode(slash >= 0 ? path.substring(slash + 1) : path);
    }

    /** Процентное декодирование (у кириллических категорий slug закодирован): «%d1%8f» → «я». */
    private String decode(String s) {
        try {
            return URLDecoder.decode(s, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return s;
        }
    }

    /** HTML-сущности в названиях («Lay&#8217;s», «M&amp;M&#8217;s») → обычный текст. */
    private String unescape(String s) {
        return s == null || s.isBlank() ? "" : Jsoup.parse(s).text();
    }

    /**
     * Схлопывает пробелы и приводит в порядок скобки: «(Монстр Шот )» → «(Монстр Шот)»,
     * «Lemon(Редбул…» → «Lemon (Редбул…» (в названиях магазина встречается и то, и другое).
     */
    private String normalize(String s) {
        if (s == null) return "";
        return s.replaceAll("\\s+", " ")
            .replaceAll("\\(\\s+", "(")
            .replaceAll("\\s+\\)", ")")
            .replaceAll("(?<=\\S)\\(", " (")
            .trim();
    }

    /** Убирает осиротевшие знаки на концах после вырезанных кусков («… (Персик) -» → «… (Персик)»). */
    private String trimPunctuation(String s) {
        return s.replaceAll("^[\\s\\-—,.;:]+", "").replaceAll("[\\s\\-—,;:]+$", "");
    }
}
