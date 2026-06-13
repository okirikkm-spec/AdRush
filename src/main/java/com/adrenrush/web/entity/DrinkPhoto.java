package com.adrenrush.web.entity;

import com.adrenrush.web.enums.PhotoSource;
import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "drink_photos")
@Data
public class DrinkPhoto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "drink_id", nullable = false)
    private Drink drink;

    /**
     * URL изображения. Для PARSED — внешняя ссылка на drinks-energy.ru,
     * для USER — путь вида "uploads/photos/..." или ключ в MinIO.
     */
    @Column(nullable = false, length = 1024)
    private String url;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PhotoSource source = PhotoSource.USER;

    /** Кто загрузил (для пользовательских фото). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by")
    private User uploadedBy;

    /** Порядок в галерее — новые добавляются в конец. */
    @Column(nullable = false)
    private int position = 0;

    private Instant createdAt = Instant.now();
}
