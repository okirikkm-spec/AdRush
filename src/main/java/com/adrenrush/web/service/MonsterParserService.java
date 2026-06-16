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

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Парсер ассортимента Monster Energy с официального сайта monsterenergy.com/en-us/energy-drinks/.
 * Страница серверно рендерит карточки {@code a.product-card} (имя бренда + вкус + картинка + ссылка),
 * сгруппированные по брендам; у каждой группы есть описание {@code .brand-description}.
 *
 * Особенности этого сайта (стоили отладки):
 * - Cloudflare отдаёт 403-челлендж, если не прислать ПОЛНЫЙ набор браузерных заголовков и
 *   браузерный TLS-фингерпринт. Java/Jsoup-клиент режется, поэтому HTML тянем через системный curl.
 * - CDN картинок (web-assests.monsterenergy.com) тротлит серверное скачивание по TLS-фингерпринту,
 *   поэтому обложки НЕ скачиваем в хранилище, а сохраняем внешние ссылки — их тянет браузер клиента.
 */
@Service
@RequiredArgsConstructor
public class MonsterParserService {

    private static final Logger log = LoggerFactory.getLogger(MonsterParserService.class);
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    /** Бренд, который проставляется всем карточкам из этого каталога. */
    public static final String BRAND = "Monster";

    private final DrinkService drinkService;

    @Value("${parser.monster.url:https://www.monsterenergy.com/en-us/energy-drinks/}")
    private String catalogUrl;

    @Value("${parser.monster.enabled:true}")
    private boolean enabled;

    /** Ежедневный запуск по cron (по умолчанию через полчаса после парсера Adrenaline). */
    @Scheduled(cron = "${parser.monster.cron:0 30 4 * * *}")
    public void scheduledParse() {
        if (!enabled) return;
        log.info("Запланированный парсинг ассортимента monsterenergy.com");
        parse(false);
    }

    /**
     * Обходит каталог Monster. Дедупликация — по ссылке на страницу товара (href);
     * первое вхождение выигрывает, поэтому товар получает описание своей «домашней» секции,
     * а не агрегирующих каруселей (Fan Favorites и т.п.).
     *
     * @param reparse false — заводятся только новые карточки; true — у существующих обновляются
     *                название/описание из источника
     * @return сводка: создано/обновлено
     */
    public DrinkService.ParseResult parse(boolean reparse) {
        String html;
        try {
            html = fetch(catalogUrl);
        } catch (Exception e) {
            log.warn("Monster-парсер: не удалось загрузить {}: {}", catalogUrl, e.getMessage());
            return new DrinkService.ParseResult(0, 0);
        }

        Document doc = Jsoup.parse(html, catalogUrl);
        Elements cards = doc.select("a.product-card[href]");
        if (cards.isEmpty()) {
            log.warn("Monster-парсер: не найдено карточек (a.product-card). Структура сайта могла измениться "
                + "или Cloudflare вернул челлендж.");
            return new DrinkService.ParseResult(0, 0);
        }

        int created = 0;
        int updated = 0;
        Set<String> seen = new HashSet<>();

        for (Element card : cards) {
            String href = card.absUrl("href");
            if (!isProductHref(href) || !seen.add(href)) continue;

            String category = textOf(card.selectFirst(".category-name"));
            String flavor = textOf(card.selectFirst(".product-name"));
            String name = combine(category, flavor);
            if (name.isBlank()) continue;

            Element img = card.selectFirst("img");
            String imageUrl = img != null ? img.absUrl("src") : null;
            if (imageUrl == null || imageUrl.isBlank()) continue;

            String description = findBrandDescription(card);

            // sourceUrl = href: стабильный уникальный ключ для дедупликации;
            // downloadCover=false — храним внешнюю ссылку на CDN (его серверное скачивание тротлится).
            DrinkService.ParseOutcome outcome =
                drinkService.upsertFromParser(name, description, BRAND, imageUrl, href, false, reparse);
            if (outcome == DrinkService.ParseOutcome.CREATED) {
                created++;
                log.info("Monster-парсер: добавлен энергетик '{}' ({})", name, href);
            } else if (outcome == DrinkService.ParseOutcome.UPDATED) {
                updated++;
            }
        }

        if (created == 0 && updated == 0) {
            log.info("Monster-парсер: изменений не найдено");
        }
        return new DrinkService.ParseResult(created, updated);
    }

    /** Тянет HTML через системный curl с полным набором браузерных заголовков (иначе Cloudflare 403). */
    private String fetch(String url) throws Exception {
        List<String> cmd = List.of(
            "curl", "-sS", "-L", "--compressed", "--max-time", "40",
            "-H", "User-Agent: " + USER_AGENT,
            "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "-H", "Accept-Language: en-US,en;q=0.9",
            url
        );
        ProcessBuilder pb = new ProcessBuilder(cmd);
        pb.redirectError(ProcessBuilder.Redirect.DISCARD);
        Process p = pb.start();

        byte[] body;
        try (InputStream in = p.getInputStream()) {
            body = in.readAllBytes();
        }
        if (!p.waitFor(50, TimeUnit.SECONDS)) {
            p.destroyForcibly();
            throw new IllegalStateException("curl превысил таймаут");
        }
        if (p.exitValue() != 0) {
            throw new IllegalStateException("curl завершился с кодом " + p.exitValue());
        }
        return new String(body, StandardCharsets.UTF_8);
    }

    /** true, если ссылка ведёт на конкретный товар (бренд + вкус), а не на лендинг категории. */
    private boolean isProductHref(String href) {
        int idx = href.indexOf("/energy-drinks/");
        if (idx < 0) return false;
        String rest = href.substring(idx + "/energy-drinks/".length()).replaceAll("[?#].*$", "");
        long segs = Arrays.stream(rest.split("/")).filter(s -> !s.isBlank()).count();
        return segs >= 2;
    }

    /** Описание бренда из ближайшей секции-предка карточки. */
    private String findBrandDescription(Element card) {
        for (Element p = card.parent(); p != null; p = p.parent()) {
            Element d = p.selectFirst(".brand-description");
            if (d != null) return normalize(d.text());
        }
        return null;
    }

    /** Склейка «бренд + вкус» без задвоения слова на стыке («Monster Ultra» + «Ultra Paradise» → «Monster Ultra Paradise»). */
    private String combine(String category, String flavor) {
        if (category.isBlank()) return flavor;
        if (flavor.isBlank()) return category;
        String[] cat = category.split("\\s+");
        String[] fl = flavor.split("\\s+");
        if (fl.length > 1 && fl[0].equalsIgnoreCase(cat[cat.length - 1])) {
            flavor = String.join(" ", Arrays.copyOfRange(fl, 1, fl.length));
        }
        return normalize(category + " " + flavor);
    }

    private String textOf(Element el) {
        return el == null ? "" : normalize(el.text());
    }

    private String normalize(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }
}
