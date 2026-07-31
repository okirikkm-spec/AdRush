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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Парсер ассортимента Adrenaline Rush с официального сайта adrenalinerush.ru.
 * Сайт — Nuxt SSR-страница: товары рендерятся в DOM как карточки .product-item.
 *
 * В базу ничего не пишет: найденное уходит в приёмку ({@link ParserStagingService}), где
 * администратор решает, что добавить в каталог.
 */
@Service
@RequiredArgsConstructor
public class ParserService implements CatalogParser {

    private static final Logger log = LoggerFactory.getLogger(ParserService.class);
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

    /** Бренд, который проставляется всем карточкам из этого каталога. */
    public static final String BRAND = "Adrenaline Rush";

    @Value("${parser.url}")
    private String catalogUrl;

    @Value("${parser.enabled:true}")
    private boolean enabled;

    @Override
    public String source() {
        return BRAND;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Обходит все карточки товаров на странице. Дедупликация в рамках прохода — по ссылке
     * изображения: у этого SPA нет отдельных URL у товаров, поэтому она же служит {@code sourceUrl}.
     */
    @Override
    public List<ParsedItem> collect() {
        try {
            Document doc = Jsoup.connect(catalogUrl)
                .userAgent(USER_AGENT)
                .timeout(20000)
                .get();

            Elements cards = doc.select("div.product-item");
            if (cards.isEmpty()) {
                log.warn("Парсер: не найдено ни одной карточки (div.product-item). Структура сайта могла измениться.");
                return List.of();
            }

            List<ParsedItem> items = new ArrayList<>();
            Set<String> seen = new HashSet<>();

            for (Element card : cards) {
                Element titleEl = card.selectFirst(".product-title");
                Element img = card.selectFirst(".product-image img");
                Element descEl = card.selectFirst(".product-description");

                if (titleEl == null || img == null) continue;

                String name = normalize(titleEl.text());
                String imageUrl = bestImage(img);
                if (name.isBlank() || imageUrl == null) continue;
                if (!seen.add(imageUrl)) continue;

                String description = descEl != null ? normalize(descEl.text()) : null;
                items.add(new ParsedItem(name, description, BRAND, imageUrl, imageUrl, BRAND));
            }

            log.info("Парсер adrenalinerush.ru: найдено позиций {}", items.size());
            return items;
        } catch (Exception e) {
            log.warn("Парсер: ошибка обхода {}: {}", catalogUrl, e.getMessage());
            return List.of();
        }
    }

    private String bestImage(Element img) {
        String src = img.absUrl("src");
        if (src.isBlank()) src = img.absUrl("data-src");
        return src.isBlank() ? null : src;
    }

    private String normalize(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }
}
