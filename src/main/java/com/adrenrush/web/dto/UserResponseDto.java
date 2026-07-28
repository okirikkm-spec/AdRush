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
    private String bannerUrl;
    private String bannerFit;
    private String bannerPos;
    private boolean profilePrivate;
    private boolean totpEnabled;
    // Почта намеренно не входит в DTO: этот же объект отдаётся в публичном профиле
    // (GET /api/users/{id}, permitAll). Владелец получает адрес через GET /api/auth/me/email.

    public static UserResponseDto from(User user) {
        UserResponseDto dto = new UserResponseDto();
        dto.setId(user.getId());
        dto.setUsername(user.getUsername());
        dto.setDisplayName(user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
        dto.setRole(user.getRole().name());
        dto.setAvatarUrl(user.getAvatarPath());
        dto.setBannerUrl(user.getBannerPath());
        dto.setBannerFit(user.getBannerFit());
        dto.setBannerPos(user.getBannerPos());
        dto.setProfilePrivate(user.isProfilePrivate());
        dto.setTotpEnabled(user.isTotpEnabled());
        return dto;
    }
}
