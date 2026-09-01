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
import org.springframework.beans.factory.annotation.Value;
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

    /**
     * Вырезать ли белый фон у обложек из каталогов-источников. Пэкшоты магазинов сняты на белой
     * подложке, а сайт тёмный — без прозрачности банка сидит в белом прямоугольнике.
     */
    @Value("${media.remove-white-background:true}")
    private boolean removeWhiteBackground;

    /**
     * Вес априорного мнения в байесовском рейтинге: столько условных оценок «по среднему сайта»
     * подмешивается к каждому напитку. При 5 одиночный отзыв уже не выносит банку в топ, но и не
     * хоронит её — восьми-девяти реальных оценок хватает, чтобы карточка встала на своё место.
     */
    private static final double RATING_PRIOR_WEIGHT = 5.0;

    /** Средняя оценка по сайту, когда отзывов нет вообще, — середина десятибалльной шкалы. */
    private static final double RATING_FALLBACK_MEAN = 5.5;

    /** Список всех энергетиков, отсортированный по байесовскому рейтингу (по убыванию). */
    @Transactional(readOnly = true)
    public List<DrinkResponseDto> listAllSortedByRating() {
        double mean = globalAverageRating();
        return drinkRepository.findAll().stream()
            .map(this::toSummary)
            .sorted(Comparator
                .comparingDouble((DrinkResponseDto d) -> bayesianRating(d.getAverageRating(), d.getReviewCount(), mean))
                .reversed()
                .thenComparing(Comparator.comparingInt(DrinkResponseDto::getReviewCount).reversed())
                .thenComparing(DrinkResponseDto::getName, Comparator.nullsLast(String::compareTo)))
            .toList();
    }

    /**
     * Байесовское сглаживание: {@code (C·m + Σоценок) / (C + n)}, где m — средняя оценка по сайту,
     * C — {@link #RATING_PRIOR_WEIGHT}. Голое среднее ставило вровень «8.5 по двум отзывам» и
     * «8.5 по двадцати»: одного человека хватало, чтобы занести любую банку в первую десятку.
     * На карточке при этом показывается настоящее среднее — сглаживание влияет только на порядок.
     */
    private double bayesianRating(double average, int count, double mean) {
        if (count <= 0) return 0.0;
        return (RATING_PRIOR_WEIGHT * mean + average * count) / (RATING_PRIOR_WEIGHT + count);
    }

    private double globalAverageRating() {
        Double mean = reviewRepository.getGlobalAverage();
        return mean != null ? mean : RATING_FALLBACK_MEAN;
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

    /** Уже заведённая карточка глазами парсера — чтобы он не создавал её повторно из другого источника. */
    public record ExistingDrink(Long id, String name, String brand, String sourceUrl) {}

    /**
     * Все карточки каталога в «плоском» виде — для сверки парсером: один и тот же напиток есть на
     * разных сайтах, и дедупликация по {@code sourceUrl} его не ловит (ссылки разные).
     */
    @Transactional(readOnly = true)
    public List<ExistingDrink> listExisting() {
        return drinkRepository.findAll().stream()
            .map(d -> new ExistingDrink(d.getId(), d.getName(), d.getBrand(), d.getSourceUrl()))
            .toList();
    }

    /** Сводка прохода парсера: сколько карточек создано и сколько обновлено. */
    public record ParseResult(int created, int updated) {}

    /**
     * Заводит или обновляет энергетик из спарсенной записи. Дедупликация — по {@code sourceUrl}.
     *
     * @param brand         бренд (источник парсинга), проставляется и при создании, и при обновлении
     * @param volumeMl      объём банки из источника (null — не известен)
     * @param downloadCover true — скачать обложку в наше хранилище; false — сохранить внешнюю ссылку
     *                      как есть (для CDN, тротлящих серверное скачивание, например Monster)
     * @param reparse       false — существующие записи пропускаются (только новые);
     *                      true — у существующих обновляются название/описание/бренд из источника
     * @return CREATED — создана новая карточка; UPDATED — обновлена существующая; SKIPPED — без изменений
     */
    @Transactional
    public ParseOutcome upsertFromParser(String name, String description, String brand, String coverUrl,
                                         String sourceUrl, Integer volumeMl,
                                         boolean downloadCover, boolean reparse) {
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
            // объём проставляем только если он ещё не известен: руками введённое значение точнее
            if (volumeMl != null && existing.getVolumeMl() == null) {
                existing.setVolumeMl(volumeMl);
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
        drink.setVolumeMl(volumeMl);
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
            return "Monster";
        }
        if (s.contains("redbull") || s.contains("red-bull") || n.startsWith("red bull") || n.contains("red bull")) {
            return RedBullParserService.BRAND;
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

    /** Характеристики банки (объём, кофеин, сахар, калории, состав, страна) — для администратора. */
    @Transactional
    public DrinkResponseDto updateSpecs(User actor, Long id, Integer volumeMl, Double caffeinePer100Ml,
                                        Double sugarPer100Ml, Double kcalPer100Ml,
                                        String ingredients, String country) {
        Drink drink = drinkRepository.findById(id)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        drink.setVolumeMl(volumeMl != null && volumeMl >= 1 && volumeMl <= 5000 ? volumeMl : null);
        drink.setCaffeinePer100Ml(inRangeOrNull(caffeinePer100Ml, 0, 200));
        drink.setSugarPer100Ml(inRangeOrNull(sugarPer100Ml, 0, 100));
        drink.setKcalPer100Ml(inRangeOrNull(kcalPer100Ml, 0, 900));
        drink.setIngredients(trimToNull(ingredients));
        drink.setCountry(trimToNull(country));
        drinkRepository.save(drink);

        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, drink.getId(), drink.getName(),
            "Изменены характеристики карточки");
        return getById(id);
    }

    /** Число из формы: вне разумного диапазона (опечатка в админке) — считаем «не заполнено». */
    private Double inRangeOrNull(Double value, double min, double max) {
        return (value == null || value < min || value > max) ? null : value;
    }

    private String trimToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    /** Сводка чистки описаний. */
    public record DescriptionCleanupResult(int foreign, int duplicated, int kept) {}

    /**
     * Чистит описания, доставшиеся от парсеров (админ-операция):
     *  1) без единой кириллической буквы — на русском сайте это англоязычная заглушка магазина;
     *  2) слово в слово повторяющиеся у нескольких карточек — такой текст описывает бренд, а не
     *     вкус (одно и то же «Zero sugar, flavor unleashed…» стояло у 18 разных банок).
     * Чистится только описание: название, фото и оценки не трогаются, а нормальный текст админ
     * пишет заново руками. Новые карточки в приёмке этих заглушек уже не получают.
     */
    @Transactional
    public DescriptionCleanupResult cleanupDescriptions(User actor) {
        List<Drink> all = drinkRepository.findAll();
        Map<String, Integer> seen = new LinkedHashMap<>();
        for (Drink d : all) {
            String desc = trimToNull(d.getDescription());
            if (desc != null) seen.merge(desc, 1, Integer::sum);
        }

        int foreign = 0, duplicated = 0, kept = 0;
        for (Drink d : all) {
            String desc = trimToNull(d.getDescription());
            if (desc == null) continue;
            if (!looksRussian(desc)) foreign++;
            else if (seen.getOrDefault(desc, 0) > 1) duplicated++;
            else { kept++; continue; }
            d.setDescription(null);
            drinkRepository.save(d);
        }

        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, null, "Описания",
            "Чистка описаний: убрано англоязычных " + foreign + ", дублей " + duplicated
                + ", оставлено " + kept);
        log.info("Чистка описаний: англоязычных {}, дублей {}, оставлено {}", foreign, duplicated, kept);
        return new DescriptionCleanupResult(foreign, duplicated, kept);
    }

    /**
     * Есть ли в тексте кириллица. Сайт русскоязычный, и описание из каталога-источника на
     * английском («Real fruit juice, big flavor…») пользователю ничего не объясняет.
     */
    public static boolean looksRussian(String text) {
        if (text == null) return false;
        return text.codePoints().anyMatch(c -> Character.UnicodeBlock.of(c) == Character.UnicodeBlock.CYRILLIC);
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
    public record MediaOptimizeResult(int downloaded, int thumbnailed, int debackgrounded, int skipped, int failed) {}

    private enum PhotoOutcome { DOWNLOADED, THUMBNAILED, DEBACKGROUNDED, SKIPPED, FAILED }

    /**
     * Разовая оптимизация медиа (админ-операция):
     *  1) внешние картинки (Monster CDN и т.п.) скачиваются в наше хранилище — грузятся быстрее и не зависят от CDN;
     *  2) у обложек из каталогов вырезается белый фон (для уже скачанных раньше — задним числом);
     *  3) для уже сохранённых фото без превью оно достраивается.
     * Внимание: на боевом сервере скачивание Monster может упираться в Cloudflare/CDN-троттлинг —
     * такие фото останутся внешними ссылками (попадут в «ошибки»), запускать лучше там, где CDN доступен.
     */
    public MediaOptimizeResult optimizeMedia(User actor) {
        int downloaded = 0, thumbnailed = 0, debackgrounded = 0, skipped = 0, failed = 0;
        for (Long id : photoRepository.findAllIds()) {
            switch (optimizePhoto(id)) {
                case DOWNLOADED -> downloaded++;
                case THUMBNAILED -> thumbnailed++;
                case DEBACKGROUNDED -> debackgrounded++;
                case SKIPPED -> skipped++;
                case FAILED -> failed++;
            }
        }
        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, null, "Медиа",
            "Оптимизация медиа: скачано " + downloaded + ", превью " + thumbnailed
                + ", вырезан фон " + debackgrounded
                + ", пропущено " + skipped + ", ошибок " + failed);
        return new MediaOptimizeResult(downloaded, thumbnailed, debackgrounded, skipped, failed);
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
                StoredImage stored = fetchAndStore("photos/" + drinkId, url, photo.getSource() == PhotoSource.PARSED);
                photo.setUrl(stored.url());
                photo.setThumbUrl(stored.thumbUrl());
                photoRepository.save(photo);
                return PhotoOutcome.DOWNLOADED;
            }
            if (photo.getSource() == PhotoSource.PARSED && !photo.isEdited() && cutBackgroundInPlace(photo)) {
                return PhotoOutcome.DEBACKGROUNDED;
            }
            if (photo.getThumbUrl() == null || thumbnailLostTransparency(photo) || thumbnailOutdated(photo)) {
                String key = storageKeyOf(url);
                byte[] data = storageService.readBytes(url);
                if (key == null || data == null) return PhotoOutcome.SKIPPED;
                String ct = firstNonNull(sniffImageContentType(data),
                    firstNonNull(contentTypeFromUrl(url), "image/jpeg"));
                String oldThumb = photo.getThumbUrl();
                String thumbUrl = generateAndStoreThumb(key, data, ct);
                if (thumbUrl == null) {
                    // для мелкого пэкшота превью не даёт выигрыша; если старое при этом испорчено
                    // (потеряло прозрачность) — убираем его совсем, карточка возьмёт оригинал
                    if (oldThumb == null) return PhotoOutcome.SKIPPED;
                    photo.setThumbUrl(null);
                    photoRepository.save(photo);
                    storageService.delete(oldThumb);
                    log.info("optimizeMedia: у фото #{} убрано испорченное превью {}", photo.getId(), oldThumb);
                    return PhotoOutcome.THUMBNAILED;
                }
                photo.setThumbUrl(thumbUrl);
                photoRepository.save(photo);
                if (!thumbUrl.equals(oldThumb)) storageService.delete(oldThumb);
                return PhotoOutcome.THUMBNAILED;
            }
            return PhotoOutcome.SKIPPED;
        } catch (Exception e) {
            log.warn("optimizeMedia: фото {} ({}) — {}", photoId, url, e.getMessage());
            return PhotoOutcome.FAILED;
        }
    }

    /**
     * Превью собрано по старым настройкам: его длинная сторона больше нынешнего предела. Прежний
     * предел (600 px) был крупнее самих пэкшотов, поэтому превью либо не создавалось совсем, либо
     * весило почти как оригинал. Такие пересобираем при следующей оптимизации медиа.
     */
    private boolean thumbnailOutdated(DrinkPhoto photo) {
        if (photo.getThumbUrl() == null) return false;
        try {
            return imageService.exceedsThumbSize(storageService.readBytes(photo.getThumbUrl()));
        } catch (Exception e) {
            log.debug("Не удалось сверить размер превью {}: {}", photo.getThumbUrl(), e.getMessage());
            return false;
        }
    }

    /**
     * Превью потеряло прозрачность: оригинал с прозрачным фоном, а уменьшенная копия — нет. Так
     * получалось у палитровых PNG (альфа в чанке tRNS) — на карточке банка оказывалась на чёрном
     * прямоугольнике, хотя в увеличенном виде фона нет. Такие превью пересобираются заново.
     */
    private boolean thumbnailLostTransparency(DrinkPhoto photo) {
        String thumbUrl = photo.getThumbUrl();
        if (thumbUrl == null || !thumbUrl.toLowerCase(Locale.ROOT).endsWith(".png")) return false;
        try {
            byte[] original = storageService.readBytes(photo.getUrl());
            if (original == null || !imageService.hasTransparentPixels(original)) return false;
            byte[] thumb = storageService.readBytes(thumbUrl);
            return thumb != null && !imageService.hasTransparentPixels(thumb);
        } catch (Exception e) {
            log.debug("Не удалось сверить прозрачность превью {}: {}", thumbUrl, e.getMessage());
            return false;
        }
    }

    /**
     * Вырезает белый фон у уже лежащей в хранилище обложки: результат кладётся новым PNG-файлом
     * (вместе с превью), а старые файлы удаляются. Прежняя картинка не перезаписывается по тому же
     * ключу — иначе у пользователей остались бы закэшированные браузером старые версии
     * ({@code /media/**} отдаётся с длинным кэшем).
     *
     * @return true — фон вырезан и фото переписано; false — трогать нечего (фон не белый, уже
     *         прозрачный, формат не читается)
     */
    private boolean cutBackgroundInPlace(DrinkPhoto photo) throws Exception {
        if (!removeWhiteBackground) return false;
        String oldUrl = photo.getUrl();
        String oldThumbUrl = photo.getThumbUrl();
        String key = storageKeyOf(oldUrl);
        if (key == null) return false;
        byte[] data = storageService.readBytes(oldUrl);
        if (data == null) return false;

        Optional<byte[]> cut = imageService.removeWhiteBackground(data);
        if (cut.isEmpty()) return false;

        int dot = key.lastIndexOf('.');
        String newKey = (dot >= 0 ? key.substring(0, dot) : key) + "-nobg.png";
        StoredImage stored = storeImage(newKey, cut.get(), "image/png");
        photo.setUrl(stored.url());
        photo.setThumbUrl(stored.thumbUrl());
        photoRepository.save(photo);

        storageService.delete(oldUrl);
        if (oldThumbUrl != null) storageService.delete(oldThumbUrl);
        log.info("Оптимизация медиа: у фото #{} вырезан белый фон ({} → {})",
            photo.getId(), oldUrl, stored.url());
        return true;
    }

    private String describeDescChange(String oldDesc, String newDesc) {
        boolean oldEmpty = oldDesc == null || oldDesc.isBlank();
        boolean newEmpty = newDesc == null || newDesc.isBlank();
        if (oldEmpty && !newEmpty) return "добавлено описание";
        if (!oldEmpty && newEmpty) return "описание очищено";
        return "описание изменено";
    }

    /**
     * Добавляет пользовательское фото в конец галереи (с генерацией превью).
     *
     * @param cutBackground true — убрать белый фон, как у пэкшотов из каталогов (галочка при
     *                      загрузке); если фон не белый, картинка сохраняется как есть
     */
    @Transactional
    public DrinkResponseDto addUserPhoto(Long drinkId, MultipartFile file, User uploader, boolean cutBackground) {
        Drink drink = drinkRepository.findById(drinkId)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));

        UploadedImage upload = readUpload(file);
        String contentType = upload.contentType();
        byte[] data = upload.data();

        if (cutBackground) {
            // фон вырезаем ДО формирования ключа: результат всегда PNG, расширение должно совпасть
            Optional<byte[]> cut = removeBackgroundIfEnabled(data);
            if (cut.isPresent()) {
                data = cut.get();
                contentType = "image/png";
                log.info("Загрузка фото «{}»: белый фон вырезан", file.getOriginalFilename());
            } else {
                log.info("Загрузка фото «{}»: фон не вырезан (не белый или картинка не подошла)",
                    file.getOriginalFilename());
            }
        }

        String key = "photos/" + drinkId + "/" + System.currentTimeMillis() + "." + uploadExt(contentType);
        StoredImage stored;
        try {
            stored = storeImage(key, data, contentType);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INSUFFICIENT_STORAGE, "Не удалось сохранить изображение");
        }

        addPhoto(drink, stored.url(), stored.thumbUrl(), PhotoSource.USER, uploader);
        log.info("Загрузка фото (файл): энергетик #{} «{}», пользователь «{}», «{}» ({} КБ, {}) → {}",
            drinkId, drink.getName(), uploader.getUsername(), file.getOriginalFilename(),
            data.length / 1024, contentType, stored.url());
        return getById(drinkId);
    }

    /**
     * Добавляет пользовательское фото по ссылке: скачивает картинку в наше хранилище (с превью).
     *
     * @param cutBackground true — убрать белый фон (галочка при загрузке), см. {@link #addUserPhoto}
     */
    @Transactional
    public DrinkResponseDto addUserPhotoByUrl(Long drinkId, String url, User uploader, boolean cutBackground) {
        Drink drink = drinkRepository.findById(drinkId)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        if (url == null || url.isBlank()) {
            throw ApiException.badRequest("Укажите ссылку на изображение");
        }
        StoredImage stored;
        try {
            stored = fetchAndStore("photos/" + drinkId, url.trim(), cutBackground);
        } catch (Exception e) {
            throw ApiException.badRequest("Не удалось загрузить изображение по ссылке");
        }
        addPhoto(drink, stored.url(), stored.thumbUrl(), PhotoSource.USER, uploader);
        log.info("Загрузка фото (по ссылке): энергетик #{} «{}», пользователь «{}», {} → {}",
            drinkId, drink.getName(), uploader.getUsername(), url.trim(), stored.url());
        return getById(drinkId);
    }

    /**
     * Заменяет картинку существующего фото — сюда приходит результат редактора фона.
     * Позиция в галерее, источник и автор сохраняются, старые файлы из хранилища удаляются,
     * а фото помечается как правленное вручную: автоматическая обработка его больше не трогает.
     */
    @Transactional
    public DrinkResponseDto replacePhotoImage(User actor, Long drinkId, Long photoId, MultipartFile file) {
        DrinkPhoto photo = photoRepository.findById(photoId)
            .orElseThrow(() -> ApiException.notFound("Фотография не найдена"));
        if (!photo.getDrink().getId().equals(drinkId)) {
            throw ApiException.badRequest("Фото не относится к этому энергетику");
        }

        UploadedImage upload = readUpload(file);
        String key = "photos/" + drinkId + "/" + System.currentTimeMillis()
            + "." + uploadExt(upload.contentType());
        StoredImage stored;
        try {
            stored = storeImage(key, upload.data(), upload.contentType());
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INSUFFICIENT_STORAGE, "Не удалось сохранить изображение");
        }

        String oldUrl = photo.getUrl();
        String oldThumb = photo.getThumbUrl();
        photo.setUrl(stored.url());
        photo.setThumbUrl(stored.thumbUrl());
        photo.setEdited(true);
        photoRepository.save(photo);
        // старые файлы больше не нужны: ключ у новой картинки другой (timestamp), кэш не собьётся
        if (storageKeyOf(oldUrl) != null) storageService.delete(oldUrl);
        if (oldThumb != null) storageService.delete(oldThumb);

        String drinkName = photo.getDrink().getName();
        auditService.record(actor, AuditAction.DRINK_UPDATE, AuditTargetType.DRINK, drinkId, drinkName,
            "Фон фото изменён в редакторе");
        log.info("Редактор фона: энергетик #{} «{}», фото #{} → {} ({} КБ)",
            drinkId, drinkName, photoId, stored.url(), upload.data().length / 1024);
        return getById(drinkId);
    }

    /** Загруженный файл: байты плюс проверенный тип содержимого. */
    private record UploadedImage(byte[] data, String contentType) {}

    private UploadedImage readUpload(MultipartFile file) {
        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw ApiException.badRequest("Можно загружать только изображения");
        }
        try {
            return new UploadedImage(file.getBytes(), contentType);
        } catch (IOException e) {
            throw ApiException.badRequest("Не удалось прочитать загруженный файл");
        }
    }

    /** Расширение файла по типу содержимого загрузки: image/png → png. */
    private String uploadExt(String contentType) {
        String ext = contentType.substring(contentType.indexOf('/') + 1).replaceAll("[^a-zA-Z0-9]", "");
        return ext.isBlank() ? "jpg" : ext;
    }

    /**
     * Скачивает изображение по ссылке в хранилище (с превью); при сбое — оставляет внешнюю ссылку.
     * У обложек из каталогов ({@link PhotoSource#PARSED}) заодно вырезается белый фон — это
     * студийные пэкшоты на белом; пользовательские фото не трогаем, там фон осмысленный.
     */
    private void addRemotePhoto(Drink drink, String url, PhotoSource source, User uploader) {
        try {
            StoredImage stored = fetchAndStore("photos/" + drink.getId(), url, source == PhotoSource.PARSED);
            addPhoto(drink, stored.url(), stored.thumbUrl(), source, uploader);
        } catch (Exception e) {
            log.warn("Не удалось скачать изображение {} ({}) — сохраняю внешнюю ссылку", url, e.getMessage());
            addPhoto(drink, url, null, source, uploader);
        }
    }

    /** Оригинал + (если получилось) превью, сохранённые в хранилище. */
    private record StoredImage(String url, String thumbUrl) {}

    /** Загружает картинку по URL и кладёт в хранилище (оригинал + превью), без вырезания фона. */
    private StoredImage fetchAndStore(String prefix, String url) throws Exception {
        return fetchAndStore(prefix, url, false);
    }

    /**
     * Загружает картинку по URL и кладёт в хранилище (оригинал + превью).
     *
     * @param cutBackground true — попытаться сделать белый фон прозрачным (у обложек из каталогов
     *                      это делается само, у ручной загрузки — по галочке администратора)
     */
    private StoredImage fetchAndStore(String prefix, String url, boolean cutBackground) throws Exception {
        FetchedImage fetched = download(url);
        byte[] data = fetched.data();
        String contentType = fetched.contentType();

        if (cutBackground) {
            // фон вырезаем ДО формирования ключа: результат всегда PNG, расширение должно совпасть
            Optional<byte[]> cut = removeBackgroundIfEnabled(data);
            if (cut.isPresent()) {
                data = cut.get();
                contentType = "image/png";
                log.info("Обложка {}: белый фон вырезан", url);
            }
        }

        String key = prefix + "/" + System.currentTimeMillis() + "-"
            + Integer.toHexString(url.hashCode()) + "." + imageExt(contentType);
        return storeImage(key, data, contentType);
    }

    /** Картинка, скачанная по ссылке: байты плюс распознанный тип содержимого. */
    public record FetchedImage(byte[] data, String contentType) {}

    /** Качает картинку по ссылке и определяет её тип. Ничего не сохраняет. */
    private FetchedImage download(String url) throws Exception {
        Connection.Response resp = Jsoup.connect(url)
            .ignoreContentType(true)
            // максимально «браузерный» UA — некоторые CDN режут запросы по нестандартному агенту
            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                + "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
            .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
            // 60с, а не 20: пэкшоты магазинов доходят до 2 МБ, и на неспешном канале загрузка
            // не укладывалась в 20с — обложка оставалась внешней ссылкой (и с белым фоном)
            .timeout(60000)
            .maxBodySize(25 * 1024 * 1024)
            .execute();

        byte[] data = resp.bodyAsBytes();

        // Content-Type бывает «кривым»: некоторые CDN (например web-assests.monsterenergy.com)
        // отдают картинки как application/octet-stream. Поэтому если заголовок не image/* —
        // определяем тип по сигнатуре первых байтов, затем по расширению URL.
        String declared = resp.contentType();
        if (declared != null) declared = declared.split(";")[0].trim();
        String contentType = (declared != null && declared.startsWith("image/"))
            ? declared
            : firstNonNull(sniffImageContentType(data), contentTypeFromUrl(url));
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("Ссылка не ведёт на изображение");
        }
        return new FetchedImage(data, contentType);
    }

    /**
     * Отдаёт картинку по внешней ссылке администратору — этим живёт редактор фона: чужой домен
     * браузеру пиксели с холста снять не даст, а наш — даст. Ничего не сохраняем: если админ
     * закроет редактор, в хранилище не останется мусора.
     */
    public FetchedImage fetchImage(String url) {
        String trimmed = url == null ? "" : url.trim();
        if (trimmed.isBlank()) {
            throw ApiException.badRequest("Укажите ссылку на изображение");
        }
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            throw ApiException.badRequest("Ссылка должна начинаться с http:// или https://");
        }
        try {
            return download(trimmed);
        } catch (Exception e) {
            log.warn("Редактор фона: не удалось скачать {} — {}", trimmed, e.getMessage());
            throw ApiException.badRequest("Не удалось загрузить изображение по ссылке");
        }
    }

    /** Вырезание белого фона, если оно включено в конфиге (media.remove-white-background). */
    private Optional<byte[]> removeBackgroundIfEnabled(byte[] data) {
        return removeWhiteBackground ? imageService.removeWhiteBackground(data) : Optional.empty();
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
            case "image/bmp" -> "bmp";
            default -> "jpg";
        };
    }

    /** Тип изображения по сигнатуре первых байтов (magic numbers); null — не похоже на изображение. */
    private String sniffImageContentType(byte[] d) {
        if (d == null || d.length < 12) return null;
        if ((d[0] & 0xFF) == 0x89 && d[1] == 'P' && d[2] == 'N' && d[3] == 'G') return "image/png";
        if ((d[0] & 0xFF) == 0xFF && (d[1] & 0xFF) == 0xD8 && (d[2] & 0xFF) == 0xFF) return "image/jpeg";
        if (d[0] == 'G' && d[1] == 'I' && d[2] == 'F' && d[3] == '8') return "image/gif";
        if (d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F'
            && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P') return "image/webp";
        if (d[0] == 'B' && d[1] == 'M') return "image/bmp";
        String head = new String(d, 0, Math.min(d.length, 256),
            java.nio.charset.StandardCharsets.US_ASCII).toLowerCase();
        if (head.contains("<svg")) return "image/svg+xml";
        return null;
    }

    /** Тип изображения по расширению в URL (запасной вариант, если сигнатура не распознана). */
    private String contentTypeFromUrl(String url) {
        if (url == null) return null;
        String u = url.toLowerCase().replaceAll("[?#].*$", "");
        if (u.endsWith(".png")) return "image/png";
        if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
        if (u.endsWith(".webp")) return "image/webp";
        if (u.endsWith(".gif")) return "image/gif";
        if (u.endsWith(".svg")) return "image/svg+xml";
        if (u.endsWith(".bmp")) return "image/bmp";
        return null;
    }

    private String firstNonNull(String a, String b) {
        return a != null ? a : b;
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
