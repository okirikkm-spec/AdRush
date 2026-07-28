package com.adrenrush.web.service;

import com.adrenrush.web.entity.PasswordReset;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.PasswordResetRepository;
import com.adrenrush.web.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/**
 * Сброс пароля по коду на привязанную почту — запасной путь для тех, у кого не включена 2FA.
 *
 * Почему только без 2FA: если оставить оба способа сразу, почта становится обходом
 * двухфакторной аутентификации — доступ к ящику давал бы вход мимо аутентификатора.
 * Поэтому при totpEnabled этот путь закрыт, работает восстановление по коду приложения
 * (AuthService.recoverPassword).
 *
 * Эндпоинты не требуют авторизации (пароль забыт), поэтому здесь важны пауза между
 * письмами и лимит попыток: письмо всегда уходит только на User.email, сменить
 * получателя запросом нельзя.
 */
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private static final Duration CODE_TTL = Duration.ofMinutes(15);
    private static final Duration RESEND_PAUSE = Duration.ofSeconds(60);
    private static final int MAX_ATTEMPTS = 5;

    private final PasswordResetRepository resetRepository;
    private final UserRepository userRepository;
    private final MailService mailService;
    private final BCryptPasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    /** Шаг 1: выслать код на привязанную почту. */
    @Transactional
    public Map<String, Object> requestCode(String username) {
        User user = requireEligibleUser(username);

        PasswordReset reset = resetRepository.findByUserId(user.getId())
            .orElseGet(() -> {
                PasswordReset fresh = new PasswordReset();
                fresh.setUser(user);
                return fresh;
            });

        // Пауза по последней отправке: эндпоинт публичный, иначе им можно
        // засыпать чужой ящик письмами, зная один только логин.
        if (reset.getId() != null) {
            long wait = secondsUntil(reset.getSentAt().plus(RESEND_PAUSE));
            if (wait > 0) {
                throw ApiException.badRequest("Повторная отправка будет доступна через " + wait + " с");
            }
        }

        String code = generateCode();
        reset.setCodeHash(passwordEncoder.encode(code));
        reset.setAttempts(0);
        reset.setSentAt(Instant.now());
        reset.setExpiresAt(Instant.now().plus(CODE_TTL));
        resetRepository.save(reset);

        mailService.sendPasswordResetCode(user.getEmail(), code, (int) CODE_TTL.toMinutes());

        Map<String, Object> result = new HashMap<>();
        // Адрес отдаём замаскированным: по логину нельзя узнать чужую почту целиком.
        result.put("email", maskEmail(user.getEmail()));
        result.put("expiresInSeconds", secondsUntil(reset.getExpiresAt()));
        result.put("resendInSeconds", secondsUntil(reset.getSentAt().plus(RESEND_PAUSE)));
        result.put("delivered", mailService.isConfigured());
        return result;
    }

    /**
     * Шаг 2: проверить код и установить новый пароль.
     * noRollbackFor — иначе откат транзакции сотрёт счётчик попыток и перебор кода станет бесконечным.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public void confirmReset(String username, String rawCode, String newPassword) {
        User user = requireEligibleUser(username);

        PasswordReset reset = resetRepository.findByUserId(user.getId())
            .orElseThrow(() -> ApiException.badRequest("Сначала запросите код на почту"));

        if (reset.getExpiresAt().isBefore(Instant.now())) {
            expire(reset);
            throw ApiException.badRequest("Срок действия кода истёк — запросите новый");
        }
        if (reset.getAttempts() >= MAX_ATTEMPTS) {
            expire(reset);
            throw ApiException.badRequest("Слишком много неверных попыток — запросите новый код");
        }

        String code = rawCode == null ? "" : rawCode.trim().replaceAll("\\s", "");
        if (!passwordEncoder.matches(code, reset.getCodeHash())) {
            reset.setAttempts(reset.getAttempts() + 1);
            resetRepository.save(reset);
            int left = MAX_ATTEMPTS - reset.getAttempts();
            throw ApiException.badRequest(left > 0
                ? "Неверный код. Осталось попыток: " + left
                : "Неверный код. Попытки исчерпаны — запросите новый код");
        }

        if (newPassword == null || newPassword.length() < 4) {
            throw ApiException.badRequest("Пароль должен содержать не менее 4 символов");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        resetRepository.delete(reset);
    }

    /* ── Вспомогательное ── */

    /** Аккаунт, которому этот способ восстановления вообще доступен. */
    private User requireEligibleUser(String username) {
        User user = userRepository.findByUsername(username == null ? "" : username.trim())
            .orElseThrow(() -> ApiException.notFound("Пользователь не найден"));

        if (user.isSystem()) {
            throw ApiException.notFound("Пользователь не найден");
        }
        if (user.isTotpEnabled()) {
            throw ApiException.badRequest(
                "У аккаунта включена двухфакторная аутентификация — восстановите пароль по коду из приложения");
        }
        if (user.getEmail() == null) {
            throw ApiException.badRequest(
                "К аккаунту не привязана почта — восстановление по почте недоступно");
        }
        return user;
    }

    /** Гасим заявку, не удаляя строку: в ней остаётся sentAt для паузы перед новым письмом. */
    private void expire(PasswordReset reset) {
        reset.setExpiresAt(Instant.now());
        resetRepository.save(reset);
    }

    private long secondsUntil(Instant moment) {
        return Math.max(0, Duration.between(Instant.now(), moment).getSeconds());
    }

    private String generateCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    /** i***i@gmail.com — подсказка владельцу, но не выдача адреса постороннему. */
    private String maskEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 0) return "***";
        String local = email.substring(0, at);
        String domain = email.substring(at);
        if (local.length() <= 2) return local.charAt(0) + "***" + domain;
        return local.charAt(0) + "***" + local.charAt(local.length() - 1) + domain;
    }
}
