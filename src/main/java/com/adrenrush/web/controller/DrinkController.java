package com.adrenrush.web.controller;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.service.DrinkService;
import com.adrenrush.web.service.MonsterParserService;
import com.adrenrush.web.service.ParserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/drinks")
@RequiredArgsConstructor
public class DrinkController {

    private final DrinkService drinkService;
    private final ParserService parserService;
    private final MonsterParserService monsterParserService;

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
            currentUser, body.get("name"), body.get("brand"), body.get("description"), body.get("coverUrl"));
        return ResponseEntity.ok(created);
    }

    /** Добавление фото в галерею (файл) — только администратор. */
    @PostMapping("/{id}/photos")
    public ResponseEntity<DrinkResponseDto> addPhoto(@PathVariable Long id,
                                                     @AuthenticationPrincipal User currentUser,
                                                     @RequestParam("file") MultipartFile file) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.addUserPhoto(id, file, currentUser));
    }

    /** Добавление фото по ссылке (скачивается в хранилище) — только администратор. */
    @PostMapping("/{id}/photos/url")
    public ResponseEntity<DrinkResponseDto> addPhotoByUrl(@PathVariable Long id,
                                                          @AuthenticationPrincipal User currentUser,
                                                          @RequestBody Map<String, String> body) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.addUserPhotoByUrl(id, body.get("url"), currentUser));
    }

    /** Изменение порядка фотографий галереи (первое = обложка) — только администратор. */
    @PutMapping("/{id}/photos/order")
    public ResponseEntity<DrinkResponseDto> reorderPhotos(@PathVariable Long id,
                                                          @AuthenticationPrincipal User currentUser,
                                                          @RequestBody Map<String, List<Long>> body) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.reorderPhotos(currentUser, id, body.get("order")));
    }

    /** Редактирование энергетика (описание/название) — только администратор. */
    @PutMapping("/{id}")
    public ResponseEntity<DrinkResponseDto> update(@PathVariable Long id,
                                                   @AuthenticationPrincipal User currentUser,
                                                   @RequestBody Map<String, String> body) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.update(currentUser, id, body.get("name"), body.get("description")));
    }

    /** Настройка кадрирования обложки (ракурс для карточки и окна) — только администратор. */
    @PutMapping("/{id}/cover")
    public ResponseEntity<DrinkResponseDto> updateCover(@PathVariable Long id,
                                                        @AuthenticationPrincipal User currentUser,
                                                        @RequestBody Map<String, String> body) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.updateCoverFraming(currentUser, id,
            body.get("coverFitCard"), body.get("coverPosCard"),
            body.get("coverFitModal"), body.get("coverPosModal")));
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

    /** Список брендов, для которых есть парсер каталога — для окна парсинга в админке. */
    @GetMapping("/parse/sources")
    public ResponseEntity<List<String>> parseSources(@AuthenticationPrincipal User currentUser) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(List.of(ParserService.BRAND, MonsterParserService.BRAND));
    }

    /**
     * Ручной запуск парсеров для выбранных брендов — только для администратора.
     * Тело: {@code {"brands": ["Adrenaline Rush", "Monster"], "reparse": false}}.
     * reparse=false — только новые карточки; reparse=true — обновить и существующие.
     */
    @PostMapping("/parse")
    public ResponseEntity<Map<String, Object>> parse(@AuthenticationPrincipal User currentUser,
                                                     @RequestBody(required = false) Map<String, Object> body) {
        requireAdmin(currentUser);
        Map<String, Object> payload = body != null ? body : Map.of();
        List<String> brands = asStringList(payload.get("brands"));
        boolean reparse = Boolean.TRUE.equals(payload.get("reparse"));
        if (brands.isEmpty()) {
            throw ApiException.badRequest("Выберите хотя бы один бренд для парсинга");
        }

        int created = 0;
        int updated = 0;
        if (brands.contains(ParserService.BRAND)) {
            DrinkService.ParseResult r = parserService.parse(reparse);
            created += r.created();
            updated += r.updated();
        }
        if (brands.contains(MonsterParserService.BRAND)) {
            DrinkService.ParseResult r = monsterParserService.parse(reparse);
            created += r.created();
            updated += r.updated();
        }
        return ResponseEntity.ok(Map.of("created", created, "updated", updated));
    }

    private List<String> asStringList(Object raw) {
        if (raw instanceof List<?> list) {
            return list.stream().filter(Objects::nonNull).map(Object::toString).toList();
        }
        return List.of();
    }

    private void requireAdmin(User user) {
        if (user == null || user.getRole() != RoleEnum.ADMIN) {
            throw ApiException.forbidden("Недостаточно прав");
        }
    }
}
