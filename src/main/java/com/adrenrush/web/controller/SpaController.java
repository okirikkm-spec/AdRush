package com.adrenrush.web.controller;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.dto.ReviewResponseDto;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.service.DrinkService;
import com.adrenrush.web.service.ReviewService;
import com.adrenrush.web.service.SeoService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Отдаёт React-приложение для клиентских маршрутов. Для крауло-критичных страниц (главная,
 * карточка энергетика) дополнительно вшивает серверный SEO-HTML (мета, Open Graph, JSON-LD,
 * видимый роботу контент) через {@link SeoService}.
 */
@RestController
@RequiredArgsConstructor
public class SpaController {

    private static final Resource INDEX_HTML = new ClassPathResource("static/index.html");

    private final SeoService seoService;
    private final DrinkService drinkService;
    private final ReviewService reviewService;

    /** Главная: SEO-мета + WebSite JSON-LD + крауло-видимый список энергетиков. */
    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> home(HttpServletRequest request) {
        List<DrinkResponseDto> drinks = drinkService.listAllSortedByRating();
        return html(seoService.renderHome(SeoService.baseUrl(request), drinks));
    }

    /** Карточка энергетика: Product + AggregateRating + Review (звёзды в выдаче) + контент. */
    @GetMapping(value = "/drink/{id}", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> drink(@PathVariable Long id, HttpServletRequest request) {
        String base = SeoService.baseUrl(request);
        try {
            DrinkResponseDto d = drinkService.getById(id);
            List<ReviewResponseDto> reviews = reviewService.getReviewsForDrink(id, null);
            return html(seoService.renderDrink(base, d, reviews));
        } catch (ApiException e) {
            // Несуществующий энергетик — отдаём 404 (а не 200 на SPA), но всё ещё с index.html.
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .contentType(MediaType.TEXT_HTML)
                .body(seoService.renderNotFound());
        }
    }

    /** Остальные клиентские маршруты — обычный SPA без серверного рендера. */
    @GetMapping(
        value = {"/login", "/register", "/recover", "/profile", "/profile/**",
                 "/user/**", "/admin", "/admin/**",
                 "/chats", "/chats/**"},
        produces = MediaType.TEXT_HTML_VALUE
    )
    public ResponseEntity<Resource> spa() {
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(INDEX_HTML);
    }

    private ResponseEntity<String> html(String body) {
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(body);
    }
}
