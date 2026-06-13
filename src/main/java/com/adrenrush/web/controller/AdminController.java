package com.adrenrush.web.controller;

import com.adrenrush.web.dto.AdminUserDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.AdminService;
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
        return ResponseEntity.ok(adminService.ban(id, reason, durationDays, deleteComments, also));
    }

    @PostMapping("/users/{id}/unban")
    public ResponseEntity<Map<String, String>> unban(@PathVariable Long id) {
        adminService.unban(id);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Map<String, String>> deleteUser(@PathVariable Long id) {
        adminService.deleteUser(id);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** Выдать/снять права администратора — доступно только супер-админу. */
    @PostMapping("/users/{id}/role")
    public ResponseEntity<Map<String, String>> setRole(@PathVariable Long id,
                                                       @AuthenticationPrincipal User currentUser,
                                                       @RequestBody Map<String, Object> body) {
        boolean makeAdmin = Boolean.TRUE.equals(body.get("admin"));
        adminService.setAdminRole(currentUser.getUsername(), id, makeAdmin);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** Отправить пользователю предупреждение (уведомление). */
    @PostMapping("/users/{id}/warn")
    public ResponseEntity<Map<String, String>> warn(@PathVariable Long id,
                                                    @RequestBody(required = false) Map<String, String> body) {
        adminService.warn(id, body != null ? body.get("message") : null);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @DeleteMapping("/reviews/{id}")
    public ResponseEntity<Map<String, String>> deleteReview(@PathVariable Long id,
                                                            @RequestBody(required = false) Map<String, String> body) {
        String reason = body != null ? body.get("reason") : null;
        adminService.deleteReview(id, reason);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }
}
