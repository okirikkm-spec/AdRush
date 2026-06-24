package com.adrenrush.web.controller;

import com.adrenrush.web.dto.ChatMessageDto;
import com.adrenrush.web.dto.ConversationDto;
import com.adrenrush.web.dto.UserBriefDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/chats")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @GetMapping
    public ResponseEntity<List<ConversationDto>> list(@AuthenticationPrincipal User me) {
        return ResponseEntity.ok(chatService.listConversations(me));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Integer>> unread(@AuthenticationPrincipal User me) {
        return ResponseEntity.ok(Map.of("count", chatService.totalUnread(me)));
    }

    @GetMapping("/users/search")
    public ResponseEntity<List<UserBriefDto>> search(@AuthenticationPrincipal User me, @RequestParam("q") String q) {
        return ResponseEntity.ok(chatService.searchUsers(me, q));
    }

    @PostMapping("/direct")
    public ResponseEntity<ConversationDto> direct(@AuthenticationPrincipal User me, @RequestBody Map<String, Object> body) {
        Long userId = toLong(body.get("userId"));
        if (userId == null) throw ApiException.badRequest("Не указан пользователь");
        return ResponseEntity.ok(chatService.getOrCreateDirect(me, userId));
    }

    @PostMapping("/group")
    public ResponseEntity<ConversationDto> group(@AuthenticationPrincipal User me, @RequestBody Map<String, Object> body) {
        String title = body.get("title") == null ? null : body.get("title").toString();
        return ResponseEntity.ok(chatService.createGroup(me, title, toLongList(body.get("memberIds"))));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ConversationDto> get(@AuthenticationPrincipal User me, @PathVariable Long id) {
        return ResponseEntity.ok(chatService.getConversation(id, me));
    }

    @GetMapping("/{id}/messages")
    public ResponseEntity<List<ChatMessageDto>> messages(@AuthenticationPrincipal User me,
                                                         @PathVariable Long id,
                                                         @RequestParam(value = "beforeId", required = false) Long beforeId,
                                                         @RequestParam(value = "limit", defaultValue = "40") int limit) {
        return ResponseEntity.ok(chatService.listMessages(id, me, beforeId, limit));
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<ChatMessageDto> send(@AuthenticationPrincipal User me,
                                               @PathVariable Long id,
                                               @RequestBody Map<String, Object> body) {
        String content = body.get("content") == null ? null : body.get("content").toString();
        return ResponseEntity.ok(chatService.sendMessage(id, me, content));
    }

    @PostMapping("/{id}/messages/image")
    public ResponseEntity<ChatMessageDto> sendImage(@AuthenticationPrincipal User me,
                                                    @PathVariable Long id,
                                                    @RequestParam("file") MultipartFile file,
                                                    @RequestParam(value = "caption", required = false) String caption) {
        if (file == null || file.isEmpty()) throw ApiException.badRequest("Пустой файл");
        byte[] bytes;
        try { bytes = file.getBytes(); } catch (IOException e) { throw ApiException.badRequest("Не удалось прочитать файл"); }
        return ResponseEntity.ok(chatService.sendImage(id, me, bytes, file.getContentType(), caption));
    }

    /**
     * Поделиться карточкой энергетика (drinkId) или отзывом (reviewId): либо в существующую беседу
     * (conversationId), либо личным сообщением получателю (recipientUserId).
     */
    @PostMapping("/share")
    public ResponseEntity<Map<String, Object>> share(@AuthenticationPrincipal User me, @RequestBody Map<String, Object> body) {
        ChatMessageDto msg = chatService.share(me,
            toLong(body.get("conversationId")), toLong(body.get("recipientUserId")),
            toLong(body.get("drinkId")), toLong(body.get("reviewId")));
        return ResponseEntity.ok(Map.of("conversationId", msg.getConversationId(), "message", msg));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Map<String, String>> read(@AuthenticationPrincipal User me, @PathVariable Long id) {
        chatService.markRead(id, me);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/{id}/members")
    public ResponseEntity<ConversationDto> addMembers(@AuthenticationPrincipal User me,
                                                      @PathVariable Long id,
                                                      @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(chatService.addMembers(id, me, toLongList(body.get("memberIds"))));
    }

    @PostMapping("/{id}/leave")
    public ResponseEntity<Map<String, String>> leave(@AuthenticationPrincipal User me, @PathVariable Long id) {
        chatService.leave(id, me);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /* ── coercion ── */

    private Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.valueOf(o.toString()); } catch (NumberFormatException e) { return null; }
    }

    private List<Long> toLongList(Object o) {
        List<Long> out = new ArrayList<>();
        if (o instanceof List<?> list) {
            for (Object x : list) {
                Long v = toLong(x);
                if (v != null) out.add(v);
            }
        }
        return out;
    }
}
