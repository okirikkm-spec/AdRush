package com.adrenrush.web.controller;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.service.DrinkService;
import com.adrenrush.web.service.ParserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/drinks")
@RequiredArgsConstructor
public class DrinkController {

    private final DrinkService drinkService;
    private final ParserService parserService;

    /** Все энергетики в порядке убывания оценки (для главной). */
    @GetMapping
    public ResponseEntity<List<DrinkResponseDto>> list() {
        return ResponseEntity.ok(drinkService.listAllSortedByRating());
    }

    @GetMapping("/{id}")
    public ResponseEntity<DrinkResponseDto> getOne(@PathVariable Long id) {
        return ResponseEntity.ok(drinkService.getById(id));
    }

    /** Добавление карточки энергетика — только для администратора. */
    @PostMapping
    public ResponseEntity<DrinkResponseDto> create(@AuthenticationPrincipal User currentUser,
                                                   @RequestBody Map<String, String> body) {
        requireAdmin(currentUser);
        DrinkResponseDto created = drinkService.create(
            currentUser, body.get("name"), body.get("description"), body.get("coverUrl"));
        return ResponseEntity.ok(created);
    }

    /** Любой авторизованный пользователь может добавить своё фото в галерею (файл). */
    @PostMapping("/{id}/photos")
    public ResponseEntity<DrinkResponseDto> addPhoto(@PathVariable Long id,
                                                     @AuthenticationPrincipal User currentUser,
                                                     @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(drinkService.addUserPhoto(id, file, currentUser));
    }

    /** Добавление фото по ссылке — изображение скачивается в наше хранилище. */
    @PostMapping("/{id}/photos/url")
    public ResponseEntity<DrinkResponseDto> addPhotoByUrl(@PathVariable Long id,
                                                          @AuthenticationPrincipal User currentUser,
                                                          @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(drinkService.addUserPhotoByUrl(id, body.get("url"), currentUser));
    }

    /** Редактирование энергетика (описание/название) — только администратор. */
    @PutMapping("/{id}")
    public ResponseEntity<DrinkResponseDto> update(@PathVariable Long id,
                                                   @AuthenticationPrincipal User currentUser,
                                                   @RequestBody Map<String, String> body) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.update(currentUser, id, body.get("name"), body.get("description")));
    }

    /** Удаление энергетика целиком — только администратор. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> delete(@PathVariable Long id,
                                                      @AuthenticationPrincipal User currentUser) {
        requireAdmin(currentUser);
        drinkService.delete(currentUser, id);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** Удаление фотографии из галереи — только администратор. */
    @DeleteMapping("/{id}/photos/{photoId}")
    public ResponseEntity<DrinkResponseDto> deletePhoto(@PathVariable Long id,
                                                        @PathVariable Long photoId,
                                                        @AuthenticationPrincipal User currentUser) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.deletePhoto(currentUser, id, photoId));
    }

    /** Ручной запуск парсера каталога — только для администратора. */
    @PostMapping("/parse")
    public ResponseEntity<Map<String, Object>> parse(@AuthenticationPrincipal User currentUser,
                                                     @RequestParam(defaultValue = "false") boolean full) {
        requireAdmin(currentUser);
        int created = parserService.parse(full);
        return ResponseEntity.ok(Map.of("created", created));
    }

    private void requireAdmin(User user) {
        if (user == null || user.getRole() != RoleEnum.ADMIN) {
            throw ApiException.forbidden("Недостаточно прав");
        }
    }
}
