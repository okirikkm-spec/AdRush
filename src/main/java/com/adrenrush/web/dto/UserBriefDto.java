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

    public static UserBriefDto from(User user) {
        UserBriefDto dto = new UserBriefDto();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setDisplayName(user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
        dto.setAvatarUrl(user.getAvatarPath());
        return dto;
    }
}
