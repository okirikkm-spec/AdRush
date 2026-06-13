package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * Отзыв пользователя на энергетик: оценка (1–10) и текст.
 * Один пользователь — один отзыв на напиток (можно редактировать).
 */
@Entity
@Table(name = "reviews", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"drink_id", "user_id"})
})
@Data
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drink_id", nullable = false)
    private Drink drink;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Оценка от 1 до 10. */
    @Column(nullable = false)
    private Integer rating;

    @Column(columnDefinition = "text")
    private String text;

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();
}
