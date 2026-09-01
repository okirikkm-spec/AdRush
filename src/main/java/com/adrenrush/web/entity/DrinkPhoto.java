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

    /**
     * URL уменьшенного превью (для карточек/миниатюр). null — превью нет
     * (старые записи, внешние ссылки или неподдерживаемый формат) → используем {@link #url}.
     */
    @Column(length = 1024)
    private String thumbUrl;

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

    /**
     * Картинку правили вручную в редакторе фона: автоматическая обработка её больше не трогает
     * (иначе «Оптимизация медиа» вырезала бы фон заново и затёрла ручную работу).
     * columnDefinition с DEFAULT — чтобы ddl-auto=update смог добавить NOT NULL колонку в уже
     * заполненную таблицу.
     */
    @Column(nullable = false, columnDefinition = "boolean not null default false")
    private boolean edited = false;

    private Instant createdAt = Instant.now();
}
