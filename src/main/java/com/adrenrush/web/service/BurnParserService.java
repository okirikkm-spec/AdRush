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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Парсер ассортимента Burn из каталога napolke.ru (оптовый маркетплейс FMCG).
 *
 * Официального сайта у Burn в России нет, поэтому источник — раздел энергетиков магазина с
 * фильтром по бренду ({@code ?brands[0]=11}). Страница отрисована React'ом, но серверный рендер
 * кладёт всё состояние в {@code window.__INITIAL_STATE__}, и товары берутся оттуда: разбирать
 * styled-components-разметку с генерируемыми классами (sc-2rwc8b-1) было бы бессмысленно — они
 * меняются при каждой сборке сайта. Нужная ветка состояния — {@code search.catalogSearch.searchResult}.
 *
 * Пагинации у выборки нет: сайт отдаёт до 60 позиций за раз (у Burn их 14) и сам сообщает об этом
 * флагом {@code isNoMoreResults}.
 *
 * Картинки лежат отдельным сервисом: {@code img.napolke.ru/image/get?uuid=<id>&size=800x800}
 * отвечает редиректом на JPEG (оригинал 740×740).
 *
 * Как и у остальных источников, найденное не попадает в каталог само — оно уходит в приёмку
 * ({@link ParserStagingService}), где карточки заводит администратор.
 */
@Service
@RequiredArgsConstructor
public class BurnParserService implements CatalogParser {

    private static final Logger log = LoggerFactory.getLogger(BurnParserService.class);
    private static final String USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    /** Метка источника в списке парсеров админки. */
    public static final String SOURCE = "Burn (НаПолке)";

    /** Состояние страницы, из которого берутся товары. */
    private static final String STATE_MARKER = "window.__INITIAL_STATE__";

