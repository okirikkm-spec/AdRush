package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.Instant;

/**
 * Код сброса пароля, высланный на привязанную почту.
 * Одна активная заявка на аккаунт (user_id уникален) — новый запрос перезаписывает старую.
 * Адрес здесь не хранится: письмо всегда уходит на User.email, то есть сменить
 * получателя через этот механизм нельзя. Код лежит только BCrypt-хешем.
 */
@Entity
@Table(name = "password_resets")
@Data
public class PasswordReset {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

    @Column(nullable = false)
    private String codeHash;

    /** Неверные попытки ввода — защита от перебора. */
    @Column(nullable = false)
    private int attempts = 0;

    /** Время последней отправки — по нему считается пауза перед повтором. */
    @Column(nullable = false)
    private Instant sentAt = Instant.now();

    @Column(nullable = false)
    private Instant expiresAt;
}
