package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/** Участник беседы. lastReadAt отмечает, до какого момента пользователь прочитал переписку. */
@Entity
@Table(
    name = "conversation_members",
    uniqueConstraints = @UniqueConstraint(columnNames = {"conversation_id", "user_id"})
)
@Data
public class ConversationMember {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id")
    private Conversation conversation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    /** Создатель/владелец группы (может управлять составом). */
    @Column(nullable = false)
    private boolean owner = false;

    /** До какого момента участник прочитал беседу (null — ещё не читал). */
    private Instant lastReadAt;

    @Column(nullable = false)
    private Instant joinedAt = Instant.now();
}
