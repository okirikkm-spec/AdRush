package com.adrenrush.web.service;

import com.adrenrush.web.dto.ReviewResponseDto;
import com.adrenrush.web.dto.UserResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final ReviewService reviewService;
    private final StorageService storageService;
    private final TotpService totpService;
    private final BCryptPasswordEncoder passwordEncoder;

    @Transactional
    public UserResponseDto updateProfile(User user, String displayName) {
        if (displayName != null && !displayName.isBlank()) {
            user.setDisplayName(displayName.trim());
        }
        userRepository.save(user);
        return UserResponseDto.from(user);
    }

    @Transactional
    public UserResponseDto setPrivacy(User user, boolean isPrivate) {
        user.setProfilePrivate(isPrivate);
        userRepository.save(user);
        return UserResponseDto.from(user);
    }

    @Transactional
    public UserResponseDto updateAvatar(User user, MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw ApiException.badRequest("Можно загружать только изображения");
        }
        String ext = contentType.substring(contentType.indexOf('/') + 1).replaceAll("[^a-zA-Z0-9]", "");
        if (ext.isBlank()) ext = "jpg";

        String key = "avatars/" + user.getId() + "-" + System.currentTimeMillis() + "." + ext;
        try {
            String url = storageService.store(key, file.getInputStream(), contentType);
            user.setAvatarPath(url);
            userRepository.save(user);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INSUFFICIENT_STORAGE, "Не удалось сохранить аватарку");
        }
        return UserResponseDto.from(user);
    }

    @Transactional
    public void changePassword(User user, String oldPassword, String newPassword) {
        if (!passwordEncoder.matches(oldPassword, user.getPassword())) {
            throw ApiException.badRequest("Неверный текущий пароль");
        }
        if (newPassword == null || newPassword.length() < 4) {
            throw ApiException.badRequest("Пароль должен содержать не менее 4 символов");
        }
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    /* ── 2FA ── */

    @Transactional
    public Map<String, String> start2fa(User user) {
        String secret = totpService.generateSecret();
        user.setTotpSecret(secret);
        user.setTotpEnabled(false); // подтверждается отдельным шагом
        userRepository.save(user);

        String otpUrl = totpService.buildOtpAuthUrl(user.getUsername(), secret);
        Map<String, String> result = new HashMap<>();
        result.put("secret", secret);
        result.put("otpauthUrl", otpUrl);
        result.put("qrDataUrl", totpService.buildQrDataUrl(otpUrl));
        return result;
    }

    @Transactional
    public void enable2fa(User user, String code) {
        if (user.getTotpSecret() == null) {
            throw ApiException.badRequest("Сначала сгенерируйте секрет (setup)");
        }
        if (!totpService.verifyCode(user.getTotpSecret(), code)) {
            throw ApiException.badRequest("Неверный код — проверьте приложение-аутентификатор");
        }
        user.setTotpEnabled(true);
        userRepository.save(user);
    }

    @Transactional
    public void disable2fa(User user, String code) {
        if (!user.isTotpEnabled()) return;
        if (!totpService.verifyCode(user.getTotpSecret(), code)) {
            throw ApiException.badRequest("Неверный код");
        }
        user.setTotpEnabled(false);
        user.setTotpSecret(null);
        userRepository.save(user);
    }

    /* ── Публичный профиль ── */

    @Transactional(readOnly = true)
    public Map<String, Object> getPublicProfile(Long userId, User currentUser) {
        User target = userRepository.findById(userId)
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));

        boolean isSelf = currentUser != null && currentUser.getId().equals(target.getId());
        boolean isAdmin = currentUser != null && currentUser.getRole() == RoleEnum.ADMIN;
        boolean canSeeReviews = !target.isProfilePrivate() || isSelf || isAdmin;

        Map<String, Object> result = new HashMap<>();
        result.put("user", UserResponseDto.from(target));
        result.put("isPrivate", target.isProfilePrivate());
        result.put("canSeeReviews", canSeeReviews);

        if (canSeeReviews) {
            List<ReviewResponseDto> reviews = reviewService.getReviewsByUser(
                target.getId(), currentUser != null ? currentUser.getId() : null);
            result.put("reviews", reviews);
        } else {
            result.put("reviews", List.of());
        }
        return result;
    }
}
