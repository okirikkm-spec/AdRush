package com.adrenrush.web.entity;

import com.adrenrush.web.enums.RoleEnum;
import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "users")
@Data
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Логин (уникальный). Почта намеренно не используется. */
    @Column(nullable = false, unique = true)
    private String username;

    /** Отображаемое имя (может отличаться от логина). */
    private String displayName;

    @Column(nullable = false)
    private String password;

    private String avatarPath;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RoleEnum role = RoleEnum.USER;

    /** Закрытый профиль — отзывы и тир-лист скрыты от других. */
    @Column(nullable = false)
    private boolean profilePrivate = false;

    /* ── Двухфакторная аутентификация (TOTP / authenticator) ── */
    private String totpSecret;

    @Column(nullable = false)
    private boolean totpEnabled = false;

    /* ── Скрытые поля для модерации ──
       Помогают понять, что несколько аккаунтов принадлежат одному человеку. */
    private String registrationIp;
    private String lastIp;

    /* Отпечаток браузера/устройства (FingerprintJS visitorId) — надёжнее IP. */
    private String registrationFingerprint;
    private String lastFingerprint;

    /* ── Бан ──
       role = BANNED + bannedUntil = null  → бан навсегда
       role = BANNED + bannedUntil в будущем → временный бан
       role = BANNED + bannedUntil в прошлом → бан истёк (снимается автоматически) */
    private Instant bannedUntil;
    @Column(columnDefinition = "text")
    private String banReason;

    private Instant createdAt = Instant.now();
}
