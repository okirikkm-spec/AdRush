package com.adrenrush.web.service;

import com.adrenrush.web.dto.AdminUserDto;
import com.adrenrush.web.entity.Review;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.DrinkPhotoRepository;
import com.adrenrush.web.repository.NotificationRepository;
import com.adrenrush.web.repository.ReviewRepository;
import com.adrenrush.web.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final ReviewRepository reviewRepository;
    private final NotificationRepository notificationRepository;
    private final DrinkPhotoRepository photoRepository;
    private final NotificationService notificationService;
    private final SuperAdmins superAdmins;

    /* ── Список пользователей ── */

    @Transactional(readOnly = true)
    public List<AdminUserDto> listUsers() {
        return userRepository.findAllByOrderByIdAsc().stream()
            .map(this::toDto)
            .toList();
    }

    @Transactional(readOnly = true)
    public List<AdminUserDto> linkedAccounts(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));
        return findLinked(u).stream().map(this::toDto).toList();
    }

    /* ── Бан ── */

    /**
     * Банит пользователя (и опционально выбранные связанные аккаунты).
     * @param durationDays null/0 — навсегда, иначе временный бан на N дней.
     */
    @Transactional
    public Map<String, Object> ban(Long targetId, String reason, Integer durationDays,
                                   boolean deleteComments, List<Long> alsoBanUserIds) {
        if (reason == null || reason.isBlank()) {
            throw ApiException.badRequest("Укажите причину бана");
        }
        List<Long> ids = new ArrayList<>();
        ids.add(targetId);
        if (alsoBanUserIds != null) ids.addAll(alsoBanUserIds);

        int banned = 0;
        int deletedComments = 0;
        for (Long id : ids.stream().distinct().toList()) {
            User u = userRepository.findById(id).orElse(null);
            // админов и супер-админов не баним
            if (u == null || u.getRole() == RoleEnum.ADMIN || superAdmins.is(u.getUsername())) continue;
            if (deleteComments) {
                deletedComments += reviewRepository.countByUserId(u.getId());
                reviewRepository.deleteByUserId(u.getId());
            }
            applyBan(u, reason, durationDays);
            banned++;
        }
        return Map.of("banned", banned, "deletedComments", deletedComments);
    }

    private void applyBan(User u, String reason, Integer durationDays) {
        u.setRole(RoleEnum.BANNED);
        u.setBanReason(reason);
        u.setBannedUntil(durationDays != null && durationDays > 0
            ? Instant.now().plus(durationDays, ChronoUnit.DAYS) : null);
        userRepository.save(u);

        String until = u.getBannedUntil() != null ? "до " + u.getBannedUntil() : "навсегда";
        notificationService.notify(u, "BANNED", "Аккаунт заблокирован (" + until + "). Причина: " + reason);
    }

    @Transactional
    public void unban(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));
        u.setRole(RoleEnum.USER);
        u.setBannedUntil(null);
        u.setBanReason(null);
        userRepository.save(u);
        notificationService.notify(u, "UNBANNED", "Блокировка вашего аккаунта снята.");
    }

    /* ── Полное удаление пользователя ── */

    @Transactional
    public void deleteUser(Long userId) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));
        if (u.getRole() == RoleEnum.ADMIN) {
            throw ApiException.badRequest("Нельзя удалить администратора");
        }
        reviewRepository.deleteByUserId(userId);
        notificationRepository.deleteByUserId(userId);
        photoRepository.detachUploader(userId);
        userRepository.delete(u);
    }

    /* ── Удаление отзыва с указанием причины ── */

    @Transactional
    public void deleteReview(Long reviewId, String reason) {
        Review r = reviewRepository.findById(reviewId)
            .orElseThrow(() -> ApiException.notFound("Отзыв не найден"));
        User author = r.getUser();
        String drinkName = r.getDrink().getName();
        reviewRepository.delete(r);

        String msg = "Ваш отзыв на «" + drinkName + "» удалён модератором."
            + (reason != null && !reason.isBlank() ? " Причина: " + reason : "");
        notificationService.notify(author, "REVIEW_DELETED", msg);
    }

    /* ── helpers ── */

    private List<User> findLinked(User u) {
        Set<String> ips = new HashSet<>();
        if (u.getRegistrationIp() != null) ips.add(u.getRegistrationIp());
        if (u.getLastIp() != null) ips.add(u.getLastIp());

        Set<String> fps = new HashSet<>();
        if (u.getRegistrationFingerprint() != null) fps.add(u.getRegistrationFingerprint());
        if (u.getLastFingerprint() != null) fps.add(u.getLastFingerprint());

        if (ips.isEmpty() && fps.isEmpty()) return List.of();
        // JPQL не допускает пустой IN — подставляем нейтральный sentinel,
        // который заведомо не совпадёт ни с одним реальным IP/отпечатком
        if (ips.isEmpty()) ips.add("__none__");
        if (fps.isEmpty()) fps.add("__none__");

        return userRepository.findLinked(ips, fps, u.getId());
    }

    private AdminUserDto toDto(User u) {
        int reviews = reviewRepository.countByUserId(u.getId());
        int linked = findLinked(u).size();
        return AdminUserDto.from(u, reviews, linked, superAdmins.is(u.getUsername()));
    }

    /* ── Выдача/снятие админки (только супер-админ) ── */

    @Transactional
    public void setAdminRole(String callerUsername, Long targetId, boolean makeAdmin) {
        if (!superAdmins.is(callerUsername)) {
            throw ApiException.forbidden("Управлять админ-правами может только супер-администратор");
        }
        User target = userRepository.findById(targetId)
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));

        if (makeAdmin) {
            target.setRole(RoleEnum.ADMIN);
            target.setBannedUntil(null);
            target.setBanReason(null);
            notificationService.notify(target, "ROLE", "Вам выданы права администратора.");
        } else {
            if (superAdmins.is(target.getUsername())) {
                throw ApiException.badRequest("Нельзя снять права у супер-администратора");
            }
            target.setRole(RoleEnum.USER);
            notificationService.notify(target, "ROLE", "Права администратора сняты.");
        }
        userRepository.save(target);
    }

    /* ── Предупреждение пользователю ── */

    @Transactional
    public void warn(Long userId, String message) {
        User u = userRepository.findById(userId)
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));
        String text = (message == null || message.isBlank())
            ? "Предупреждение от модератора: соблюдайте правила сообщества."
            : "⚠ Предупреждение от модератора: " + message.trim();
        notificationService.notify(u, "WARNING", text);
    }
}
