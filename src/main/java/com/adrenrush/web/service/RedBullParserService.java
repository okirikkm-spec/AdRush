package com.adrenrush.web.service;

import lombok.RequiredArgsConstructor;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Парсер ассортимента Red Bull с официального сайта redbull.com/ru-ru/energydrink.
 *
 * Работает как «адреналиновый» {@link ParserService} (а не как ручной {@link MonsterParserService}):
 * сам ходит в сеть, серверно-рендеренная страница (Next.js App Router) отдаёт карточки товаров
 * прямо в HTML, парсер их разбирает по расписанию и качает обложки в наше хранилище.
 *
 * Карточки лежат в карусели {@code #products}: ссылка {@code a.product-rail_card} с href на
 * страницу товара, заголовок {@code h3.product-rail_product-label} (бренд+вкус) и картинка-пэкшот
 * {@code img.product-rail_image} на Contentful CDN (images.ctfassets.net). Имена CSS-классов в
 * Next.js имеют хэш-суффикс (product-rail_card__5pUT7), который меняется при каждой сборке сайта,
 * поэтому селекторы завязаны на стабильный префикс через {@code [class*=...]}.
 *
 * Описание в карточке рейла отсутствует, поэтому по каждому товару дополнительно открывается его
 * страница (тем же curl) и берётся {@code og:description} / {@code meta[name=description]} — они
 * есть у всех вкусов и различаются по продуктам (см. {@link #fetchDescription}).
 *
 * Важно: страница за Akamai Bot Manager, который блокирует Java-клиента по TLS-фингерпринту (JA3) и
 * отдаёт ему 403 даже с браузерными заголовками. Поэтому HTML качаем системным curl (его TLS Akamai
 * пропускает) — см. {@link #fetchViaCurl}, — а Jsoup используем только для разбора DOM. С
 * дата-центрового IP боевого сервера Akamai всё равно может вернуть 403 (как Cloudflare у Monster) —
 * тогда понадобится резидентный прокси.
 */
@Service
@RequiredArgsConstructor
public class RedBullParserService {

    private static final Logger log = LoggerFactory.getLogger(RedBullParserService.class);
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    /** Бренд, который проставляется всем карточкам из этого каталога. */
    public static final String BRAND = "Red Bull";

    private final DrinkService drinkService;

    @Value("${redbull.parser.url}")
    private String catalogUrl;

    @Value("${redbull.parser.enabled:true}")
    private boolean enabled;

    /** Ежедневный запуск по cron из application.properties (по умолчанию в 04:30, со сдвигом от adrenaline). */
    @Scheduled(cron = "${redbull.parser.cron:0 30 4 * * *}")
    public void scheduledParse() {
        if (!enabled) return;
        log.info("Запланированный парсинг ассортимента redbull.com");
        parse(false);
    }

    /**
     * Обходит карточки товаров на странице каталога. Дедупликация — по ссылке на страницу товара
     * (href): у Red Bull, в отличие от adrenalinerush.ru, есть стабильные per-product URL.
     *
     * @param reparse false — заводятся только новые карточки; true — у существующих обновляются
     *                название/бренд из источника
     * @return сводка: создано/обновлено
     */
    public DrinkService.ParseResult parse(boolean reparse) {
        try {
            String html = fetchViaCurl(catalogUrl);
            Document doc = Jsoup.parse(html, catalogUrl);

            Elements cards = doc.select("a[class*=product-rail_card][href]");
            if (cards.isEmpty()) {
                log.warn("Red Bull-парсер: не найдено ни одной карточки (a.product-rail_card). "
                    + "Структура сайта могла измениться, либо Akamai вернул страницу-заглушку вместо каталога.");
                return new DrinkService.ParseResult(0, 0);
            }

            int created = 0;
            int updated = 0;
            Set<String> seen = new HashSet<>();

            for (Element card : cards) {
                String href = card.absUrl("href");
                if (!isProductHref(href) || !seen.add(href)) continue;

                String name = productName(card);
                String imageUrl = bestImage(card);
                if (name.isBlank() || imageUrl == null) continue;

                // описание берём со страницы самого товара — в карточке рейла его нет
                String description = fetchDescription(href);

                // sourceUrl = href: стабильный уникальный ключ дедупликации;
                // downloadCover=true — качаем пэкшот с Contentful CDN в наше хранилище (как adrenaline).
                DrinkService.ParseOutcome outcome =
                    drinkService.upsertFromParser(name, description, BRAND, imageUrl, href, true, reparse);
                if (outcome == DrinkService.ParseOutcome.CREATED) {
                    created++;
                    log.info("Red Bull-парсер: добавлен энергетик '{}' ({})", name, href);
                } else if (outcome == DrinkService.ParseOutcome.UPDATED) {
                    updated++;
                }
            }

            if (created == 0 && updated == 0) {
                log.info("Red Bull-парсер: изменений не найдено");
            } else {
                log.info("Red Bull-парсер: создано {}, обновлено {}", created, updated);
            }
            return new DrinkService.ParseResult(created, updated);
        } catch (Exception e) {
            log.warn("Red Bull-парсер: ошибка обхода {}: {}", catalogUrl, e.getMessage());
            return new DrinkService.ParseResult(0, 0);
        }
    }

    /**
     * Описание товара со страницы самого продукта (в карточке рейла его нет): открывает её тем же
     * curl и читает {@code og:description}, иначе {@code meta[name=description]}. Эти метатеги есть у
     * всех вкусов и различаются по продуктам. Любая ошибка/отсутствие — не фейлит карточку (вернёт null).
     */
    private String fetchDescription(String productUrl) {
        try {
            Document pdoc = Jsoup.parse(fetchViaCurl(productUrl), productUrl);
            Element meta = pdoc.selectFirst("meta[property=og:description]");
            if (meta == null) meta = pdoc.selectFirst("meta[name=description]");
            String desc = meta != null ? normalize(meta.attr("content")) : "";
            return desc.isBlank() ? null : desc;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Red Bull-парсер: получение описания прервано {}", productUrl);
            return null;
        } catch (Exception e) {
            log.warn("Red Bull-парсер: не удалось получить описание {}: {}", productUrl, e.getMessage());
            return null;
        }
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
