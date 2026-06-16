package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "drinks")
@Data
public class Drink {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    /** Бренд энергетика (например, «Adrenaline Rush», «Monster») — для фильтра на главной и выбора при парсинге. */
    private String brand;

    @Column(unique = true)
    private String slug;

    @Column(columnDefinition = "text")
    private String description;

    /** Ссылка на исходную запись на drinks-energy.ru — ключ для дедупликации при парсинге. */
    @Column(unique = true)
    private String sourceUrl;

    /* ─── Кадрирование обложки (настраивает админ; null = значения по умолчанию) ─── */
    /** object-fit обложки на карточке: "contain" или "cover". */
    private String coverFitCard;
    /** object-position обложки на карточке, например "50% 30%". */
    private String coverPosCard;
    /** object-fit обложки во всплывающем окне. */
    private String coverFitModal;
    /** object-position обложки во всплывающем окне. */
    private String coverPosModal;

    @OneToMany(mappedBy = "drink", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC, id ASC")
    private List<DrinkPhoto> photos = new ArrayList<>();

    private Instant createdAt = Instant.now();
}
