package com.adrenrush.web.dto;

import com.adrenrush.web.entity.ConversationMember;
import lombok.Data;

import java.time.Instant;

/** Участник беседы + момент последнего прочтения (для статусов «прочитано»). */
@Data
public class ChatMemberDto {
    private UserBriefDto user;
    private boolean owner;
    private Instant lastReadAt;

    public static ChatMemberDto from(ConversationMember m) {
        ChatMemberDto dto = new ChatMemberDto();
        dto.setUser(UserBriefDto.from(m.getUser()));
        dto.setOwner(m.isOwner());
        dto.setLastReadAt(m.getLastReadAt());
        return dto;
    }
}
