package com.adrenrush.web.dto;

import com.adrenrush.web.entity.User;
import lombok.Data;

import java.time.Instant;

/**
 * Карточка пользователя для всплывающего мини-профиля (клик по автору отзыва).
 * Набор полей публичный — эндпоинт открыт и без токена, почта и модерационные
 * поля сюда не попадают.
 */
@Data
public class UserCardDto {
    private Long id;
    private String username;
    private String displayName;
    private String role;
    private String avatarUrl;

    /* Обложка с кадрированием — фронт рисует её тем же BannerLayer, что и на
       странице профиля, поэтому кадр в карточке совпадает с профилем. */
    private String bannerUrl;
    private Double bannerScale;
    private Integer bannerRotate;
    private Double bannerOffsetX;
    private Double bannerOffsetY;

    /** Дата регистрации. */
    private Instant createdAt;

    private boolean profilePrivate;

    /** Статистика по отзывам; null — профиль закрыт от этого зрителя. */
    private Stats stats;

    /**
     * Сводка активности. Средняя оценка и «любимое» — null, когда отзывов ещё нет.
     *
     * @param reviewCount       сколько отзывов оставил
     * @param averageRating     средняя выставленная оценка (округлена до десятых)
     * @param reactionsReceived сколько реакций собрали его отзывы
     * @param lastReviewAt      когда последний раз писал отзыв
     * @param topDrinkId        самый высоко оценённый энергетик
     */
    public record Stats(
        int reviewCount,
        Double averageRating,
        int reactionsReceived,
        Instant lastReviewAt,
        Long topDrinkId,
        String topDrinkName,
        Integer topDrinkRating
    ) {}

    public static UserCardDto from(User user) {
        UserCardDto dto = new UserCardDto();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setDisplayName(user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
        dto.setRole(user.getRole().name());
        dto.setAvatarUrl(user.getAvatarPath());
        dto.setBannerUrl(user.getBannerPath());
        dto.setBannerScale(user.getBannerScale());
        dto.setBannerRotate(user.getBannerRotate());
        dto.setBannerOffsetX(user.getBannerOffsetX());
        dto.setBannerOffsetY(user.getBannerOffsetY());
        dto.setCreatedAt(user.getCreatedAt());
        dto.setProfilePrivate(user.isProfilePrivate());
        return dto;
    }
}
