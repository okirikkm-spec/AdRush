package com.adrenrush.web.controller;

import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.ReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Собственные оценки пользователя. Лежит отдельно от ReviewController: тот весь
 * висит на /api/drinks/{drinkId}, а здесь оценки нужны сразу по всему каталогу
 * (мини-игры собирают состав «только оценённые мной»).
 */
@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
public class MyReviewController {

    private final ReviewService reviewService;

    /** Оценки текущего пользователя: id энергетика → балл. Гостю — 401 (см. SecurityConfig). */
    @GetMapping("/mine")
    public ResponseEntity<Map<Long, Integer>> mine(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(reviewService.getMyRatings(currentUser.getId()));
    }
}
