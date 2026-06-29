package com.adrenrush.web.controller;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.service.DrinkService;
import com.adrenrush.web.service.SeoService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** robots.txt и динамический sitemap.xml (со всеми энергетиками из БД). */
@RestController
@RequiredArgsConstructor
public class SeoController {

    private final DrinkService drinkService;

    @GetMapping(value = "/robots.txt", produces = MediaType.TEXT_PLAIN_VALUE)
    public String robots(HttpServletRequest request) {
        String base = SeoService.baseUrl(request);
        return """
            User-agent: *
            Allow: /
            Disallow: /api/
            Disallow: /admin
            Disallow: /chats
            Disallow: /profile
            Sitemap: %s/sitemap.xml
            """.formatted(base);
    }

    @GetMapping(value = "/sitemap.xml", produces = MediaType.APPLICATION_XML_VALUE)
    public String sitemap(HttpServletRequest request) {
        String base = SeoService.baseUrl(request);
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        sb.append(url(base + "/", "1.0", "daily"));
        for (DrinkResponseDto d : drinkService.listAllSortedByRating()) {
            sb.append(url(base + "/drink/" + d.getId(), "0.8", "weekly"));
        }
        sb.append("</urlset>\n");
        return sb.toString();
    }

    private static String url(String loc, String priority, String changefreq) {
        return "  <url><loc>" + xml(loc) + "</loc><changefreq>" + changefreq
            + "</changefreq><priority>" + priority + "</priority></url>\n";
    }

    private static String xml(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
