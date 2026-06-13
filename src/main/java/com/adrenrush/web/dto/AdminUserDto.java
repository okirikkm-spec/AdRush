package com.adrenrush.web.dto;

import com.adrenrush.web.entity.User;
import lombok.Data;

import java.time.Instant;

/** Карточка пользователя для админ-панели (со скрытыми полями для модерации). */
@Data
public class AdminUserDto {
    private Long id;
    private String username;
    private String displayName;
    private String role;
    private String avatarUrl;
    private Instant bannedUntil;
    private String banReason;
    private String registrationIp;
    private String lastIp;
    private String lastFingerprint;
    private int reviewCount;
    private int linkedCount;
    private boolean superAdmin;

    public static AdminUserDto from(User u, int reviewCount, int linkedCount, boolean superAdmin) {
        AdminUserDto dto = new AdminUserDto();
        dto.setId(u.getId());
        dto.setUsername(u.getUsername());
        dto.setDisplayName(u.getDisplayName() != null ? u.getDisplayName() : u.getUsername());
        dto.setRole(u.getRole().name());
        dto.setAvatarUrl(u.getAvatarPath());
        dto.setBannedUntil(u.getBannedUntil());
        dto.setBanReason(u.getBanReason());
        dto.setRegistrationIp(u.getRegistrationIp());
        dto.setLastIp(u.getLastIp());
        dto.setLastFingerprint(u.getLastFingerprint());
        dto.setReviewCount(reviewCount);
        dto.setLinkedCount(linkedCount);
        dto.setSuperAdmin(superAdmin);
        return dto;
    }
}
