package com.adrenrush.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.time.Instant;

/** Событие чата, доставляемое по WebSocket в /user/queue/chat. */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ChatEventDto {
    /** message | typing | read | conversation */
    private String kind;
    private Long conversationId;
    private ChatMessageDto message;
    private ConversationDto conversation;
    private UserBriefDto user;     // кто печатает / кто прочитал
    private Instant lastReadAt;    // для kind=read

    public static ChatEventDto of(String kind) {
        ChatEventDto e = new ChatEventDto();
        e.setKind(kind);
        return e;
    }
}
