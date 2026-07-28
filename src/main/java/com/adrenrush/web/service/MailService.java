package com.adrenrush.web.service;

import com.adrenrush.web.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Отправка писем. JavaMailSender создаётся Spring Boot только если задан
 * spring.mail.host — если SMTP не настроен (локальная разработка), письмо
 * не уходит, а код пишется в лог, чтобы флоу можно было пройти целиком.
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final ObjectProvider<JavaMailSender> mailSender;
    private final String from;
    private final String host;

    public MailService(ObjectProvider<JavaMailSender> mailSender,
                       @Value("${mail.from:}") String from,
                       @Value("${spring.mail.username:}") String username,
                       @Value("${spring.mail.host:}") String host) {
        this.mailSender = mailSender;
        this.host = host;
        // Пустые переменные окружения приходят как "", а не как отсутствующие,
        // поэтому цепочку запасных значений разбираем здесь, а не в properties.
        this.from = firstNotBlank(from, username, "noreply@adrenrush.ru");
    }

    private static String firstNotBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    /**
     * Настроен ли реальный SMTP (иначе работает лог-заглушка).
     * Проверяем именно host, а не наличие бина: при пустом MAIL_HOST
     * автоконфигурация Spring всё равно создаёт JavaMailSender.
     */
    public boolean isConfigured() {
        return host != null && !host.isBlank() && mailSender.getIfAvailable() != null;
    }

    public void sendVerificationCode(String to, String code, int ttlMinutes) {
        String subject = "AdrenRush · код подтверждения почты";
        String text = """
            Код для привязки почты к аккаунту AdrenRush:

                %s

            Код действует %d минут. Введите его на сайте в разделе «Профиль».

            Если вы не запрашивали привязку — просто проигнорируйте это письмо.
            """.formatted(code, ttlMinutes);
        send(to, subject, text);
    }

    public void sendPasswordResetCode(String to, String code, int ttlMinutes) {
        String subject = "AdrenRush · код для сброса пароля";
        String text = """
            Код для сброса пароля от аккаунта AdrenRush:

                %s

            Код действует %d минут. Введите его на странице восстановления пароля.

            Если вы не запрашивали сброс — проигнорируйте это письмо,
            пароль останется прежним.
            """.formatted(code, ttlMinutes);
        send(to, subject, text);
    }

    private void send(String to, String subject, String text) {
        if (!isConfigured()) {
            log.warn("SMTP не настроен (MAIL_HOST пуст). Письмо для {} не отправлено.\n--- {} ---\n{}",
                to, subject, text);
            return;
        }
        JavaMailSender sender = mailSender.getObject();
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        try {
            sender.send(message);
        } catch (Exception e) {
            log.error("Не удалось отправить письмо на {}: {}", to, e.getMessage());
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                "Не удалось отправить письмо. Проверьте адрес или попробуйте позже");
        }
    }
}
