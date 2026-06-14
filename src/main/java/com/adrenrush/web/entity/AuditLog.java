package com.adrenrush.web.entity;

import com.adrenrush.web.enums.AuditAction;
import com.adrenrush.web.enums.AuditTargetType;
import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/**
 * Запись журнала аудита действий модераторов.
 * Хранится «по-умному»: имена актора и цели сохраняются снимком (а не только FK),
 * поэтому запись остаётся читаемой и после удаления пользователя/отзыва и не меняется
 * задним числом при смене displayName. Журнал доступен только администраторам.
 */
@Entity
@Table(name = "audit_logs", indexes = {
    @Index(name = "idx_audit_created", columnList = "createdAt"),
    @Index(name = "idx_audit_actor", columnList = "actorId"),
    @Index(name = "idx_audit_target", columnList = "targetType, targetId"),
    @Index(name = "idx_audit_action", columnList = "action")
})
@Data
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Кто совершил действие (снимок id + логина). */
    private Long actorId;

    @Column(nullable = false)
    private String actorUsername;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private AuditAction action;

    /** Над кем/чем совершено действие (если применимо): пользователь или энергетик. */
    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private AuditTargetType targetType;

    private Long targetId;

    /** Снимок названия цели: логин пользователя или название энергетика. */
    private String targetLabel;

    /** Дополнительный контекст: причина, срок бана, название энергетика и т.п. */
    @Column(columnDefinition = "text")
    private String details;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
