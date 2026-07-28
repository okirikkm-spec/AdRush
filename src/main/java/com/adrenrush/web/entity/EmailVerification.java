package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.Instant;

/**
 * Незавершённая привязка почты: пользователь запросил код, но ещё не ввёл его.
 * На аккаунт одновременно живёт максимум одна заявка (user_id уникален) — новый
 * запрос перезаписывает старую. Подтверждённая почта переезжает в User.email,
 * а заявка удаляется, поэтому таблица не хранит подтверждённых адресов.
 * Код лежит только в виде BCrypt-хеша: из БД его не прочитать.
 */
@Entity
@Table(name = "email_verifications")
@Data
public class EmailVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

    /** Адрес, который подтверждают (в нижнем регистре). */
    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String codeHash;

    /** Сколько раз вводили неверный код — защита от перебора. */
    @Column(nullable = false)
    private int attempts = 0;

    /** Время последней отправки письма — по нему считается пауза перед повтором. */
    @Column(nullable = false)
    private Instant sentAt = Instant.now();

    @Column(nullable = false)
    private Instant expiresAt;
}
