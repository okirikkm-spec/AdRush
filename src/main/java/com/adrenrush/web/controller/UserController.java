package com.adrenrush.web.controller;

import com.adrenrush.web.dto.UserCardDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** Публичный профиль: отзывы и тир-лист (если профиль не закрыт). */
    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> profile(@PathVariable Long id,
                                                       @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.getPublicProfile(id, currentUser));
    }

    /**
     * Карточка мини-профиля: имя, обложка, дата регистрации и сводка активности.
     * Лёгкая замена полного профиля — открывается по клику на автора отзыва.
     */
    @GetMapping("/{id}/card")
    public ResponseEntity<UserCardDto> card(@PathVariable Long id,
                                            @AuthenticationPrincipal User currentUser) {
        return ResponseEntity.ok(userService.getUserCard(id, currentUser));
    }
}
