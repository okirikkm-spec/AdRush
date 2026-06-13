package com.adrenrush.web.service;

import com.adrenrush.web.dto.ReviewResponseDto;
import com.adrenrush.web.entity.Drink;
import com.adrenrush.web.entity.Review;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.DrinkRepository;
import com.adrenrush.web.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final DrinkRepository drinkRepository;

    @Transactional(readOnly = true)
    public List<ReviewResponseDto> getReviewsForDrink(Long drinkId, Long currentUserId) {
        return reviewRepository.findByDrinkIdOrderByUpdatedAtDesc(drinkId).stream()
            .map(r -> ReviewResponseDto.from(r, currentUserId))
            .toList();
    }

    @Transactional(readOnly = true)
    public List<ReviewResponseDto> getReviewsByUser(Long userId, Long currentUserId) {
        return reviewRepository.findByUserIdOrderByUpdatedAtDesc(userId).stream()
            .map(r -> ReviewResponseDto.from(r, currentUserId))
            .toList();
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

        return ReviewResponseDto.from(review, user.getId());
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
