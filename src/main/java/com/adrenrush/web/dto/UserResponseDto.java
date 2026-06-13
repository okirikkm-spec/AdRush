package com.adrenrush.web.dto;

import com.adrenrush.web.entity.User;
import lombok.Data;

@Data
public class UserResponseDto {
    private Long id;
    private String username;
    private String displayName;
    private String role;
    private String avatarUrl;
    private boolean profilePrivate;
    private boolean totpEnabled;

    public static UserResponseDto from(User user) {
        UserResponseDto dto = new UserResponseDto();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setDisplayName(user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
        dto.setRole(user.getRole().name());
        dto.setAvatarUrl(user.getAvatarPath());
        dto.setProfilePrivate(user.isProfilePrivate());
        dto.setTotpEnabled(user.isTotpEnabled());
        return dto;
    }
}
