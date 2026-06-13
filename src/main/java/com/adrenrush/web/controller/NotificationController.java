package com.adrenrush.web.controller;

import com.adrenrush.web.dto.NotificationDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public ResponseEntity<List<NotificationDto>> list(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(
            notificationService.list(currentUser.getId()).stream().map(NotificationDto::from).toList());
    }

    @GetMapping("/unread-count")
    public ResponseEntity<Map<String, Integer>> unreadCount(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(Map.of("count", notificationService.unreadCount(currentUser.getId())));
    }

    @PostMapping("/read")
    public ResponseEntity<Map<String, String>> markRead(@AuthenticationPrincipal User currentUser) {
        notificationService.markAllRead(currentUser.getId());
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
