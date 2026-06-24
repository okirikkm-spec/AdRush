package com.adrenrush.web.dto;

import com.adrenrush.web.entity.ChatMessage;
import lombok.Data;

import java.time.Instant;

@Data
public class ChatMessageDto {
    private Long id;
    private Long conversationId;
    private UserBriefDto sender;
    private String content;
    private Instant createdAt;

    /** Вложение-картинка (публичный путь), иначе null. */
    private String imageUrl;
    /** Расшаренный энергетик (превью), иначе null. Заполняется в ChatService. */
    private SharedDrinkDto sharedDrink;
    /** Расшаренный отзыв (превью), иначе null. Заполняется в ChatService. */
    private SharedReviewDto sharedReview;

    public static ChatMessageDto from(ChatMessage m) {
        ChatMessageDto dto = new ChatMessageDto();
        dto.setId(m.getId());
        dto.setConversationId(m.getConversation().getId());
        dto.setSender(UserBriefDto.from(m.getSender()));
        dto.setContent(m.getContent());
        dto.setCreatedAt(m.getCreatedAt());
        dto.setImageUrl(m.getImagePath());
        return dto;
    }

    /** Лёгкое превью энергетика для карточки в чате. */
    @Data
    public static class SharedDrinkDto {
        private Long id;
        private String name;
        private String brand;
        private String coverUrl;
        private double averageRating;
        private int reviewCount;
    }

    /** Лёгкое превью отзыва для карточки в чате. */
    @Data
    public static class SharedReviewDto {
        private Long id;
        private Long drinkId;
        private String drinkName;
        private String authorName;
        private String authorAvatarUrl;
        private int rating;
        private String text;
    }
}
