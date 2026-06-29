package com.adrenrush.web.service;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.dto.ReviewResponseDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;

/**
 * Серверный рендеринг SEO-обвязки для крауло-критичных страниц (главная, карточка энергетика).
 * Берёт собранный index.html и подставляет: уникальные title/description, canonical, Open Graph,
 * JSON-LD (Product + AggregateRating + Review → «звёзды» в выдаче Google) и крауло-видимый контент
 * внутрь #root. React (createRoot) при загрузке очищает #root и рисует обычный SPA поверх —
 * пользователь получает приложение, а робот (в т.ч. Яндекс, который плохо исполняет JS) — готовый HTML.
 */
@Service
public class SeoService {

    private static final int MAX_JSONLD_REVIEWS = 12;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private volatile String template;

    /** Базовый URL из запроса с учётом обратного прокси (X-Forwarded-*). */
    public static String baseUrl(HttpServletRequest req) {
        String proto = firstNonBlank(req.getHeader("X-Forwarded-Proto"), req.getScheme(), "http");
        String host = firstNonBlank(req.getHeader("X-Forwarded-Host"), req.getHeader("Host"), "localhost");
        return proto + "://" + host;
    }

    /* ─────────── публичные рендеры ─────────── */

    public String renderDrink(String baseUrl, DrinkResponseDto d, List<ReviewResponseDto> reviews) {
        String url = baseUrl + "/drink/" + d.getId();
        String image = absUrl(baseUrl, d.getCoverUrl());
        String ratingPart = d.getReviewCount() > 0
            ? " — " + round1(d.getAverageRating()) + "/10 на основе " + d.getReviewCount() + " отзывов"
            : "";
        String title = d.getName() + ratingPart + " · AdRush";
        String desc = buildDrinkDescription(d);

        StringBuilder head = new StringBuilder();
        head.append(canonical(url));
        head.append(metaName("robots", "index,follow"));
        head.append(og("og:type", "product"));
        head.append(og("og:title", title));
        head.append(og("og:description", desc));
        head.append(og("og:url", url));
        head.append(og("og:site_name", "AdRush"));
        head.append(og("og:locale", "ru_RU"));
        if (image != null) head.append(og("og:image", image));
        head.append(metaName("twitter:card", image != null ? "summary_large_image" : "summary"));
        head.append(jsonLd(buildDrinkJsonLd(d, reviews, url, image)));

        StringBuilder body = new StringBuilder();
        body.append("<article class=\"seo-content\">");
        body.append("<h1>").append(esc(d.getName())).append("</h1>");
        if (notBlank(d.getBrand())) body.append("<p>Бренд: ").append(esc(d.getBrand())).append("</p>");
        if (d.getReviewCount() > 0) {
            body.append("<p>Рейтинг: ").append(round1(d.getAverageRating()))
                .append("/10 · ").append(d.getReviewCount()).append(" отзывов</p>");
        }
        if (notBlank(d.getDescription())) body.append("<p>").append(esc(d.getDescription())).append("</p>");
        if (reviews != null && !reviews.isEmpty()) {
            body.append("<h2>Отзывы об энергетике ").append(esc(d.getName())).append("</h2>");
            for (ReviewResponseDto r : reviews) {
                body.append("<section class=\"seo-review\"><p>")
                    .append(esc(nz(r.getUserDisplayName()))).append(" — ")
                    .append(r.getRating() != null ? r.getRating() : 0).append("/10</p>");
                if (notBlank(r.getText())) body.append("<p>").append(esc(r.getText())).append("</p>");
                body.append("</section>");
            }
        }
        body.append("</article>");

        return assemble(title, desc, head.toString(), body.toString());
    }

    public String renderHome(String baseUrl, List<DrinkResponseDto> drinks) {
        String url = baseUrl + "/";
        String title = "AdRush — рейтинг энергетиков: отзывы и оценки";
        String desc = "Народный рейтинг энергетических напитков: честные оценки и отзывы. "
            + "Adrenaline Rush, Red Bull, Monster и другие — сравните и выберите лучший энергетик.";

        StringBuilder head = new StringBuilder();
        head.append(canonical(url));
        head.append(metaName("robots", "index,follow"));
        head.append(og("og:type", "website"));
        head.append(og("og:title", title));
        head.append(og("og:description", desc));
        head.append(og("og:url", url));
        head.append(og("og:site_name", "AdRush"));
        head.append(og("og:locale", "ru_RU"));
        head.append(metaName("twitter:card", "summary"));
        head.append(jsonLd(buildWebsiteJsonLd(baseUrl)));

        StringBuilder body = new StringBuilder();
        body.append("<section class=\"seo-content\"><h1>Рейтинг энергетиков</h1>");
        if (drinks != null && !drinks.isEmpty()) {
            body.append("<ul>");
            for (DrinkResponseDto d : drinks) {
                body.append("<li><a href=\"/drink/").append(d.getId()).append("\">").append(esc(d.getName()));
                if (d.getReviewCount() > 0) body.append(" — ").append(round1(d.getAverageRating())).append("/10");
                body.append("</a></li>");
            }
            body.append("</ul>");
        }
        body.append("</section>");

        return assemble(title, desc, head.toString(), body.toString());
    }

    /** 404 для несуществующего энергетика: тот же шаблон, но noindex (HTTP-статус ставит контроллер). */
    public String renderNotFound() {
        return assemble("Не найдено · AdRush", "Страница не найдена",
            metaName("robots", "noindex,follow"), "");
    }

