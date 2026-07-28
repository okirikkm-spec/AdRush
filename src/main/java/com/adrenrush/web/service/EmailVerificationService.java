package com.adrenrush.web.service;

import com.adrenrush.web.entity.EmailVerification;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.EmailVerificationRepository;
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
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Привязка почты к аккаунту по коду из письма.
 *
 * Связь строго один-к-одному: адрес попадает в users.email только после
 * подтверждения, а колонка уникальна — значит одна почта не может оказаться
 * у двух аккаунтов, а у аккаунта не может быть двух адресов. Пока код не
 * введён, заявка живёт в email_verifications и на users.email не влияет.
 */
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

    private static final Duration CODE_TTL = Duration.ofMinutes(15);
    private static final Duration RESEND_PAUSE = Duration.ofSeconds(60);
    private static final int MAX_ATTEMPTS = 5;

    /** Прагматичная проверка адреса: одна @, точка в домене, без пробелов. */
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@.]+(\\.[^\\s@.]+)+$");

    private final EmailVerificationRepository verificationRepository;
    private final UserRepository userRepository;
    private final MailService mailService;
    private final BCryptPasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    /* ── Состояние для профиля ── */

    @Transactional(readOnly = true)
    public Map<String, Object> status(User user) {
        Optional<EmailVerification> pending = verificationRepository.findByUserId(user.getId())
            .filter(v -> v.getExpiresAt().isAfter(Instant.now()));

        Map<String, Object> result = noPendingStatus(user);
        result.put("pending", pending.map(this::pendingInfo).orElse(null));
        return result;
    }

    /** Состояние после операции, которая заведомо убрала заявку (Map.of не принимает null). */
    private Map<String, Object> noPendingStatus(User user) {
        Map<String, Object> result = new HashMap<>();
        result.put("email", user.getEmail());
        result.put("verifiedAt", user.getEmailVerifiedAt());
        result.put("pending", null);
        return result;
    }

    private Map<String, Object> pendingInfo(EmailVerification v) {
        Instant now = Instant.now();
        Map<String, Object> info = new HashMap<>();
        info.put("email", v.getEmail());
        info.put("expiresInSeconds", secondsUntil(v.getExpiresAt(), now));
        info.put("resendInSeconds", secondsUntil(v.getSentAt().plus(RESEND_PAUSE), now));
        info.put("attemptsLeft", Math.max(0, MAX_ATTEMPTS - v.getAttempts()));
        return info;
    }

    private long secondsUntil(Instant moment, Instant now) {
        long seconds = Duration.between(now, moment).getSeconds();
        return Math.max(0, seconds);
    }

    /* ── Шаг 1: запрос кода ── */

    @Transactional
    public Map<String, Object> requestCode(User user, String rawEmail) {
        String email = normalize(rawEmail);

        if (email.equalsIgnoreCase(user.getEmail())) {
            throw ApiException.badRequest("Эта почта уже привязана к вашему аккаунту");
        }
        if (user.getEmail() != null) {
            throw ApiException.badRequest(
                "К аккаунту уже привязана почта. Сначала отвяжите текущую");
        }
        if (userRepository.existsByEmail(email)) {
            throw ApiException.conflict("Эта почта уже привязана к другому аккаунту");
        }
        if (verificationRepository.existsByEmailAndExpiresAtAfterAndUserIdNot(
                email, Instant.now(), user.getId())) {
            throw ApiException.conflict(
                "Эту почту сейчас подтверждает другой аккаунт. Попробуйте позже");
        }

        EmailVerification verification = verificationRepository.findByUserId(user.getId())
            .orElseGet(() -> {
                EmailVerification fresh = new EmailVerification();
                fresh.setUser(user);
                return fresh;
            });

        // Пауза считается по последней отправке, а не по адресу: иначе перебором
        // разных адресов можно было бы рассылать письма с нашего SMTP без ограничений.
        // Заявка на этом шаге всегда существующая (id != null) — у новой sentAt ещё «сейчас».
        if (verification.getId() != null) {
            long wait = secondsUntil(verification.getSentAt().plus(RESEND_PAUSE), Instant.now());
            if (wait > 0) {
                throw ApiException.badRequest("Повторная отправка будет доступна через " + wait + " с");
            }
        }

        String code = generateCode();
        verification.setEmail(email);
        verification.setCodeHash(passwordEncoder.encode(code));
        verification.setAttempts(0);
        verification.setSentAt(Instant.now());
        verification.setExpiresAt(Instant.now().plus(CODE_TTL));
        verificationRepository.save(verification);

        mailService.sendVerificationCode(email, code, (int) CODE_TTL.toMinutes());

        Map<String, Object> result = new HashMap<>(pendingInfo(verification));
        // Без SMTP письмо не уходит — фронт подскажет, что код лежит в логе сервера.
        result.put("delivered", mailService.isConfigured());
        return result;
    }

    /* ── Шаг 2: подтверждение кода ── */

    /**
     * noRollbackFor: ошибки здесь — не «отмена операции», а её результат.
     * Счётчик попыток и удаление просроченной заявки должны сохраниться,
     * иначе откат транзакции обнулит защиту от перебора кода.
     */
    @Transactional(noRollbackFor = ApiException.class)
    public Map<String, Object> confirmCode(User user, String rawCode) {
        EmailVerification verification = verificationRepository.findByUserId(user.getId())
            .orElseThrow(() -> ApiException.badRequest("Сначала запросите код подтверждения"));

        if (verification.getExpiresAt().isBefore(Instant.now())) {
            expire(verification);
            throw ApiException.badRequest("Срок действия кода истёк — запросите новый");
        }
        if (verification.getAttempts() >= MAX_ATTEMPTS) {
            expire(verification);
            throw ApiException.badRequest("Слишком много неверных попыток — запросите новый код");
        }

        String code = rawCode == null ? "" : rawCode.trim().replaceAll("\\s", "");
        if (!passwordEncoder.matches(code, verification.getCodeHash())) {
            verification.setAttempts(verification.getAttempts() + 1);
            verificationRepository.save(verification);
            int left = MAX_ATTEMPTS - verification.getAttempts();
            throw ApiException.badRequest(left > 0
                ? "Неверный код. Осталось попыток: " + left
                : "Неверный код. Попытки исчерпаны — запросите новый код");
        }

        // Повторная проверка перед записью: адрес могли привязать, пока код ждал ввода.
        if (userRepository.existsByEmail(verification.getEmail())) {
            expire(verification);
            throw ApiException.conflict("Эта почта уже привязана к другому аккаунту");
        }

        user.setEmail(verification.getEmail());
        user.setEmailVerifiedAt(Instant.now());
        userRepository.save(user);
        verificationRepository.delete(verification);

        return noPendingStatus(user);
    }

    /**
     * Гасит заявку, не удаляя строку: в ней остаётся sentAt, по которому
     * считается пауза перед следующим письмом. Если строку удалять, паузу
     * можно было бы сбросить отменой заявки или намеренным вводом неверных кодов.
     */
    private void expire(EmailVerification verification) {
        verification.setExpiresAt(Instant.now());
        verificationRepository.save(verification);
    }

    /** Отменить незавершённую привязку. */
    @Transactional
    public Map<String, Object> cancel(User user) {
        verificationRepository.findByUserId(user.getId()).ifPresent(this::expire);
        return noPendingStatus(user);
    }

    /** Отвязать подтверждённую почту — подтверждается паролем. */
    @Transactional
    public Map<String, Object> unbind(User user, String password) {
        if (user.getEmail() == null) {
            throw ApiException.badRequest("К аккаунту не привязана почта");
        }
        if (password == null || !passwordEncoder.matches(password, user.getPassword())) {
            throw ApiException.badRequest("Неверный пароль");
        }
        user.setEmail(null);
        user.setEmailVerifiedAt(null);
        userRepository.save(user);
        verificationRepository.deleteByUserId(user.getId());
        return noPendingStatus(user);
    }

    /* ── Вспомогательное ── */

    private String normalize(String rawEmail) {
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
        if (email.isEmpty()) {
            throw ApiException.badRequest("Введите адрес почты");
        }
        if (email.length() > 254 || !EMAIL.matcher(email).matches()) {
            throw ApiException.badRequest("Некорректный адрес почты");
        }
        return email;
    }

    private String generateCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }
}
