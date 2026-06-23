package com.adrenrush.web.controller;

import com.adrenrush.web.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;

/** STOMP-обработчик эфемерных событий чата (набор текста). */
@Controller
@RequiredArgsConstructor
public class ChatWsController {

    private final ChatService chatService;

    /** Клиент шлёт в /app/chat.typing {conversationId}; рассылаем «печатает…» остальным участникам. */
    @MessageMapping("/chat.typing")
    public void typing(@Payload Map<String, Object> body, Principal principal) {
        if (principal == null || body == null) return;
        Object cid = body.get("conversationId");
        if (cid == null) return;
        try {
            chatService.handleTyping(principal.getName(), Long.valueOf(cid.toString()));
        } catch (NumberFormatException ignored) {
            /* некорректный id — игнорируем */
        }
    }
}
