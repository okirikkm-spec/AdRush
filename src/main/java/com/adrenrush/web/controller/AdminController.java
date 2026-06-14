package com.adrenrush.web.controller;

import com.adrenrush.web.dto.AdminUserDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.AuditAction;
import com.adrenrush.web.service.AdminService;
import com.adrenrush.web.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** Модерация — доступно только администратору (ограничено в SecurityConfig). */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final AuditService auditService;

    @GetMapping("/users")
    public ResponseEntity<List<AdminUserDto>> users() {
        return ResponseEntity.ok(adminService.listUsers());
    }

    @GetMapping("/users/{id}/linked")
    public ResponseEntity<List<AdminUserDto>> linked(@PathVariable Long id) {
        return ResponseEntity.ok(adminService.linkedAccounts(id));
    }

    @PostMapping("/users/{id}/ban")
    public ResponseEntity<Map<String, Object>> ban(@PathVariable Long id,
                                                   @AuthenticationPrincipal User currentUser,
                                                   @RequestBody Map<String, Object> body) {
        String reason = body.get("reason") != null ? body.get("reason").toString() : null;
        Integer durationDays = body.get("durationDays") != null
            ? ((Number) body.get("durationDays")).intValue() : null;
        boolean deleteComments = Boolean.TRUE.equals(body.get("deleteComments"));
        List<Long> also = null;
        Object raw = body.get("alsoBanUserIds");
        if (raw instanceof List<?> list) {
            also = list.stream().map(o -> ((Number) o).longValue()).toList();
        }
        return ResponseEntity.ok(adminService.ban(currentUser, id, reason, durationDays, deleteComments, also));
    }

    @PostMapping("/users/{id}/unban")
    public ResponseEntity<Map<String, String>> unban(@PathVariable Long id,
                                                     @AuthenticationPrincipal User currentUser) {
        adminService.unban(currentUser, id);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Map<String, String>> deleteUser(@PathVariable Long id,
                                                          @AuthenticationPrincipal User currentUser) {
        adminService.deleteUser(currentUser, id);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** Выдать/снять права администратора — доступно только супер-админу. */
    @PostMapping("/users/{id}/role")
    public ResponseEntity<Map<String, String>> setRole(@PathVariable Long id,
                                                       @AuthenticationPrincipal User currentUser,
                                                       @RequestBody Map<String, Object> body) {
        boolean makeAdmin = Boolean.TRUE.equals(body.get("admin"));
        adminService.setAdminRole(currentUser, id, makeAdmin);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** Отправить пользователю предупреждение (уведомление). */
    @PostMapping("/users/{id}/warn")
    public ResponseEntity<Map<String, String>> warn(@PathVariable Long id,
                                                    @AuthenticationPrincipal User currentUser,
                                                    @RequestBody(required = false) Map<String, String> body) {
        adminService.warn(currentUser, id, body != null ? body.get("message") : null);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @DeleteMapping("/reviews/{id}")
    public ResponseEntity<Map<String, String>> deleteReview(@PathVariable Long id,
                                                            @AuthenticationPrincipal User currentUser,
                                                            @RequestBody(required = false) Map<String, String> body) {
        String reason = body != null ? body.get("reason") : null;
        adminService.deleteReview(currentUser, id, reason);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /* ── Журнал аудита ── */

    /** Журнал действий модераторов с фильтрами: actorId (кто), action (что), targetId (с кем), q (поиск). */
    @GetMapping("/audit")
    public ResponseEntity<Map<String, Object>> audit(@RequestParam(required = false) Long actorId,
                                                     @RequestParam(required = false) String action,
                                                     @RequestParam(required = false) Long targetId,
                                                     @RequestParam(required = false) String q,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "50") int size) {
        AuditAction act = null;
        if (action != null && !action.isBlank()) {
            try { act = AuditAction.valueOf(action.trim().toUpperCase()); }
            catch (IllegalArgumentException ignored) { /* неизвестный тип — фильтр игнорируем */ }
        }
        return ResponseEntity.ok(auditService.search(actorId, act, targetId, q, page, size));
    }

    /** Уникальные акторы журнала — для выпадающего фильтра «кто делал». */
    @GetMapping("/audit/actors")
    public ResponseEntity<List<Map<String, Object>>> auditActors() {
        return ResponseEntity.ok(auditService.actors());
    }
}
