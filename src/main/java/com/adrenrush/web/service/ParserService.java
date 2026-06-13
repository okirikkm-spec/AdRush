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

import java.util.HashSet;
import java.util.Set;

/**
 * Парсер ассортимента Adrenaline Rush с официального сайта adrenalinerush.ru.
 * Сайт — Nuxt SSR-страница: товары рендерятся в DOM как карточки .product-item.
 * Раз в сутки перепроверяет список и заводит карточки для новых вкусов
 * (при пустой базе — полный первичный обход).
 */
@Service
@RequiredArgsConstructor
public class ParserService {

    private static final Logger log = LoggerFactory.getLogger(ParserService.class);
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

    private final DrinkService drinkService;

    @Value("${parser.url}")
    private String catalogUrl;

    @Value("${parser.enabled:true}")
    private boolean enabled;

    /** Ежедневный запуск по cron из application.properties. */
    @Scheduled(cron = "${parser.cron:0 0 4 * * *}")
    public void scheduledParse() {
        if (!enabled) return;
        log.info("Запланированный парсинг ассортимента adrenalinerush.ru");
        parse(false);
    }

    /**
     * Обходит все карточки товаров на странице. Новизна определяется дедупликацией
     * по ссылке изображения (у SPA нет отдельных URL у товаров).
     *
     * @param fullScan оставлен для совместимости; обход всегда полный (товаров немного)
     * @return сколько новых энергетиков создано
     */
    public int parse(boolean fullScan) {
        try {
            Document doc = Jsoup.connect(catalogUrl)
                .userAgent(USER_AGENT)
                .timeout(20000)
                .get();

            Elements cards = doc.select("div.product-item");
            if (cards.isEmpty()) {
                log.warn("Парсер: не найдено ни одной карточки (div.product-item). Структура сайта могла измениться.");
                return 0;
            }

            int created = 0;
            Set<String> seen = new HashSet<>();

            for (Element card : cards) {
                Element titleEl = card.selectFirst(".product-title");
                Element img = card.selectFirst(".product-image img");
                Element descEl = card.selectFirst(".product-description");

                if (titleEl == null || img == null) continue;

                String name = normalize(titleEl.text());
                String imageUrl = bestImage(img);
                if (name.isBlank() || imageUrl == null) continue;

                // ключ дедупликации в рамках одного прохода — ссылка на картинку
                if (!seen.add(imageUrl)) continue;

                String description = descEl != null ? normalize(descEl.text()) : null;

                // sourceUrl = imageUrl: уникальный стабильный ключ для existsBySourceUrl
                boolean isNew = drinkService.createFromParser(name, description, imageUrl, imageUrl);
                if (isNew) {
                    created++;
                    log.info("Парсер: добавлен энергетик '{}' ({})", name, imageUrl);
                }
            }

            if (created == 0) {
                log.info("Парсер: новых энергетиков не найдено");
            }
            return created;
        } catch (Exception e) {
            log.warn("Парсер: ошибка обхода {}: {}", catalogUrl, e.getMessage());
            return 0;
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
