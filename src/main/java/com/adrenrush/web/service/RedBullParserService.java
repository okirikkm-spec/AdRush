package com.adrenrush.web.service;

import lombok.RequiredArgsConstructor;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.concurrent.TimeUnit;

/**
 * Парсер ассортимента Red Bull с официального сайта redbull.com/ru-ru/energydrink.
 *
 * Работает как «адреналиновый» {@link ParserService}: сам ходит в сеть, серверно-рендеренная
 * страница (Next.js App Router) отдаёт карточки товаров прямо в HTML, парсер их разбирает по
 * расписанию и качает обложки в наше хранилище.
 *
 * Карточки лежат в карусели {@code #products}: ссылка {@code a.product-rail_card} с href на
 * страницу товара, заголовок {@code h3.product-rail_product-label} (бренд+вкус) и картинка-пэкшот
 * {@code img.product-rail_image} на Contentful CDN (images.ctfassets.net). Имена CSS-классов в
 * Next.js имеют хэш-суффикс (product-rail_card__5pUT7), который меняется при каждой сборке сайта,
 * поэтому селекторы завязаны на стабильный префикс через {@code [class*=...]}.
 *
 * Одного каталога мало: он показывает только текущий ассортимент. Сезонные издания вроде
 * Summer Edition на сайте есть, но ссылок на них нет НИГДЕ — ни в каталоге, ни на хабе
 * «Red Bull Editions», ни в sitemap (проверено 31.07.2026: sitemap сайта вообще не содержит
 * страниц раздела energydrink). Поэтому ассортимент собирается из трёх источников:
 * <ul>
 *   <li>карточки каталога — актуальный ассортимент с чистыми названиями;</li>
 *   <li>ссылки на издания со страницы-хаба {@code /energydrink/red-bull-editions};</li>
 *   <li>адреса из {@code redbull.parser.extra-urls} — страницы, добавленные вручную, потому что
 *       найти их обходом невозможно.</li>
 * </ul>
 * Угадывать такие адреса по шаблону нельзя: сайт отвечает 200 и на несуществующие
 * (например, {@code red-bull-white-edition}), отдавая содержимое каталога.
 * Название, описание и пэкшот берутся со страницы самого товара из метатегов Open Graph
 * (см. {@link #fetchProductPage}); для позиций из каталога название предпочитается «рейловое» —
 * оно короче и чище заголовка страницы.
 *
 * Важно: страница за Akamai Bot Manager, который блокирует Java-клиента по TLS-фингерпринту (JA3) и
 * отдаёт ему 403 даже с браузерными заголовками. Поэтому HTML качаем системным curl (его TLS Akamai
 * пропускает) — см. {@link #fetchViaCurl}, — а Jsoup используем только для разбора DOM. С
 * дата-центрового IP боевого сервера Akamai всё равно может вернуть 403 — тогда понадобится
 * резидентный прокси (или каталог WorldSweet, см. {@link WorldSweetParserService}).
 */
@Service
@RequiredArgsConstructor
public class RedBullParserService implements CatalogParser {

    private static final Logger log = LoggerFactory.getLogger(RedBullParserService.class);
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    /** Бренд, который проставляется всем карточкам из этого каталога. */
    public static final String BRAND = "Red Bull";

    /** Ссылка на издание: «…/energydrink/red-bull-<что-то>-edition». */
    private static final Pattern EDITION_SLUG = Pattern.compile("/red-bull-[a-z0-9\\-]+-edition(?:/|$)");
    /** Хвост заголовка после названия продукта: «… со вкусом белого персика», «… — RedBull.com». */
    private static final Pattern TITLE_TAIL = Pattern.compile(
        "\\s*(?:со\\s+вкусом|с\\s+вкусом|\\||—|-\\s*RedBull\\.com|\\.)\\s*.*$",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);

    @Value("${redbull.parser.url}")
    private String catalogUrl;

    @Value("${redbull.parser.enabled:true}")
    private boolean enabled;

    /**
     * Дополнительные страницы товаров через запятую — те, на которые сайт ниоткуда не ссылается
     * (ни каталог, ни хаб изданий, ни sitemap), поэтому найти их обходом нельзя. Такие адреса
     * добавляются сюда вручную; сейчас это Summer Edition.
     */
    @Value("${redbull.parser.extra-urls:https://www.redbull.com/ru-ru/energydrink/red-bull-summer-edition}")
    private String extraUrls;

