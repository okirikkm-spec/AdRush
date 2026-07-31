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

    /* Пределы кадрирования обложки. Значения приходят с клиента и уходят
       обратно в inline-стиль, поэтому загоняем их в разумные рамки. */
    private static final double SCALE_MIN = 0.2, SCALE_MAX = 5.0;
    private static final double OFFSET_LIMIT = 200.0;   // проценты от размера плашки

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
        String previous = user.getAvatarPath();
        user.setAvatarPath(storeImage(user, file, "avatars", "Не удалось сохранить аватарку"));
        userRepository.save(user);
        discard(previous);
        return UserResponseDto.from(user);
    }

    /** Обложка мини-профиля. Кадрирование можно задать тем же запросом. */
    @Transactional
    public UserResponseDto updateBanner(User user, MultipartFile file,
                                        Double scale, Integer rotate, Double offsetX, Double offsetY) {
        String previous = user.getBannerPath();
        // Папка намеренно называется covers, а не banners: блокировщики рекламы
        // режут запросы к путям со словом "banner" — обложка не грузится у пользователя.
        user.setBannerPath(storeImage(user, file, "covers", "Не удалось сохранить обложку"));
        applyFraming(user, scale, rotate, offsetX, offsetY);
        userRepository.save(user);
        discard(previous);
        return UserResponseDto.from(user);
    }

    /** Изменить кадрирование, не трогая саму картинку. */
    @Transactional
    public UserResponseDto updateBannerFraming(User user,
                                               Double scale, Integer rotate, Double offsetX, Double offsetY) {
        if (user.getBannerPath() == null) {
            throw ApiException.badRequest("Обложка не загружена");
        }
        applyFraming(user, scale, rotate, offsetX, offsetY);
        userRepository.save(user);
        return UserResponseDto.from(user);
    }

    @Transactional
    public UserResponseDto removeBanner(User user) {
        String previous = user.getBannerPath();
        user.setBannerPath(null);
        user.setBannerScale(null);
        user.setBannerRotate(null);
        user.setBannerOffsetX(null);
        user.setBannerOffsetY(null);
        userRepository.save(user);
        discard(previous);
        return UserResponseDto.from(user);
    }

    /** Приводит кадрирование к допустимым значениям; null трактуется как «по умолчанию». */
    private void applyFraming(User user, Double scale, Integer rotate, Double offsetX, Double offsetY) {
        user.setBannerScale(clamp(scale == null ? 1.0 : scale, SCALE_MIN, SCALE_MAX));
        // Поворот сводим к 0..359, чтобы не копить обороты при многократной правке
        int deg = rotate == null ? 0 : rotate % 360;
        user.setBannerRotate(deg < 0 ? deg + 360 : deg);
        user.setBannerOffsetX(clamp(offsetX == null ? 0.0 : offsetX, -OFFSET_LIMIT, OFFSET_LIMIT));
        user.setBannerOffsetY(clamp(offsetY == null ? 0.0 : offsetY, -OFFSET_LIMIT, OFFSET_LIMIT));
    }

    private double clamp(double value, double min, double max) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return min == SCALE_MIN ? 1.0 : 0.0;
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Убирает файл, на который больше никто не ссылается.
     * Вызывается только после сохранения нового значения: если загрузка упала,
     * прежняя картинка остаётся на месте. Ошибки удаления StorageService гасит
     * сам — потерянный файл не повод заваливать запрос пользователю.
     */
    private void discard(String previousPath) {
        if (previousPath != null && !previousPath.isBlank()) {
            storageService.delete(previousPath);
        }
    }

    /** Общая часть загрузки картинки: проверка типа, имя объекта, запись в хранилище. */
    private String storeImage(User user, MultipartFile file, String folder, String errorMessage) {
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw ApiException.badRequest("Можно загружать только изображения");
        }
        String ext = contentType.substring(contentType.indexOf('/') + 1).replaceAll("[^a-zA-Z0-9]", "");
        if (ext.isBlank()) ext = "jpg";

        String key = folder + "/" + user.getId() + "-" + System.currentTimeMillis() + "." + ext;
        try {
            return storageService.store(key, file.getInputStream(), contentType);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INSUFFICIENT_STORAGE, errorMessage);
        }
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
