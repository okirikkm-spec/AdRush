package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/** Уведомление пользователю (например, об удалении отзыва модератором или о бане). */
@Entity
@Table(name = "notifications")
@Data
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** REVIEW_DELETED | BANNED | ... */
    @Column(nullable = false)
    private String type;

    @Column(columnDefinition = "text")
    private String message;

    @Column(nullable = false)
    private boolean read = false;

    private Instant createdAt = Instant.now();
}
