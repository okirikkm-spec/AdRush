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

    public static ChatMessageDto from(ChatMessage m) {
        ChatMessageDto dto = new ChatMessageDto();
        dto.setId(m.getId());
        dto.setConversationId(m.getConversation().getId());
        dto.setSender(UserBriefDto.from(m.getSender()));
        dto.setContent(m.getContent());
        dto.setCreatedAt(m.getCreatedAt());
        return dto;
    }
}