    /* ─────────── сборка HTML ─────────── */

    private String assemble(String title, String description, String headExtra, String bodyContent) {
        String html = template();
        html = replaceFirst(html, "(?is)<title>.*?</title>", "<title>" + esc(title) + "</title>");
        html = replaceFirst(html, "(?is)<meta\\s+name=\"description\"[^>]*>",
            metaName("description", description).trim());
        html = replaceFirst(html, "(?i)</head>", headExtra + "</head>");
        if (notBlank(bodyContent)) {
            html = replaceFirst(html, "(?i)<div id=\"root\">\\s*</div>",
                "<div id=\"root\">" + bodyContent + "</div>");
        }
        return html;
    }

    private String template() {
        String t = template;
        if (t == null) {
            synchronized (this) {
                if (template == null) {
                    try (InputStream in = new ClassPathResource("static/index.html").getInputStream()) {
                        template = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                    } catch (IOException e) {
                        template = "<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\">"
                            + "<title>AdRush</title><meta name=\"description\" content=\"AdRush\"></head>"
                            + "<body><div id=\"root\"></div></body></html>";
                    }
                }
                t = template;
            }
        }
        return t;
    }

    /* ─────────── JSON-LD ─────────── */

    private Map<String, Object> buildDrinkJsonLd(DrinkResponseDto d, List<ReviewResponseDto> reviews,
                                                 String url, String image) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("@context", "https://schema.org");
        m.put("@type", "Product");
        m.put("name", d.getName());
        if (image != null) m.put("image", image);
        if (notBlank(d.getDescription())) m.put("description", d.getDescription());
        if (notBlank(d.getBrand())) m.put("brand", Map.of("@type", "Brand", "name", d.getBrand()));
        m.put("url", url);
        if (d.getReviewCount() > 0) {
            Map<String, Object> ar = new LinkedHashMap<>();
            ar.put("@type", "AggregateRating");
            ar.put("ratingValue", round1(d.getAverageRating()));
            ar.put("bestRating", 10);
            ar.put("worstRating", 1);
            ar.put("ratingCount", d.getReviewCount());
            m.put("aggregateRating", ar);
        }
        if (reviews != null && !reviews.isEmpty()) {
            List<Map<String, Object>> rev = new ArrayList<>();
            for (ReviewResponseDto r : reviews.stream().limit(MAX_JSONLD_REVIEWS).toList()) {
                Map<String, Object> rm = new LinkedHashMap<>();
                rm.put("@type", "Review");
                rm.put("author", Map.of("@type", "Person", "name", nz(r.getUserDisplayName())));
                Map<String, Object> rr = new LinkedHashMap<>();
                rr.put("@type", "Rating");
                rr.put("ratingValue", r.getRating() != null ? r.getRating() : 0);
                rr.put("bestRating", 10);
                rr.put("worstRating", 1);
                rm.put("reviewRating", rr);
                if (notBlank(r.getText())) rm.put("reviewBody", r.getText());
                if (r.getUpdatedAt() != null) rm.put("datePublished", r.getUpdatedAt().toString().substring(0, 10));
                rev.add(rm);
            }
            m.put("review", rev);
        }
        return m;
    }

    private Map<String, Object> buildWebsiteJsonLd(String baseUrl) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("@context", "https://schema.org");
        m.put("@type", "WebSite");
        m.put("name", "AdRush");
        m.put("url", baseUrl + "/");
        return m;
    }

    private String jsonLd(Map<String, Object> data) {
        try {
            // <\/ — защита от выхода из <script> через </script> в тексте отзыва
            String json = objectMapper.writeValueAsString(data).replace("</", "<\\/");
            return "<script type=\"application/ld+json\">" + json + "</script>";
        } catch (Exception e) {
            return "";
        }
    }

    /* ─────────── мелкие хелперы ─────────── */

    private String buildDrinkDescription(DrinkResponseDto d) {
        if (notBlank(d.getDescription())) return truncate(d.getDescription(), 300);
        String base = "Отзывы и оценка энергетика " + d.getName();
        if (d.getReviewCount() > 0) base += " — " + round1(d.getAverageRating()) + "/10 (" + d.getReviewCount() + " отзывов)";
        return base + " на AdRush.";
    }

    private static String canonical(String url) {
        return "<link rel=\"canonical\" href=\"" + esc(url) + "\">";
    }

    private static String metaName(String name, String content) {
        return "<meta name=\"" + name + "\" content=\"" + esc(content) + "\">";
    }

    private static String og(String property, String content) {
        return "<meta property=\"" + property + "\" content=\"" + esc(content) + "\">";
    }

    private static String absUrl(String base, String path) {
        if (!notBlank(path)) return null;
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        return base + (path.startsWith("/") ? "" : "/") + path;
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static String truncate(String s, int max) {
        s = s.trim();
        return s.length() <= max ? s : s.substring(0, max).trim() + "…";
    }

    private static String replaceFirst(String input, String regex, String replacement) {
        return input.replaceFirst(regex, Matcher.quoteReplacement(replacement));
    }

    /** Экранирование для вставки в HTML-текст и атрибуты. */
    private static String esc(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&' -> b.append("&amp;");
                case '<' -> b.append("&lt;");
                case '>' -> b.append("&gt;");
                case '"' -> b.append("&quot;");
                case '\'' -> b.append("&#39;");
                default -> b.append(c);
            }
        }
        return b.toString();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String firstNonBlank(String... vals) {
        for (String v : vals) if (v != null && !v.isBlank()) return v;
        return "";
    }
}
