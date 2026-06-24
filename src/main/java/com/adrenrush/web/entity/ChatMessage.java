package com.adrenrush.web.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

/** Сообщение в беседе. */
@Entity
@Table(name = "chat_messages", indexes = @Index(name = "idx_chat_msg_conv", columnList = "conversation_id"))
@Data
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "conversation_id")
    private Conversation conversation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sender_id")
    private User sender;

    /** Текст (или подпись к картинке). Для вложений-карточек пустой. */
    @Column(columnDefinition = "text", nullable = false)
    private String content;

    /** Вложение-картинка: публичный путь (/media/... или /uploads/...), иначе null. */
    @Column(name = "image_path")
    private String imagePath;

    /** Расшаренный энергетик (id карточки), иначе null. */
    @Column(name = "shared_drink_id")
    private Long sharedDrinkId;

    /** Расшаренный отзыв (id), иначе null. */
    @Column(name = "shared_review_id")
    private Long sharedReviewId;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();
}
