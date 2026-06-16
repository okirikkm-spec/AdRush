package com.adrenrush.web.service;

import lombok.RequiredArgsConstructor;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Парсер ассортимента Monster Energy из ВРУЧНУЮ ЗАГРУЖЕННОГО HTML каталога
 * monsterenergy.com/en-us/energy-drinks/.
 *
 * Почему из файла, а не сетевым запросом: сайт за Cloudflare Bot Management, который из
 * дата-центра (боевой сервер) отдаёт 403-челлендж независимо от заголовков и DPI-обходов —
 * пробивает только настоящий браузер. Поэтому администратор сохраняет страницу каталога в
 * браузере (Ctrl+S → «только HTML») и загружает файл через админку, а парсер разбирает его.
 *
 * Страница серверно рендерит карточки {@code a.product-card} (имя бренда + вкус + картинка +
 * ссылка), сгруппированные по брендам; у каждой группы есть описание {@code .brand-description}.
 * Картинки сохраняем как внешние ссылки на CDN (web-assests.monsterenergy.com) — их грузит
 * браузер клиента (серверное скачивание CDN тротлит по TLS-фингерпринту).
 */
@Service
@RequiredArgsConstructor
public class MonsterParserService {

    private static final Logger log = LoggerFactory.getLogger(MonsterParserService.class);

    /** Бренд, который проставляется всем карточкам из этого каталога. */
    public static final String BRAND = "Monster";

    /** Базовый URL каталога — для разрешения относительных ссылок (href) в загруженном HTML. */
    private static final String CATALOG_BASE_URI = "https://www.monsterenergy.com/en-us/energy-drinks/";

    private final DrinkService drinkService;

    /**
     * Разбирает HTML каталога Monster (сохранённый из браузера и загруженный администратором).
     * Дедупликация — по ссылке на страницу товара (href); первое вхождение выигрывает, поэтому
     * товар получает описание своей «домашней» секции, а не агрегирующих каруселей.
     *
     * @param html    содержимое сохранённой страницы каталога
     * @param reparse false — заводятся только новые карточки; true — у существующих обновляются
     *                название/описание/бренд из источника
     * @return сводка: создано/обновлено
     */
    public DrinkService.ParseResult parseHtml(String html, boolean reparse) {
        if (html == null || html.isBlank()) {
            log.warn("Monster-парсер: загружен пустой HTML");
            return new DrinkService.ParseResult(0, 0);
        }

        Document doc = Jsoup.parse(html, CATALOG_BASE_URI);
        Elements cards = doc.select("a.product-card[href]");
        if (cards.isEmpty()) {
            log.warn("Monster-парсер: в загруженном HTML не найдено карточек (a.product-card). "
                + "Вероятно, сохранена страница-заглушка Cloudflare, а не сам каталог.");
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
        } else {
            log.info("Monster-парсер: создано {}, обновлено {}", created, updated);
        }
        return new DrinkService.ParseResult(created, updated);
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
