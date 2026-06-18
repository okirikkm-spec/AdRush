package com.adrenrush.web.service;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.entity.Drink;
import com.adrenrush.web.entity.DrinkPhoto;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.AuditAction;
import com.adrenrush.web.enums.AuditTargetType;
import com.adrenrush.web.enums.PhotoSource;
import com.adrenrush.web.exception.ApiException;
import com.adrenrush.web.repository.DrinkPhotoRepository;
import com.adrenrush.web.repository.DrinkRepository;
import com.adrenrush.web.repository.ReviewRepository;
import lombok.RequiredArgsConstructor;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class DrinkService {

    private static final Logger log = LoggerFactory.getLogger(DrinkService.class);

    private final DrinkRepository drinkRepository;
    private final DrinkPhotoRepository photoRepository;
    private final ReviewRepository reviewRepository;
    private final StorageService storageService;
    private final ImageService imageService;
    private final AuditService auditService;

    /** Список всех энергетиков, отсортированный по средней оценке (по убыванию). */
    @Transactional(readOnly = true)
    public List<DrinkResponseDto> listAllSortedByRating() {
        return drinkRepository.findAll().stream()
            .map(this::toSummary)
            .sorted(Comparator
                .comparingDouble(DrinkResponseDto::getAverageRating).reversed()
                .thenComparing(Comparator.comparingInt(DrinkResponseDto::getReviewCount).reversed())
                .thenComparing(DrinkResponseDto::getName, Comparator.nullsLast(String::compareTo)))
            .toList();
    }

    @Transactional(readOnly = true)
    public DrinkResponseDto getById(Long id) {
        Drink drink = drinkRepository.findById(id)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        double avg = avg(drink.getId());
        int count = count(drink.getId());
        List<DrinkPhoto> photos = photoRepository.findByDrinkIdOrderByPositionAscIdAsc(drink.getId());
        return DrinkResponseDto.full(drink, avg, count, distribution(drink.getId()), photos);
    }

    /** Итог обработки одной спарсенной записи. */
    public enum ParseOutcome { CREATED, UPDATED, SKIPPED }

    /** Сводка прохода парсера: сколько карточек создано и сколько обновлено. */
    public record ParseResult(int created, int updated) {}

    /**
     * Заводит или обновляет энергетик из спарсенной записи. Дедупликация — по {@code sourceUrl}.
     *
     * @param brand         бренд (источник парсинга), проставляется и при создании, и при обновлении
     * @param downloadCover true — скачать обложку в наше хранилище; false — сохранить внешнюю ссылку
     *                      как есть (для CDN, тротлящих серверное скачивание, например Monster)
     * @param reparse       false — существующие записи пропускаются (только новые);
     *                      true — у существующих обновляются название/описание/бренд из источника
     * @return CREATED — создана новая карточка; UPDATED — обновлена существующая; SKIPPED — без изменений
     */
    @Transactional
    public ParseOutcome upsertFromParser(String name, String description, String brand, String coverUrl,
                                         String sourceUrl, boolean downloadCover, boolean reparse) {
        Drink existing = sourceUrl != null ? drinkRepository.findBySourceUrl(sourceUrl).orElse(null) : null;
        if (existing != null) {
            if (!reparse) return ParseOutcome.SKIPPED;
            boolean changed = false;
            if (name != null && !name.isBlank() && !name.trim().equals(existing.getName())) {
                existing.setName(name.trim());
                changed = true;
            }
            if (description != null && !Objects.equals(description, existing.getDescription())) {
                existing.setDescription(description);
                changed = true;
            }
            if (brand != null && !brand.isBlank() && !brand.equals(existing.getBrand())) {
                existing.setBrand(brand);
                changed = true;
            }
            if (changed) drinkRepository.save(existing);
            return changed ? ParseOutcome.UPDATED : ParseOutcome.SKIPPED;
        }

        Drink drink = new Drink();
        drink.setName(name.trim());
        drink.setBrand(brand);
        drink.setSlug(uniqueSlug(name.trim()));
        drink.setDescription(description);
        drink.setSourceUrl(sourceUrl);
        drinkRepository.save(drink);

        if (coverUrl != null && !coverUrl.isBlank()) {
            if (downloadCover) {
                addRemotePhoto(drink, coverUrl.trim(), PhotoSource.PARSED, null);
            } else {
                addPhoto(drink, coverUrl.trim(), null, PhotoSource.PARSED, null);
            }
        }
        return ParseOutcome.CREATED;
    }

    /** Проставляет бренд карточкам, у которых он ещё не задан (однократный бэкафилл по источнику/названию). */
    @Transactional
    public void backfillMissingBrands() {
        for (Drink d : drinkRepository.findAll()) {
            if (d.getBrand() != null && !d.getBrand().isBlank()) continue;
            d.setBrand(inferBrand(d.getSourceUrl(), d.getName()));
            drinkRepository.save(d);
        }
    }

    /** Эвристика бренда по ссылке-источнику и названию (для бэкафилла старых записей). */
    private String inferBrand(String sourceUrl, String name) {
        String s = (sourceUrl == null ? "" : sourceUrl).toLowerCase(Locale.ROOT);
        String n = (name == null ? "" : name).toLowerCase(Locale.ROOT);
        if (s.contains("monster") || n.startsWith("monster") || n.contains("monster")) {
            return MonsterParserService.BRAND;
        }
        return ParserService.BRAND;
    }

    @Transactional(readOnly = true)
    public long count() {
        return drinkRepository.count();
    }

    @Transactional
    public DrinkResponseDto create(User actor, String name, String brand, String description, String coverUrl) {
        if (name == null || name.isBlank()) {
            throw ApiException.badRequest("Введите название энергетика");
        }
        Drink drink = new Drink();
        drink.setName(name.trim());
        drink.setBrand(brand != null && !brand.isBlank() ? brand.trim() : null);
        drink.setSlug(uniqueSlug(name.trim()));
        drink.setDescription(description);
        drinkRepository.save(drink);

        boolean hasCover = coverUrl != null && !coverUrl.isBlank();
        if (hasCover) {
            addRemotePhoto(drink, coverUrl.trim(), PhotoSource.PARSED, null);
        }
        auditService.record(actor, AuditAction.DRINK_CREATE, AuditTargetType.DRINK, drink.getId(), drink.getName(),
            "Создана карточка «" + drink.getName() + "»"
                + (description != null && !description.isBlank() ? " · с описанием" : "")
                + (hasCover ? " · с обложкой" : ""));
        return toSummary(drink);
    }

    /** Редактирование энергетика (название/описание) — для администратора. */
    @Transactional
    public DrinkResponseDto update(User actor, Long id, String name, String description) {
        Drink drink = drinkRepository.findById(id)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));

        String oldName = drink.getName();
        String oldDesc = drink.getDescription();
        List<String> changes = new ArrayList<>();

        if (name != null && !name.isBlank() && !name.trim().equals(oldName)) {
            changes.add("название: «" + oldName + "» → «" + name.trim() + "»");
            drink.setName(name.trim());
        }
        if (description != null && !Objects.equals(description, oldDesc)) {
            changes.add(describeDescChange(oldDesc, description));
            drink.setDescription(description);
        }
        drinkRepository.save(drink);

        if (!changes.isEmpty()) {
            auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, drink.getId(), drink.getName(),
                String.join("; ", changes));
        }
        return getById(id);
    }

    /** Настройка кадрирования обложки (ракурс на карточке и в окне) — для администратора. */
    @Transactional
    public DrinkResponseDto updateCoverFraming(User actor, Long id, String fitCard, String posCard,
                                               String fitModal, String posModal) {
        Drink drink = drinkRepository.findById(id)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        drink.setCoverFitCard(sanitizeFit(fitCard));
        drink.setCoverPosCard(sanitizePos(posCard));
        drink.setCoverFitModal(sanitizeFit(fitModal));
        drink.setCoverPosModal(sanitizePos(posModal));
        drinkRepository.save(drink);
        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, drink.getId(), drink.getName(),
            "Настроено кадрирование обложки");
        return getById(id);
    }

    /** Допускаем только два значения object-fit; иначе — null (значение по умолчанию на фронте). */
    private String sanitizeFit(String fit) {
        return ("cover".equals(fit) || "contain".equals(fit)) ? fit : null;
    }

    /** Принимаем object-position только в формате "NN% NN%"; иначе — null. */
    private String sanitizePos(String pos) {
        return (pos != null && pos.matches("\\d{1,3}% \\d{1,3}%")) ? pos : null;
    }

    /** Полное удаление энергетика (фото из хранилища, отзывы, сама карточка) — для администратора. */
    @Transactional
    public void delete(User actor, Long id) {
        Drink drink = drinkRepository.findById(id)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        String name = drink.getName();
        int photos = photoRepository.countByDrinkId(id);
        int reviews = count(id);
        // удаляем файлы фотографий из хранилища
        for (DrinkPhoto p : photoRepository.findByDrinkIdOrderByPositionAscIdAsc(id)) {
            storageService.delete(p.getUrl());
        }
        // отзывы ссылаются на напиток — удаляем их перед карточкой
        reviewRepository.deleteByDrinkId(id);
        // удаление карточки каскадно убирает строки фотографий
        drinkRepository.delete(drink);

        auditService.record(actor, AuditAction.DRINK_DELETE, AuditTargetType.DRINK, id, name,
            "Удалена карточка «" + name + "»"
                + (reviews > 0 ? " · отзывов: " + reviews : "")
                + (photos > 0 ? " · фото: " + photos : ""));
    }

    /** Удаление фотографии из галереи (вместе с файлом в хранилище) — для администратора. */
    @Transactional
    public DrinkResponseDto deletePhoto(User actor, Long drinkId, Long photoId) {
        DrinkPhoto photo = photoRepository.findById(photoId)
            .orElseThrow(() -> ApiException.notFound("Фотография не найдена"));
        if (!photo.getDrink().getId().equals(drinkId)) {
            throw ApiException.badRequest("Фото не относится к этому энергетику");
        }
        String drinkName = photo.getDrink().getName();
        storageService.delete(photo.getUrl());
        photoRepository.delete(photo);

        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, drinkId, drinkName,
            "Удалено фото из галереи");
        return getById(drinkId);
    }

    /** Меняет порядок фотографий по списку их id (позиция = индекс в списке). Первое фото — обложка. */
    @Transactional
    public DrinkResponseDto reorderPhotos(User actor, Long drinkId, List<Long> orderedIds) {
        Drink drink = drinkRepository.findById(drinkId)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        List<DrinkPhoto> photos = photoRepository.findByDrinkIdOrderByPositionAscIdAsc(drinkId);
        Map<Long, DrinkPhoto> byId = new LinkedHashMap<>();
        for (DrinkPhoto p : photos) byId.put(p.getId(), p);

        if (orderedIds == null || orderedIds.size() != photos.size() || !byId.keySet().containsAll(orderedIds)) {
            throw ApiException.badRequest("Некорректный порядок фотографий");
        }

        int pos = 0;
        for (Long id : orderedIds) {
            DrinkPhoto p = byId.get(id);
            p.setPosition(pos++);
            photoRepository.save(p);
        }
        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, drinkId, drink.getName(),
            "Изменён порядок фотографий");
        return getById(drinkId);
    }

    /** Сводка прохода оптимизации медиа. */
    public record MediaOptimizeResult(int downloaded, int thumbnailed, int skipped, int failed) {}

    private enum PhotoOutcome { DOWNLOADED, THUMBNAILED, SKIPPED, FAILED }

    /**
     * Разовая оптимизация медиа (админ-операция):
     *  1) внешние картинки (Monster CDN и т.п.) скачиваются в наше хранилище — грузятся быстрее и не зависят от CDN;
     *  2) для уже сохранённых фото без превью оно достраивается.
     * Внимание: на боевом сервере скачивание Monster может упираться в Cloudflare/CDN-троттлинг —
     * такие фото останутся внешними ссылками (попадут в «ошибки»), запускать лучше там, где CDN доступен.
     */
    public MediaOptimizeResult optimizeMedia(User actor) {
        int downloaded = 0, thumbnailed = 0, skipped = 0, failed = 0;
        for (Long id : photoRepository.findAllIds()) {
            switch (optimizePhoto(id)) {
                case DOWNLOADED -> downloaded++;
                case THUMBNAILED -> thumbnailed++;
                case SKIPPED -> skipped++;
                case FAILED -> failed++;
            }
        }
        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, null, "Медиа",
            "Оптимизация медиа: скачано " + downloaded + ", превью " + thumbnailed
                + ", пропущено " + skipped + ", ошибок " + failed);
        return new MediaOptimizeResult(downloaded, thumbnailed, skipped, failed);
    }

    /**
     * Обрабатывает одно фото. Не {@code @Transactional}: сетевые загрузки идут вне транзакции,
     * каждое {@code save}/{@code find} оборачивается своей короткой транзакцией Spring Data.
     */
    private PhotoOutcome optimizePhoto(Long photoId) {
        DrinkPhoto photo = photoRepository.findById(photoId).orElse(null);
        if (photo == null) return PhotoOutcome.SKIPPED;
        String url = photo.getUrl();
        boolean external = url != null && (url.startsWith("http://") || url.startsWith("https://"));
        try {
            if (external) {
                Long drinkId = photoRepository.findDrinkIdById(photoId);
                StoredImage stored = fetchAndStore("photos/" + drinkId, url);
                photo.setUrl(stored.url());
                photo.setThumbUrl(stored.thumbUrl());
                photoRepository.save(photo);
                return PhotoOutcome.DOWNLOADED;
            }
            if (photo.getThumbUrl() == null) {
                String key = storageKeyOf(url);
                byte[] data = storageService.readBytes(url);
                if (key == null || data == null) return PhotoOutcome.SKIPPED;
                String ct = url.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
                String thumbUrl = generateAndStoreThumb(key, data, ct);
                if (thumbUrl == null) return PhotoOutcome.SKIPPED;
                photo.setThumbUrl(thumbUrl);
                photoRepository.save(photo);
                return PhotoOutcome.THUMBNAILED;
            }
            return PhotoOutcome.SKIPPED;
        } catch (Exception e) {
            log.warn("optimizeMedia: фото {} ({}) — {}", photoId, url, e.getMessage());
            return PhotoOutcome.FAILED;
        }
    }

    private String describeDescChange(String oldDesc, String newDesc) {
        boolean oldEmpty = oldDesc == null || oldDesc.isBlank();
        boolean newEmpty = newDesc == null || newDesc.isBlank();
        if (oldEmpty && !newEmpty) return "добавлено описание";
        if (!oldEmpty && newEmpty) return "описание очищено";
        return "описание изменено";
    }

    /** Добавляет пользовательское фото в конец галереи (с генерацией превью). */
    @Transactional
    public DrinkResponseDto addUserPhoto(Long drinkId, MultipartFile file, User uploader) {
        Drink drink = drinkRepository.findById(drinkId)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));

        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw ApiException.badRequest("Можно загружать только изображения");
        }
        String ext = contentType.substring(contentType.indexOf('/') + 1).replaceAll("[^a-zA-Z0-9]", "");
        if (ext.isBlank()) ext = "jpg";

        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("Не удалось прочитать загруженный файл");
        }

        String key = "photos/" + drinkId + "/" + System.currentTimeMillis() + "." + ext;
        StoredImage stored;
        try {
            stored = storeImage(key, data, contentType);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INSUFFICIENT_STORAGE, "Не удалось сохранить изображение");
        }

        addPhoto(drink, stored.url(), stored.thumbUrl(), PhotoSource.USER, uploader);
        return getById(drinkId);
    }

    /** Добавляет пользовательское фото по ссылке: скачивает картинку в наше хранилище (с превью). */
    @Transactional
    public DrinkResponseDto addUserPhotoByUrl(Long drinkId, String url, User uploader) {
        Drink drink = drinkRepository.findById(drinkId)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        if (url == null || url.isBlank()) {
            throw ApiException.badRequest("Укажите ссылку на изображение");
        }
        StoredImage stored;
        try {
            stored = fetchAndStore("photos/" + drinkId, url.trim());
        } catch (Exception e) {
            throw ApiException.badRequest("Не удалось загрузить изображение по ссылке");
        }
        addPhoto(drink, stored.url(), stored.thumbUrl(), PhotoSource.USER, uploader);
        return getById(drinkId);
    }

    /** Скачивает изображение по ссылке в хранилище (с превью); при сбое — оставляет внешнюю ссылку. */
    private void addRemotePhoto(Drink drink, String url, PhotoSource source, User uploader) {
        try {
            StoredImage stored = fetchAndStore("photos/" + drink.getId(), url);
            addPhoto(drink, stored.url(), stored.thumbUrl(), source, uploader);
        } catch (Exception e) {
            log.warn("Не удалось скачать изображение {} ({}) — сохраняю внешнюю ссылку", url, e.getMessage());
            addPhoto(drink, url, null, source, uploader);
        }
    }

    /** Оригинал + (если получилось) превью, сохранённые в хранилище. */
    private record StoredImage(String url, String thumbUrl) {}

    /** Загружает картинку по URL и кладёт в хранилище (оригинал + превью). */
    private StoredImage fetchAndStore(String prefix, String url) throws Exception {
        Connection.Response resp = Jsoup.connect(url)
            .ignoreContentType(true)
            // максимально «браузерный» UA — некоторые CDN режут запросы по нестандартному агенту
            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
            .timeout(20000)
            .maxBodySize(25 * 1024 * 1024)
            .execute();

        String contentType = resp.contentType();
        if (contentType != null) contentType = contentType.split(";")[0].trim();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("Ссылка не ведёт на изображение");
        }

        String key = prefix + "/" + System.currentTimeMillis() + "-"
            + Integer.toHexString(url.hashCode()) + "." + imageExt(contentType);
        return storeImage(key, resp.bodyAsBytes(), contentType);
    }

    /** Сохраняет оригинал по ключу и рядом — превью (если формат поддержан). */
    private StoredImage storeImage(String baseKey, byte[] data, String contentType) throws Exception {
        String url;
        try (ByteArrayInputStream in = new ByteArrayInputStream(data)) {
            url = storageService.store(baseKey, in, contentType);
        }
        return new StoredImage(url, generateAndStoreThumb(baseKey, data, contentType));
    }

    /** Делает превью из байтов и кладёт рядом с оригиналом; null — если формат не поддержан/нет выигрыша. */
    private String generateAndStoreThumb(String baseKey, byte[] data, String contentType) {
        boolean png = contentType != null && contentType.toLowerCase().contains("png");
        String format = png ? "png" : "jpg";
        String thumbContentType = png ? "image/png" : "image/jpeg";
        Optional<byte[]> thumb = imageService.makeThumbnail(data, format);
        if (thumb.isEmpty()) return null;
        try (ByteArrayInputStream in = new ByteArrayInputStream(thumb.get())) {
            return storageService.store(thumbKey(baseKey, format), in, thumbContentType);
        } catch (Exception e) {
            log.warn("Не удалось сохранить превью для {}: {}", baseKey, e.getMessage());
            return null;
        }
    }

    /** Ключ превью рядом с оригиналом: "photos/12/123.jpg" → "photos/12/123-thumb.jpg". */
    private String thumbKey(String baseKey, String ext) {
        int dot = baseKey.lastIndexOf('.');
        String stem = (dot >= 0) ? baseKey.substring(0, dot) : baseKey;
        return stem + "-thumb." + ext;
    }

    /** Относительный ключ хранилища из публичного пути (/uploads/x, /media/x → x); null для внешних ссылок. */
    private String storageKeyOf(String urlPath) {
        if (urlPath == null) return null;
        if (urlPath.startsWith("/uploads/")) return urlPath.substring("/uploads/".length());
        if (urlPath.startsWith("/media/")) return urlPath.substring("/media/".length());
        return null;
    }

    private String imageExt(String contentType) {
        return switch (contentType.toLowerCase()) {
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            case "image/gif" -> "gif";
            case "image/svg+xml" -> "svg";
            default -> "jpg";
        };
    }

    private void addPhoto(Drink drink, String url, String thumbUrl, PhotoSource source, User uploader) {
        int nextPos = photoRepository.countByDrinkId(drink.getId());
        DrinkPhoto photo = new DrinkPhoto();
        photo.setDrink(drink);
        photo.setUrl(url);
        photo.setThumbUrl(thumbUrl);
        photo.setSource(source);
        photo.setUploadedBy(uploader);
        photo.setPosition(nextPos);
        photoRepository.save(photo);
    }

    private DrinkResponseDto toSummary(Drink drink) {
        double avg = avg(drink.getId());
        int count = count(drink.getId());
        List<DrinkPhoto> photos = photoRepository.findByDrinkIdOrderByPositionAscIdAsc(drink.getId());
        // в списке достаточно лёгкого превью обложки (если оно есть)
        DrinkPhoto first = photos.isEmpty() ? null : photos.get(0);
        String cover = first == null ? null
            : (first.getThumbUrl() != null ? first.getThumbUrl() : first.getUrl());
        return DrinkResponseDto.summary(drink, avg, count, distribution(drink.getId()), cover);
    }

    /** Карта балл (10→1) → количество таких оценок (все 10 ключей присутствуют). */
    private Map<Integer, Integer> distribution(Long drinkId) {
        Map<Integer, Integer> dist = new LinkedHashMap<>();
        for (int score = 10; score >= 1; score--) {
            dist.put(score, 0);
        }
        for (Object[] row : reviewRepository.getRatingDistribution(drinkId)) {
            Integer rating = (Integer) row[0];
            Long c = (Long) row[1];
            if (rating != null) {
                dist.put(rating, c.intValue());
            }
        }
        return dist;
    }

    private double avg(Long drinkId) {
        Double a = reviewRepository.getAverageByDrinkId(drinkId);
        return a != null ? Math.round(a * 10.0) / 10.0 : 0.0;
    }

    private int count(Long drinkId) {
        Integer c = reviewRepository.getCountByDrinkId(drinkId);
        return c != null ? c : 0;
    }

    private String uniqueSlug(String name) {
        String base = slugify(name);
        if (base.isBlank()) base = "drink";
        String slug = base;
        int i = 2;
        while (drinkRepository.findBySlug(slug).isPresent()) {
            slug = base + "-" + i++;
        }
        return slug;
    }

    private String slugify(String input) {
        String n = Normalizer.normalize(input, Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "");
        // транслитерация кириллицы
        n = translit(n.toLowerCase(Locale.ROOT));
        n = n.replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        return n;
    }

    private String translit(String s) {
        String[][] map = {
            {"а","a"},{"б","b"},{"в","v"},{"г","g"},{"д","d"},{"е","e"},{"ё","e"},
            {"ж","zh"},{"з","z"},{"и","i"},{"й","y"},{"к","k"},{"л","l"},{"м","m"},
            {"н","n"},{"о","o"},{"п","p"},{"р","r"},{"с","s"},{"т","t"},{"у","u"},
            {"ф","f"},{"х","h"},{"ц","c"},{"ч","ch"},{"ш","sh"},{"щ","sch"},{"ъ",""},
            {"ы","y"},{"ь",""},{"э","e"},{"ю","yu"},{"я","ya"}
        };
        for (String[] pair : map) {
            s = s.replace(pair[0], pair[1]);
        }
        return s;
    }
}
