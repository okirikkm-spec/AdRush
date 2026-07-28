package com.adrenrush.web.controller;

import com.adrenrush.web.dto.UserResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.AuthService;
import com.adrenrush.web.service.EmailVerificationService;
import com.adrenrush.web.service.PasswordResetService;
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
    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;

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

    /**
     * Восстановление по коду на привязанную почту — для аккаунтов без 2FA.
     * Шаг 1: выслать код.
     */
    @PostMapping("/recover/email/request")
    public ResponseEntity<Map<String, Object>> recoverByEmailRequest(@RequestBody Map<String, String> body) {
        return ResponseEntity.ok(passwordResetService.requestCode(body.get("username")));
    }

    /** Шаг 2: проверить код и задать новый пароль. */
    @PostMapping("/recover/email/confirm")
    public ResponseEntity<Map<String, String>> recoverByEmailConfirm(@RequestBody Map<String, String> body) {
        passwordResetService.confirmReset(body.get("username"), body.get("code"), body.get("newPassword"));
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

    /** Обложка мини-профиля. fit/pos — кадрирование, можно передать сразу с картинкой. */
    @PostMapping("/me/banner")
    public ResponseEntity<UserResponseDto> uploadBanner(@AuthenticationPrincipal User currentUser,
                                                        @RequestParam("file") MultipartFile file,
                                                        @RequestParam(value = "fit", required = false) String fit,
                                                        @RequestParam(value = "pos", required = false) String pos) {
        return ResponseEntity.ok(userService.updateBanner(currentUser, file, fit, pos));
    }

    /** Кадрирование уже загруженной обложки. */
    @PutMapping("/me/banner/framing")
    public ResponseEntity<UserResponseDto> updateBannerFraming(@AuthenticationPrincipal User currentUser,
                                                               @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(userService.updateBannerFraming(currentUser, body.get("fit"), body.get("pos")));
    }

    @DeleteMapping("/me/banner")
    public ResponseEntity<UserResponseDto> deleteBanner(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.removeBanner(currentUser));
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

    /* ── Привязка почты ──
       Одна почта — один аккаунт: адрес попадает в профиль только после ввода кода из письма. */

    @GetMapping("/me/email")
    public ResponseEntity<Map<String, Object>> emailStatus(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(emailVerificationService.status(currentUser));
    }

    /** Шаг 1: выслать код на указанный адрес. */
    @PostMapping("/me/email/request")
    public ResponseEntity<Map<String, Object>> requestEmailCode(@AuthenticationPrincipal User currentUser,
                                                                @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(emailVerificationService.requestCode(currentUser, body.get("email")));
    }

    /** Шаг 2: подтвердить код и привязать почту. */
    @PostMapping("/me/email/confirm")
    public ResponseEntity<Map<String, Object>> confirmEmailCode(@AuthenticationPrincipal User currentUser,
                                                                @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(emailVerificationService.confirmCode(currentUser, body.get("code")));
    }

    /** Отменить незавершённую привязку. */
    @PostMapping("/me/email/cancel")
    public ResponseEntity<Map<String, Object>> cancelEmailBinding(@AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(emailVerificationService.cancel(currentUser));
    }

    /** Отвязать подтверждённую почту (подтверждается паролем). */
    @PostMapping("/me/email/unbind")
    public ResponseEntity<Map<String, Object>> unbindEmail(@AuthenticationPrincipal User currentUser,
                                                           @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(emailVerificationService.unbind(currentUser, body.get("password")));
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
