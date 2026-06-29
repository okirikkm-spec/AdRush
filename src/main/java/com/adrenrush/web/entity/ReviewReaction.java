package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.Instant;

/**
 * Эмодзи-реакция пользователя на отзыв. Один пользователь — одна реакция на отзыв
 * (можно сменить эмодзи или снять повторным кликом).
 * При удалении отзыва или пользователя реакции чистятся каскадно на уровне БД
 * (ON DELETE CASCADE), поэтому ручная очистка в сервисах не нужна.
 */
@Entity
@Table(name = "review_reactions", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"review_id", "user_id"})
})
@Data
public class ReviewReaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "review_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Review review;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

    /** Эмодзи из ограниченного набора (валидируется в ReviewService). */
    @Column(nullable = false, length = 16)
    private String emoji;

    private Instant createdAt = Instant.now();
}
