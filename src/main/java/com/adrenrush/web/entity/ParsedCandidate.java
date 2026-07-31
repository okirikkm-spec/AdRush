package com.adrenrush.web.entity;

import com.adrenrush.web.enums.CandidateStatus;
import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * Найденная парсером позиция, которая ЕЩЁ НЕ в каталоге: «приёмка». Парсер больше не заводит
 * карточки сам — он наполняет эту таблицу, а администратор в админке решает, что принять (с
 * возможностью поправить название/описание), а что отправить в игнор.
 *
 * Игнор запоминается тут же ({@link CandidateStatus#IGNORED}): при следующем проходе позиция
 * останется в списке, но без галочки — так однажды отклонённый напиток не предлагается снова.
 */
@Entity
@Table(name = "parsed_candidates")
@Data
public class ParsedCandidate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Ссылка на страницу товара у источника — ключ, по которому позиция узнаётся между проходами. */
    @Column(nullable = false, unique = true, length = 512)
    private String sourceUrl;

    /** Метка парсера-источника, например «Monster (WorldSweet)» — для группировки в окне. */
    @Column(length = 128)
    private String source;

    @Column(nullable = false, length = 512)
    private String name;

    @Column(length = 128)
    private String brand;

    @Column(columnDefinition = "text")
    private String description;

    /** Ссылка на пэкшот у источника: показывается в окне, скачивается только при принятии. */
    @Column(length = 1024)
    private String imageUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private CandidateStatus status = CandidateStatus.PENDING;

    /**
     * Название карточки каталога, на которую позиция похожа по вкусу (или null). Заполняется при
     * сборе: у одного напитка на разных сайтах названия разные, и это подсказка администратору,
     * что перед ним, скорее всего, дубль — такие позиции предлагаются без галочки.
     */
    @Column(length = 512)
    private String similarTo;

    private Instant firstSeenAt = Instant.now();
    private Instant lastSeenAt = Instant.now();
}
