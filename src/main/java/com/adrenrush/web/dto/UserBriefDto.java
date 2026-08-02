package com.adrenrush.web.dto;

import com.adrenrush.web.entity.User;
import lombok.Data;

/** Краткая карточка пользователя для чатов (без приватных полей). */
@Data
public class UserBriefDto {
    private Long id;
    private String username;
    private String displayName;
    private String avatarUrl;
    /** Служебный аккаунт «Система» — на фронте по нему беседа становится «только для чтения». */
    private boolean system;

    /* Обложка профиля с кадрированием — фронт рисует её в шапке беседы и в списке
       участников тем же BannerLayer, что и на странице профиля. Заполняется только
       в fromWithBanner: у отправителя каждого сообщения эти поля дублировались бы
       на всю историю переписки. */
    private String bannerUrl;
    private Double bannerScale;
    private Integer bannerRotate;
    private Double bannerOffsetX;
    private Double bannerOffsetY;

    public static UserBriefDto from(User user) {
        UserBriefDto dto = new UserBriefDto();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setDisplayName(user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
        dto.setAvatarUrl(user.getAvatarPath());
        dto.setSystem(user.isSystem());
        return dto;
    }

    /** То же + обложка профиля (участники беседы, поиск собеседников). */
    public static UserBriefDto fromWithBanner(User user) {
        UserBriefDto dto = from(user);
        dto.setBannerUrl(user.getBannerPath());
        dto.setBannerScale(user.getBannerScale());
        dto.setBannerRotate(user.getBannerRotate());
        dto.setBannerOffsetX(user.getBannerOffsetX());
        dto.setBannerOffsetY(user.getBannerOffsetY());
        return dto;
    }
}
