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

    /** Логин (уникальный). Вход выполняется по нему, а не по почте. */
    @Column(nullable = false, unique = true)
    private String username;

    /**
     * Привязанная почта — записывается только после подтверждения кодом.
     * unique: одна почта у одного аккаунта и один аккаунт на почту.
     * Незавершённая привязка живёт отдельно — см. EmailVerification.
     */
    @Column(unique = true)
    private String email;

    /** Когда почта была подтверждена (null — почта не привязана). */
    private Instant emailVerifiedAt;

    /** Отображаемое имя (может отличаться от логина). */
    private String displayName;

    @Column(nullable = false)
    private String password;

    private String avatarPath;

    /** Обложка (фон) мини-профиля. Публичная, как и аватарка. */
    private String bannerPath;

    /* Кадрирование обложки — как у обложек напитков: оригинал не режем,
       храним режим вписывания и точку фокуса. null = значения по умолчанию. */
    /** Масштаб: 1 = картинка вписана по короткой стороне (заполняет плашку). */
    private Double bannerScale;
    /** Поворот в градусах. */
    private Integer bannerRotate;
    /** Смещение в процентах от размера плашки. */
    private Double bannerOffsetX;
    private Double bannerOffsetY;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RoleEnum role = RoleEnum.USER;

    /** Закрытый профиль — отзывы и тир-лист скрыты от других. */
    @Column(nullable = false)
    private boolean profilePrivate = false;

    /** Служебный аккаунт «Система»: отправитель уведомлений в чате. Скрыт из поиска, логиниться нельзя. */
    // columnDefinition с DEFAULT — чтобы ddl-auto=update смог добавить NOT NULL колонку в уже заполненную таблицу
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean system = false;

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
