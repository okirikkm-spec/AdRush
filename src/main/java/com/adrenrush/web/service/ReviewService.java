package com.adrenrush.web.service;

import com.adrenrush.web.dto.ReviewResponseDto;
import com.adrenrush.web.entity.Drink;
import com.adrenrush.web.entity.Review;
import com.adrenrush.web.entity.ReviewReaction;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.DrinkRepository;
import com.adrenrush.web.repository.ReviewReactionRepository;
import com.adrenrush.web.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ReviewService {

    /** Допустимый набор эмодзи-реакций (синхронизирован с фронтом ReviewSection.jsx). */
    public static final Set<String> ALLOWED_REACTIONS = Set.of("👍", "👎", "❤️", "🔥", "😂", "😮", "😢");

    private final ReviewRepository reviewRepository;
    private final DrinkRepository drinkRepository;
    private final ReviewReactionRepository reactionRepository;

    @Transactional(readOnly = true)
    public List<ReviewResponseDto> getReviewsForDrink(Long drinkId, Long currentUserId) {
        List<Review> reviews = reviewRepository.findByDrinkIdOrderByUpdatedAtDesc(drinkId);
        Map<Long, List<ReviewReaction>> byReview = loadReactions(reviews);
        return reviews.stream()
            .map(r -> ReviewResponseDto.from(r, currentUserId, byReview.getOrDefault(r.getId(), List.of())))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<ReviewResponseDto> getReviewsByUser(Long userId, Long currentUserId) {
        List<Review> reviews = reviewRepository.findByUserIdOrderByUpdatedAtDesc(userId);
        Map<Long, List<ReviewReaction>> byReview = loadReactions(reviews);
        return reviews.stream()
            .map(r -> ReviewResponseDto.from(r, currentUserId, byReview.getOrDefault(r.getId(), List.of())))
            .toList();
    }

    /** Пакетно загружает реакции для списка отзывов и группирует их по id отзыва. */
    private Map<Long, List<ReviewReaction>> loadReactions(List<Review> reviews) {
        if (reviews.isEmpty()) return Map.of();
        List<Long> ids = reviews.stream().map(Review::getId).toList();
        Map<Long, List<ReviewReaction>> map = new HashMap<>();
        for (ReviewReaction rr : reactionRepository.findByReviewIdIn(ids)) {
            map.computeIfAbsent(rr.getReview().getId(), k -> new ArrayList<>()).add(rr);
        }
        return map;
    }

    /**
     * Ставит/меняет/снимает реакцию текущего пользователя на отзыв.
     * Повторная та же реакция — снимается, другая — заменяет прежнюю.
     */
    @Transactional
    public ReviewResponseDto react(Long reviewId, User user, String emoji) {
        if (emoji == null || !ALLOWED_REACTIONS.contains(emoji)) {
            throw ApiException.badRequest("Недопустимая реакция");
        }
        Review review = reviewRepository.findById(reviewId)
            .orElseThrow(() -> ApiException.notFound("Отзыв не найден"));

        ReviewReaction existing = reactionRepository.findByReviewIdAndUserId(reviewId, user.getId()).orElse(null);
        if (existing != null) {
            if (existing.getEmoji().equals(emoji)) {
                reactionRepository.delete(existing);   // повторный клик — снять реакцию
            } else {
                existing.setEmoji(emoji);              // сменить эмодзи
                reactionRepository.save(existing);
            }
        } else {
            ReviewReaction rr = new ReviewReaction();
            rr.setReview(review);
            rr.setUser(user);
            rr.setEmoji(emoji);
            reactionRepository.save(rr);
        }
        return ReviewResponseDto.from(review, user.getId(), reactionRepository.findByReviewId(reviewId));
    }

    /** Создаёт или обновляет отзыв текущего пользователя (одна оценка на напиток). */
    @Transactional
    public ReviewResponseDto upsert(Long drinkId, User user, Integer rating, String text) {
        if (rating == null || rating < 1 || rating > 10) {
            throw ApiException.badRequest("Оценка должна быть от 1 до 10");
        }
        Drink drink = drinkRepository.findById(drinkId)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));

        Review review = reviewRepository.findByDrinkIdAndUserId(drinkId, user.getId())
            .orElseGet(Review::new);
        boolean isNew = review.getId() == null;
        review.setDrink(drink);
        review.setUser(user);
        review.setRating(rating);
        review.setText(text);
        if (isNew) review.setCreatedAt(Instant.now());
        review.setUpdatedAt(Instant.now());
        reviewRepository.save(review);

        List<ReviewReaction> reactions = isNew ? List.of() : reactionRepository.findByReviewId(review.getId());
        return ReviewResponseDto.from(review, user.getId(), reactions);
    }

    @Transactional
    public void delete(Long drinkId, User user) {
        Review review = reviewRepository.findByDrinkIdAndUserId(drinkId, user.getId())
            .orElseThrow(() -> ApiException.notFound("Отзыв не найден"));
        reviewRepository.delete(review);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getRatingInfo(Long drinkId, Long userId) {
        Double avg = reviewRepository.getAverageByDrinkId(drinkId);
        Integer count = reviewRepository.getCountByDrinkId(drinkId);
        Integer myRating = null;
        if (userId != null) {
            myRating = reviewRepository.findByDrinkIdAndUserId(drinkId, userId)
                .map(Review::getRating)
                .orElse(null);
        }
        return Map.of(
            "average", avg != null ? Math.round(avg * 10.0) / 10.0 : 0.0,
            "count", count != null ? count : 0,
            "myRating", myRating != null ? myRating : 0
        );
    }
}
