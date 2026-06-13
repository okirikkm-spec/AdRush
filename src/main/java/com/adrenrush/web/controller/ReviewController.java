package com.adrenrush.web.controller;

import com.adrenrush.web.dto.ReviewResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.ReviewService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/drinks/{drinkId}")
@RequiredArgsConstructor
public class ReviewController {

    private final ReviewService reviewService;

    /** Список отзывов на энергетик (доступно без входа). */
    @GetMapping("/reviews")
    public ResponseEntity<List<ReviewResponseDto>> reviews(@PathVariable Long drinkId,
                                                           @AuthenticationPrincipal User currentUser) {
        Long uid = currentUser != null ? currentUser.getId() : null;
        return ResponseEntity.ok(reviewService.getReviewsForDrink(drinkId, uid));
    }

    /** Сводка оценок: average, count, myRating. */
    @GetMapping("/rating")
    public ResponseEntity<Map<String, Object>> rating(@PathVariable Long drinkId,
                                                      @AuthenticationPrincipal User currentUser) {
        Long uid = currentUser != null ? currentUser.getId() : null;
        return ResponseEntity.ok(reviewService.getRatingInfo(drinkId, uid));
    }

    /** Поставить/обновить оценку и отзыв (требуется вход). */
    @PostMapping("/reviews")
    public ResponseEntity<ReviewResponseDto> upsert(@PathVariable Long drinkId,
                                                    @AuthenticationPrincipal User currentUser,
                                                    @RequestBody Map<String, Object> body) {
        Integer rating = body.get("rating") != null ? ((Number) body.get("rating")).intValue() : null;
        String text = body.get("text") != null ? body.get("text").toString() : null;
        return ResponseEntity.ok(reviewService.upsert(drinkId, currentUser, rating, text));
    }

    @DeleteMapping("/reviews/me")
    public ResponseEntity<Void> deleteMine(@PathVariable Long drinkId,
                                           @AuthenticationPrincipal User currentUser) {
        reviewService.delete(drinkId, currentUser);
        return ResponseEntity.noContent().build();
    }
}
