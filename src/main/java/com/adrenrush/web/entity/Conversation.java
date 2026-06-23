package com.adrenrush.web.entity;

import com.adrenrush.web.enums.ConversationType;
import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/** Беседа — личный диалог или группа. Участники хранятся в {@link ConversationMember}. */
@Entity
@Table(name = "conversations")
@Data
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ConversationType type = ConversationType.DIRECT;

    /** Название группы (для DIRECT не используется — имя берётся из собеседника). */
    private String title;

    /** Аватар группы (опционально). */
    private String avatarPath;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    /** Время последнего сообщения — для сортировки списка бесед. */
    @Column(nullable = false)
    private Instant lastMessageAt = Instant.now();
}
