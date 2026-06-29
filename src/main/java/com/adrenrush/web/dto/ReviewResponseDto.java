package com.adrenrush.web.dto;

import com.adrenrush.web.entity.Review;
import com.adrenrush.web.entity.ReviewReaction;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Data
public class ReviewResponseDto {
    private Long id;
    private Long drinkId;
    private String drinkName;
    private Long userId;
    private String userDisplayName;
    private String userAvatarUrl;
    private Integer rating;
    private String text;
    private Instant updatedAt;
    private boolean mine;
    /** Сводка реакций по эмодзи (по убыванию количества). */
    private List<ReactionCount> reactions = List.of();
    /** Эмодзи-реакция текущего пользователя на этот отзыв, либо null. */
    private String myReaction;

    public static ReviewResponseDto from(Review review, Long currentUserId) {
        return from(review, currentUserId, null);
    }

    /**
     * @param reactions все реакции на этот отзыв; null — не заполнять сводку
     *                  (например, для превью отзыва в чате, где реакции не нужны).
     */
    public static ReviewResponseDto from(Review review, Long currentUserId, List<ReviewReaction> reactions) {
        ReviewResponseDto dto = new ReviewResponseDto();
        dto.setId(review.getId());
        dto.setDrinkId(review.getDrink().getId());
        dto.setDrinkName(review.getDrink().getName());
        dto.setUserId(review.getUser().getId());
        String name = review.getUser().getDisplayName();
        dto.setUserDisplayName(name != null ? name : review.getUser().getUsername());
        dto.setUserAvatarUrl(review.getUser().getAvatarPath());
        dto.setRating(review.getRating());
        dto.setText(review.getText());
        dto.setUpdatedAt(review.getUpdatedAt());
        dto.setMine(currentUserId != null && currentUserId.equals(review.getUser().getId()));
        if (reactions != null) {
            // Сохраняем порядок первого появления эмодзи, затем сортируем по количеству.
            Map<String, Integer> counts = new LinkedHashMap<>();
            for (ReviewReaction r : reactions) {
                counts.merge(r.getEmoji(), 1, Integer::sum);
                if (currentUserId != null && currentUserId.equals(r.getUser().getId())) {
                    dto.setMyReaction(r.getEmoji());
                }
            }
            dto.setReactions(counts.entrySet().stream()
                .map(e -> new ReactionCount(e.getKey(), e.getValue()))
                .sorted((a, b) -> Integer.compare(b.getCount(), a.getCount()))
                .toList());
        }
        return dto;
    }

    /** Пара «эмодзи → сколько раз поставлена». */
    @Data
    @AllArgsConstructor
    public static class ReactionCount {
        private String emoji;
        private int count;
    }
}
