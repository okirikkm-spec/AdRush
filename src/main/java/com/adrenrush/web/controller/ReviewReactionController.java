package com.adrenrush.web.controller;

import com.adrenrush.web.dto.ReviewResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.ReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Реакции на отзывы. Требуют входа (см. SecurityConfig: /api/reviews/** — authenticated). */
@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
public class ReviewReactionController {

    private final ReviewService reviewService;

    /**
     * Поставить эмодзи-реакцию на отзыв. Повторный клик по той же реакции снимает её,
     * другой эмодзи — заменяет. Возвращает обновлённый отзыв со сводкой реакций.
     */
    @PostMapping("/{reviewId}/reactions")
    public ResponseEntity<ReviewResponseDto> react(@PathVariable Long reviewId,
                                                   @AuthenticationPrincipal User currentUser,
                                                   @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(reviewService.react(reviewId, currentUser, body.get("emoji")));
    }
}
