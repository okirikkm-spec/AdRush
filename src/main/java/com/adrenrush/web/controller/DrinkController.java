package com.adrenrush.web.controller;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.CandidateStatus;
import com.adrenrush.web.enums.RoleEnum;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.service.DrinkService;
import com.adrenrush.web.service.ParserStagingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/drinks")
@RequiredArgsConstructor
public class DrinkController {

    private final DrinkService drinkService;
    private final ParserStagingService stagingService;

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

    /**
     * Характеристики банки (объём, кофеин, сахар, калории, состав, страна) — только администратор.
     * Значения приходят строками из формы: пустая строка означает «не заполнено».
     */
    @PutMapping("/{id}/specs")
    public ResponseEntity<DrinkResponseDto> updateSpecs(@PathVariable Long id,
                                                        @AuthenticationPrincipal User currentUser,
                                                        @RequestBody Map<String, String> body) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.updateSpecs(currentUser, id,
            intOrNull(body.get("volumeMl")),
            decimalOrNull(body.get("caffeinePer100Ml")),
            decimalOrNull(body.get("sugarPer100Ml")),
            decimalOrNull(body.get("kcalPer100Ml")),
            body.get("ingredients"), body.get("country")));
    }

    private Integer intOrNull(String raw) {
        Double value = decimalOrNull(raw);
        return value == null ? null : (int) Math.round(value);
    }

    /** Число из формы: принимаем и «32.5», и «32,5»; мусор и пустая строка — это «не заполнено». */
    private Double decimalOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Double.valueOf(raw.trim().replace(',', '.'));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Чистка описаний, доставшихся от парсеров: англоязычные заглушки и тексты, повторяющиеся
     * у нескольких карточек. Только администратор.
     */
    @PostMapping("/descriptions/cleanup")
    public ResponseEntity<DrinkService.DescriptionCleanupResult> cleanupDescriptions(
        @AuthenticationPrincipal User currentUser) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.cleanupDescriptions(currentUser));
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

    /**
     * Оптимизация медиа (админ): внешние картинки скачиваются в наше хранилище, для фото без
     * превью оно достраивается. Сетевые загрузки могут занять время — ответ приходит по завершении.
     */
    @PostMapping("/media/optimize")
    public ResponseEntity<DrinkService.MediaOptimizeResult> optimizeMedia(@AuthenticationPrincipal User currentUser) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(drinkService.optimizeMedia(currentUser));
    }

    /** Источники с парсером каталога — для окна парсинга в админке. */
    @GetMapping("/parse/sources")
    public ResponseEntity<List<String>> parseSources(@AuthenticationPrincipal User currentUser) {
        requireAdmin(currentUser);
        return ResponseEntity.ok(stagingService.availableSources());
    }

    /**
     * Обход выбранных источников — только для администратора. Карточки НЕ создаются: найденное
     * попадает в приёмку, откуда администратор принимает нужное (см. {@link #parseCandidates}).
     * Тело: {@code {"brands": ["Adrenaline Rush"]}}.
     */
    @PostMapping("/parse")
    public ResponseEntity<ParserStagingService.ScanResult> parse(@AuthenticationPrincipal User currentUser,
                                                                @RequestBody(required = false) Map<String, Object> body) {
        requireAdmin(currentUser);
        Map<String, Object> payload = body != null ? body : Map.of();
        List<String> brands = asStringList(payload.get("brands"));
        if (brands.isEmpty()) {
            throw ApiException.badRequest("Выберите хотя бы один источник для парсинга");
        }
        return ResponseEntity.ok(stagingService.scan(brands));
    }

    /**
     * Позиции приёмки: {@code status=PENDING} — ждут решения, {@code status=IGNORED} — вкладка
     * «Игнор» (отклонённые ранее; при новых проходах галочка на них не ставится).
     */
    @GetMapping("/parse/candidates")
    public ResponseEntity<Map<String, Object>> parseCandidates(@AuthenticationPrincipal User currentUser,
                                                               @RequestParam(defaultValue = "PENDING") String status) {
        requireAdmin(currentUser);
        CandidateStatus parsed;
        try {
            parsed = CandidateStatus.valueOf(status.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest("Неизвестный статус: " + status);
        }
        return ResponseEntity.ok(Map.of(
            "items", stagingService.list(parsed),
            "counts", stagingService.counts()));
    }

    /**
     * Применяет решение по приёмке — только для администратора.
     * Тело: {@code {"accept": [{"id": 1, "name": "…", "description": "…"}], "ignore": [2, 3]}}.
     * Отмеченные позиции становятся карточками каталога (с правками названия/описания и загрузкой
     * обложки), перечисленные в {@code ignore} — уходят в игнор.
     */
    @PostMapping("/parse/candidates/apply")
    public ResponseEntity<ParserStagingService.ApplyResult> applyCandidates(
            @AuthenticationPrincipal User currentUser,
            @RequestBody Map<String, Object> body) {
        requireAdmin(currentUser);
        List<ParserStagingService.ApplyItem> accept = asApplyItems(body.get("accept"));
        List<Long> ignore = asIdList(body.get("ignore"));
        if (accept.isEmpty() && ignore.isEmpty()) {
            throw ApiException.badRequest("Нечего применять: не выбрано ни одной позиции");
        }
        return ResponseEntity.ok(stagingService.apply(currentUser, accept, ignore));
    }

    /** Возвращает позицию из игнора в список ожидающих решения — только администратор. */
    @PostMapping("/parse/candidates/{id}/unignore")
    public ResponseEntity<Map<String, String>> unignoreCandidate(@AuthenticationPrincipal User currentUser,
                                                                 @PathVariable Long id) {
        requireAdmin(currentUser);
        stagingService.unignore(id);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    /** Убирает позицию из приёмки совсем (товар исчез из магазина) — только администратор. */
    @DeleteMapping("/parse/candidates/{id}")
    public ResponseEntity<Map<String, String>> forgetCandidate(@AuthenticationPrincipal User currentUser,
                                                               @PathVariable Long id) {
        requireAdmin(currentUser);
        stagingService.forget(id);
        return ResponseEntity.ok(Map.of("status", "ok"));
    }

    private List<String> asStringList(Object raw) {
        if (raw instanceof List<?> list) {
            return list.stream().filter(Objects::nonNull).map(Object::toString).toList();
        }
        return List.of();
    }

    /** Разбирает {@code accept} из тела: элементы вида {@code {id, name, description}}. */
    private List<ParserStagingService.ApplyItem> asApplyItems(Object raw) {
        if (!(raw instanceof List<?> list)) return List.of();
        List<ParserStagingService.ApplyItem> items = new ArrayList<>();
        for (Object element : list) {
            if (!(element instanceof Map<?, ?> map)) continue;
            Long id = asLong(map.get("id"));
            if (id == null) continue;
            Object name = map.get("name");
            Object description = map.get("description");
            items.add(new ParserStagingService.ApplyItem(id,
                name != null ? name.toString() : null,
                description != null ? description.toString() : null));
        }
        return items;
    }

    private List<Long> asIdList(Object raw) {
        if (!(raw instanceof List<?> list)) return List.of();
        return list.stream().map(this::asLong).filter(Objects::nonNull).toList();
    }

    private Long asLong(Object raw) {
        if (raw instanceof Number number) return number.longValue();
        if (raw == null) return null;
        try {
            return Long.parseLong(raw.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private void requireAdmin(User user) {
        if (user == null || user.getRole() != RoleEnum.ADMIN) {
            throw ApiException.forbidden("Недостаточно прав");
        }
    }
}
