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

    public static UserBriefDto from(User user) {
        UserBriefDto dto = new UserBriefDto();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setDisplayName(user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
        dto.setAvatarUrl(user.getAvatarPath());
        dto.setSystem(user.isSystem());
        return dto;
    }
}
