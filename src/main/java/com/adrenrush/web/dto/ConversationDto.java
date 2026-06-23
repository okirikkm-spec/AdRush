package com.adrenrush.web.dto;

import lombok.Data;

import java.time.Instant;
import java.util.List;

@Data
public class ConversationDto {
    private Long id;
    private String type;           // DIRECT | GROUP
    private String title;          // имя группы (для DIRECT — null, имя берётся из собеседника)
    private String avatarUrl;      // аватар группы (опционально)
    private List<ChatMemberDto> members;
    private ChatMessageDto lastMessage;
    private Instant lastMessageAt;
    private int unreadCount;       // непрочитанные для текущего пользователя
}