    /** Родовое начало названия: «Напиток энергетический Burn …». */
    private static final Pattern GENERIC_PREFIX = Pattern.compile(
        "^(?:напиток\\s+энергетическ\\p{L}*|энергетическ\\p{L}*\\s+напиток|энергетик)\\b\\s*",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    /** Тара в хвосте названия: «, ж/б», «ПЭТ», «ст/б». */
    private static final Pattern PACKAGING = Pattern.compile(
        "[,\\s]*\\b(?:ж/б|ж\\.б|пэт|ст/б|стекло|банка)\\b\\.?",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);
    /** Объём порции — в названии карточки он не нужен, но по нему выбирается вариант при схлопывании. */
    private static final Pattern VOLUME = Pattern.compile(
        "\\b\\d{2,4}\\s*(?:мл|л|ml)\\b\\.?",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE | Pattern.UNICODE_CHARACTER_CLASS);

    private final ObjectMapper objectMapper;
    private final FlavorKeys flavorKeys;

    @Value("${burn.parser.url}")
    private String catalogUrl;

    @Value("${burn.parser.enabled:true}")
    private boolean enabled;

    /** Бренд для всех карточек источника; пусто — брать из поля brand_name товара. */
    @Value("${burn.parser.brand:Burn}")
    private String brand;

    @Override
    public String source() {
        return SOURCE;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    @Override
    public List<ParsedItem> collect() {
        try {
            JsonNode products = fetchProducts();
            if (products == null || products.isEmpty()) {
                log.warn("Burn-парсер: в состоянии страницы {} не нашлось товаров — вёрстка или "
                    + "структура состояния могли измениться", catalogUrl);
                return List.of();
            }

            // тот же вкус в разной таре («сочная энергия» 449 и 330 мл) — одна карточка каталога;
            // побеждает больший объём
            Map<String, Candidate> byFlavor = new LinkedHashMap<>();
            for (JsonNode product : products) {
                Candidate candidate = toCandidate(product);
                if (candidate == null) continue;
                Candidate current = byFlavor.get(candidate.flavorKey());
                if (current == null || candidate.volumeMl() > current.volumeMl()) {
                    byFlavor.put(candidate.flavorKey(), candidate);
                }
            }

            List<ParsedItem> items = new ArrayList<>();
            for (Candidate c : byFlavor.values()) {
                items.add(new ParsedItem(c.name(), null, c.brand(), c.imageUrl(), c.sourceUrl(), SOURCE));
            }
            log.info("Burn-парсер: найдено позиций {} (товаров в каталоге: {})", items.size(), products.size());
            return items;
        } catch (Exception e) {
            log.warn("Burn-парсер: ошибка обхода {}: {}", catalogUrl, e.getMessage());
            return List.of();
        }
    }

    /** Разобранный товар: объём нужен, чтобы выбрать вариант среди позиций одного вкуса. */
    private record Candidate(String name, String brand, String imageUrl, String sourceUrl,
                             String flavorKey, int volumeMl) {}

    private Candidate toCandidate(JsonNode product) {
        String rawName = product.path("name").asText("");
        String seoName = product.path("seo_name").asText("");
        if (rawName.isBlank() || seoName.isBlank()) return null;

        String name = cleanName(rawName);
        if (name.isBlank()) return null;

        JsonNode images = product.path("images");
        String imageUuid = images.isArray() && !images.isEmpty() ? images.get(0).asText("") : "";
        if (imageUuid.isBlank()) return null;

        String itemBrand = brand != null && !brand.isBlank()
            ? brand.trim()
            : product.path("brand_name").asText(null);

        return new Candidate(name, itemBrand, imageUrl(imageUuid), productUrl(seoName),
            flavorKeys.flavorKey(name), flavorKeys.volumeOf(rawName));
    }

    /**
     * Оптовое название магазина → название карточки: «Напиток энергетический Burn Original 449 мл.,
     * ж/б» → «Burn Original». Объём и тара остаются только в исходных данных — в каталоге рейтинга
     * одна карточка на вкус.
     */
    private String cleanName(String raw) {
        String s = GENERIC_PREFIX.matcher(raw.trim()).replaceFirst("");
        s = PACKAGING.matcher(s).replaceAll(" ");
        s = VOLUME.matcher(s).replaceAll(" ");
        s = s.replaceAll("\\s+", " ").trim();
        return s.replaceAll("^[\\s,.;:\\-]+", "").replaceAll("[\\s,.;:\\-]+$", "");
    }

    /** Ссылка на страницу товара — ключ позиции для приёмки и дедупликации. */
    private String productUrl(String seoName) {
        URI base = URI.create(catalogUrl);
        String path = base.getPath().replaceAll("/+$", "");
        return base.getScheme() + "://" + base.getAuthority() + path + "/product/" + seoName;
    }

    /** Пэкшот: сервис картинок отвечает редиректом на JPEG (оригинал 740×740). */
    private String imageUrl(String uuid) {
        return "https://img.napolke.ru/image/get?uuid=" + uuid + "&size=800x800";
    }

    /**
     * Достаёт товары из {@code window.__INITIAL_STATE__}: находит начало объекта и считает
     * фигурные скобки, пропуская содержимое строк, — регулярным выражением такой JSON не взять.
     */
    private JsonNode fetchProducts() throws IOException {
        String html = Jsoup.connect(catalogUrl)
            .userAgent(USER_AGENT)
            .header("Accept-Language", "ru-RU,ru;q=0.9")
            .timeout(30000)
            .maxBodySize(0)
            .get()
            .html();

        int marker = html.indexOf(STATE_MARKER);
        if (marker < 0) {
            log.warn("Burn-парсер: на странице нет {} — сайт мог перейти на другой рендеринг", STATE_MARKER);
            return null;
        }
        int start = html.indexOf('{', marker);
        if (start < 0) return null;

        int depth = 0;
        boolean inString = false;
        boolean escaped = false;
        for (int i = start; i < html.length(); i++) {
            char c = html.charAt(i);
            if (inString) {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
                continue;
            }
            if (c == '"') inString = true;
            else if (c == '{') depth++;
            else if (c == '}' && --depth == 0) {
                JsonNode state = objectMapper.readTree(html.substring(start, i + 1));
                return state.path("search").path("catalogSearch").path("searchResult");
            }
        }
        log.warn("Burn-парсер: не удалось прочитать состояние страницы целиком");
        return null;
    }
}
