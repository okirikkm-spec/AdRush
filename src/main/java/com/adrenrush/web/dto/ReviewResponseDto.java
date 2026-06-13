package com.adrenrush.web.dto;

import com.adrenrush.web.entity.Review;
import lombok.Data;

import java.time.Instant;

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

    public static ReviewResponseDto from(Review review, Long currentUserId) {
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
        return dto;
    }
}
