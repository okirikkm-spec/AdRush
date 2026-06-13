package com.adrenrush.web.controller;

import com.adrenrush.web.dto.UserResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.AuthService;
import com.adrenrush.web.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final UserService userService;

    /* ── Регистрация / вход ── */

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(@RequestBody Map<String, String> body,
                                                         HttpServletRequest request) {
        String token = authService.register(
            body.get("username"), body.get("password"), clientIp(request), body.get("fingerprint"));
        return ResponseEntity.ok(Map.of("token", token));
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(@RequestBody Map<String, String> body,
                                                     HttpServletRequest request) {
        String token = authService.login(
            body.get("username"), body.get("password"), body.get("code"),
            clientIp(request), body.get("fingerprint"));
        return ResponseEntity.ok(Map.of("token", token));
    }

    /** Восстановление пароля по коду из приложения-аутентификатора. */
    @PostMapping("/recover")
    public ResponseEntity<Map<String, String>> recover(@RequestBody Map<String, String> body) {
        authService.recoverPassword(body.get("username"), body.get("code"), body.get("newPassword"));
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /* ── Текущий пользователь ── */

    @GetMapping("/me")
    public ResponseEntity<UserResponseDto> getMe(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(UserResponseDto.from(currentUser));
    }

    @PutMapping("/me")
    public ResponseEntity<UserResponseDto> updateMe(@AuthenticationPrincipal User currentUser,
                                                    @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(userService.updateProfile(currentUser, body.get("displayName")));
    }

    @PostMapping("/me/avatar")
    public ResponseEntity<UserResponseDto> uploadAvatar(@AuthenticationPrincipal User currentUser,
                                                        @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(userService.updateAvatar(currentUser, file));
    }

    @PostMapping("/me/password")
    public ResponseEntity<Map<String, String>> changePassword(@AuthenticationPrincipal User currentUser,
                                                              @RequestBody Map<String, String> body) {
        userService.changePassword(currentUser, body.get("oldPassword"), body.get("newPassword"));
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    @PostMapping("/me/privacy")
    public ResponseEntity<UserResponseDto> setPrivacy(@AuthenticationPrincipal User currentUser,
                                                      @RequestBody Map<String, Boolean> body) {
        boolean isPrivate = Boolean.TRUE.equals(body.get("private"));
        return ResponseEntity.ok(userService.setPrivacy(currentUser, isPrivate));
    }

    /* ── Двухфакторная аутентификация ── */

    @PostMapping("/2fa/setup")
    public ResponseEntity<Map<String, String>> setup2fa(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.start2fa(currentUser));
    }

    @PostMapping("/2fa/enable")
    public ResponseEntity<Map<String, String>> enable2fa(@AuthenticationPrincipal User currentUser,
                                                         @RequestBody Map<String, String> body) {
        userService.enable2fa(currentUser, body.get("code"));
        return ResponseEntity.ok(Map.of("status", "enabled"));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<Map<String, String>> disable2fa(@AuthenticationPrincipal User currentUser,
                                                          @RequestBody Map<String, String> body) {
        userService.disable2fa(currentUser, body.get("code"));
        return ResponseEntity.ok(Map.of("status", "disabled"));
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