    @Override
    public String source() {
        return BRAND;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Собирает ассортимент из трёх источников (см. описание класса): карточки каталога, ссылки со
     * страницы-хаба «Red Bull Editions» и проверка сезонных изданий по списку из конфига. Ключ
     * позиции — ссылка на страницу товара: у Red Bull есть стабильные per-product URL.
     */
    @Override
    public List<ParsedItem> collect() {
        try {
            Map<String, String> namesByUrl = new LinkedHashMap<>();
            Map<String, String> imagesByUrl = new HashMap<>();

            String catalogHtml = fetchViaCurl(catalogUrl);
            Document catalog = Jsoup.parse(catalogHtml, catalogUrl);
            Elements cards = catalog.select("a[class*=product-rail_card][href]");
            if (cards.isEmpty()) {
                log.warn("Red Bull-парсер: не найдено ни одной карточки (a.product-rail_card). "
                    + "Структура сайта могла измениться, либо Akamai вернул страницу-заглушку вместо каталога.");
            }
            for (Element card : cards) {
                String href = card.absUrl("href");
                if (!isProductHref(href)) continue;
                // имя из карточки рейла чище, чем из og:title страницы («Red Bull Energy Drink»
                // против «Энергетический напиток Red Bull. Бодрит тело и дух.»)
                namesByUrl.putIfAbsent(href, productName(card));
                String img = bestImage(card);
                if (img != null) imagesByUrl.putIfAbsent(href, img);
            }

            for (String href : collectLinkedEditions()) namesByUrl.putIfAbsent(href, "");
            for (String href : extraProductUrls()) namesByUrl.putIfAbsent(href, "");

            List<ParsedItem> items = new ArrayList<>();
            for (Map.Entry<String, String> entry : namesByUrl.entrySet()) {
                String href = entry.getKey();
                ProductPage page = fetchProductPage(href);
                if (page == null) continue;

                String name = !entry.getValue().isBlank() ? entry.getValue() : page.name();
                String imageUrl = imagesByUrl.getOrDefault(href, page.imageUrl());
                if (name.isBlank() || imageUrl == null || imageUrl.isBlank()) continue;

                items.add(new ParsedItem(name, page.description(), BRAND, imageUrl, href, BRAND));
            }

            log.info("Red Bull-парсер: найдено позиций {} (карточек в каталоге: {})", items.size(), cards.size());
            return items;
        } catch (Exception e) {
            log.warn("Red Bull-парсер: ошибка обхода {}: {}", catalogUrl, e.getMessage());
            return List.of();
        }
    }

    /** Разобранная страница товара: имя, описание и пэкшот из метатегов. */
    private record ProductPage(String name, String description, String imageUrl) {}

    /**
     * Ссылки на издания со страницы-хаба «Red Bull Editions». Отдельный источник, потому что в
     * каталоге показывается только текущий ассортимент, а хаб переживает сезонные перестановки.
     */
    private Set<String> collectLinkedEditions() {
        Set<String> found = new LinkedHashSet<>();
        String hub = sectionUrl() + "/red-bull-editions";
        try {
            Document doc = Jsoup.parse(fetchViaCurl(hub), hub);
            for (Element a : doc.select("a[href]")) {
                String href = a.absUrl("href");
                if (isProductHref(href) && EDITION_SLUG.matcher(href).find()) found.add(href);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.debug("Red Bull-парсер: хаб изданий недоступен ({})", e.getMessage());
        }
        return found;
    }

    /** Адреса из {@code redbull.parser.extra-urls} — страницы, до которых нет ссылок на сайте. */
    private Set<String> extraProductUrls() {
        Set<String> urls = new LinkedHashSet<>();
        for (String url : extraUrls.split(",")) {
            String trimmed = url.trim();
            if (!trimmed.isEmpty()) urls.add(trimmed);
        }
        return urls;
    }

    /** Раздел энергетиков («https://www.redbull.com/ru-ru/energydrink») без хвостового слэша. */
    private String sectionUrl() {
        return catalogUrl.replaceAll("/+$", "");
    }

    /**
     * Открывает страницу товара и достаёт имя, описание и пэкшот из метатегов Open Graph. Имя
     * чистится от хвоста-описания («Red Bull Summer Edition со вкусом белого персика» →
     * «Red Bull Summer Edition»), артикль «The» в начале убирается.
     */
    private ProductPage fetchProductPage(String productUrl) {
        try {
            Document doc = Jsoup.parse(fetchViaCurl(productUrl), productUrl);
            String title = metaContent(doc, "meta[property=og:title]");
            String name = TITLE_TAIL.matcher(title).replaceFirst("");
            name = name.replaceFirst("(?i)^the\\s+", "").trim();

            String description = metaContent(doc, "meta[property=og:description]");
            if (description.isBlank()) description = metaContent(doc, "meta[name=description]");

            String image = metaContent(doc, "meta[property=og:image]");
            return new ProductPage(normalize(name), description.isBlank() ? null : normalize(description),
                image.isBlank() ? null : image);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Red Bull-парсер: разбор страницы прерван {}", productUrl);
            return null;
        } catch (Exception e) {
            log.warn("Red Bull-парсер: не удалось разобрать {}: {}", productUrl, e.getMessage());
            return null;
        }
    }

    private String metaContent(Document doc, String selector) {
        Element meta = doc.selectFirst(selector);
        return meta != null ? normalize(meta.attr("content")) : "";
    }

    /**
     * Скачивает HTML системным curl, а не Jsoup/HttpURLConnection: сайт за Akamai Bot Manager,
     * который блокирует Java-клиента по TLS-фингерпринту (JA3) и стабильно отдаёт ему 403, тогда как
     * curl с тем же UA и заголовками проходит (HTTP 200). curl присутствует в базовом образе
     * eclipse-temurin (/usr/bin/curl). URL берётся из конфига и передаётся отдельным аргументом
     * массива (не через shell) — инъекция исключена.
     */
    private String fetchViaCurl(String url) throws IOException, InterruptedException {
        List<String> cmd = List.of(
            "curl", "-sS", "-L", "--compressed", "--max-time", "30",
            "-A", USER_AGENT,
            "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "-H", "Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "-H", "Sec-Fetch-Dest: document",
            "-H", "Sec-Fetch-Mode: navigate",
            "-H", "Sec-Fetch-Site: none",
            "-H", "Referer: https://www.redbull.com/",
            url
        );
        Process proc = new ProcessBuilder(cmd)
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start();
        // читаем stdout до EOF (curl закроет его сам, гарантированно — из-за --max-time 30)
        byte[] body = proc.getInputStream().readAllBytes();
        if (!proc.waitFor(40, TimeUnit.SECONDS)) {
            proc.destroyForcibly();
            throw new IOException("curl не ответил за 40с");
        }
        if (proc.exitValue() != 0) {
            throw new IOException("curl завершился с кодом " + proc.exitValue());
        }
        return new String(body, StandardCharsets.UTF_8);
    }

    /** true, если ссылка ведёт на конкретный товар (есть slug после /energydrink/), а не на сам каталог. */
    private boolean isProductHref(String href) {
        int idx = href.indexOf("/energydrink/");
        if (idx < 0) return false;
        String rest = href.substring(idx + "/energydrink/".length()).replaceAll("[?#].*$", "");
        return !rest.isBlank();
    }

    /**
     * Имя «бренд + вкус» из заголовка карточки. В DOM бренд (собственный текст h3, напр. "Red Bull")
     * и вкус (вложенный inline-{@code <span>}) идут без пробела между собой, поэтому Jsoup.text()
     * склеил бы их ("Red BullEnergy Drink"). Берём части по отдельности и соединяем пробелом.
     */
    private String productName(Element card) {
        Element label = card.selectFirst("h3[class*=product-label]");
        if (label == null) label = card.selectFirst("h3");
        if (label == null) return "";
        Element flavor = label.selectFirst("span[class*=product-name]");
        if (flavor != null) {
            String joined = (normalize(label.ownText()) + " " + normalize(flavor.text())).trim();
            if (!joined.isBlank()) return joined;
        }
        return normalize(label.text());
    }

    /** Абсолютная ссылка на пэкшот: сперва img.product-rail_image, потом любой img (src, затем srcset). */
    private String bestImage(Element card) {
        Element img = card.selectFirst("img[class*=product-rail_image]");
        if (img == null) img = card.selectFirst("img");
        if (img == null) return null;
        String src = img.absUrl("src");
        if (src.isBlank()) src = firstFromSrcset(img.attr("srcset"));
        return src.isBlank() ? null : src;
    }

    /** Первый URL из значения атрибута srcset ("url 250w, url 500w" -> "url"). */
    private String firstFromSrcset(String srcset) {
        if (srcset == null || srcset.isBlank()) return "";
        String first = srcset.split(",")[0].trim();
        int sp = first.indexOf(' ');
        return sp > 0 ? first.substring(0, sp) : first;
    }

    /**
     * Схлопывает пробелы и убирает невидимые символы без regex-экранирования:
     * isSpaceChar ловит неразрывный U+00A0 (между "Red" и "Bull"), FORMAT — zero-width/BOM.
     */
    private String normalize(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder(s.length());
        boolean prevSpace = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.getType(c) == Character.FORMAT) continue;
            if (Character.isWhitespace(c) || Character.isSpaceChar(c)) {
                if (!prevSpace && b.length() > 0) {
                    b.append(' ');
                    prevSpace = true;
                }
            } else {
                b.append(c);
                prevSpace = false;
            }
        }
        return b.toString().trim();
    }
}
