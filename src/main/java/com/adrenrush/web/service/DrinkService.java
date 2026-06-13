package com.adrenrush.web.service;

import com.adrenrush.web.dto.DrinkResponseDto;
import com.adrenrush.web.entity.Drink;
import com.adrenrush.web.entity.DrinkPhoto;
import com.adrenrush.web.entity.User;
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
import java.text.Normalizer;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class DrinkService {

    private static final Logger log = LoggerFactory.getLogger(DrinkService.class);

    private final DrinkRepository drinkRepository;
    private final DrinkPhotoRepository photoRepository;
    private final ReviewRepository reviewRepository;
    private final StorageService storageService;

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

    /** Создаёт энергетик из спарсенной записи. Возвращает true, если создан новый. */
    @Transactional
    public boolean createFromParser(String name, String description, String coverUrl, String sourceUrl) {
        if (sourceUrl != null && drinkRepository.existsBySourceUrl(sourceUrl)) {
            return false;
        }
        Drink drink = new Drink();
        drink.setName(name.trim());
        drink.setSlug(uniqueSlug(name.trim()));
        drink.setDescription(description);
        drink.setSourceUrl(sourceUrl);
        drinkRepository.save(drink);

        if (coverUrl != null && !coverUrl.isBlank()) {
            addRemotePhoto(drink, coverUrl.trim(), PhotoSource.PARSED, null);
        }
        return true;
    }

    @Transactional(readOnly = true)
    public long count() {
        return drinkRepository.count();
    }

    @Transactional
    public DrinkResponseDto create(String name, String description, String coverUrl) {
        if (name == null || name.isBlank()) {
            throw ApiException.badRequest("Введите название энергетика");
        }
        Drink drink = new Drink();
        drink.setName(name.trim());
        drink.setSlug(uniqueSlug(name.trim()));
        drink.setDescription(description);
        drinkRepository.save(drink);

        if (coverUrl != null && !coverUrl.isBlank()) {
            addRemotePhoto(drink, coverUrl.trim(), PhotoSource.PARSED, null);
        }
        return toSummary(drink);
    }

    /** Редактирование энергетика (название/описание) — для администратора. */
    @Transactional
    public DrinkResponseDto update(Long id, String name, String description) {
        Drink drink = drinkRepository.findById(id)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        if (name != null && !name.isBlank()) {
            drink.setName(name.trim());
        }
        if (description != null) {
            drink.setDescription(description);
        }
        drinkRepository.save(drink);
        return getById(id);
    }

    /** Полное удаление энергетика (фото из хранилища, отзывы, сама карточка) — для администратора. */
    @Transactional
    public void delete(Long id) {
        Drink drink = drinkRepository.findById(id)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        // удаляем файлы фотографий из хранилища
        for (DrinkPhoto p : photoRepository.findByDrinkIdOrderByPositionAscIdAsc(id)) {
            storageService.delete(p.getUrl());
        }
        // отзывы ссылаются на напиток — удаляем их перед карточкой
        reviewRepository.deleteByDrinkId(id);
        // удаление карточки каскадно убирает строки фотографий
        drinkRepository.delete(drink);
    }

    /** Удаление фотографии из галереи (вместе с файлом в хранилище) — для администратора. */
    @Transactional
    public DrinkResponseDto deletePhoto(Long drinkId, Long photoId) {
        DrinkPhoto photo = photoRepository.findById(photoId)
            .orElseThrow(() -> ApiException.notFound("Фотография не найдена"));
        if (!photo.getDrink().getId().equals(drinkId)) {
            throw ApiException.badRequest("Фото не относится к этому энергетику");
        }
        storageService.delete(photo.getUrl());
        photoRepository.delete(photo);
        return getById(drinkId);
    }

    /** Добавляет пользовательское фото в конец галереи. */
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

        String key = "photos/" + drinkId + "/" + System.currentTimeMillis() + "." + ext;
        String url;
        try {
            url = storageService.store(key, file.getInputStream(), contentType);
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INSUFFICIENT_STORAGE, "Не удалось сохранить изображение");
        }

        addPhoto(drink, url, PhotoSource.USER, uploader);
        return getById(drinkId);
    }

    /** Добавляет пользовательское фото по ссылке: скачивает картинку в наше хранилище. */
    @Transactional
    public DrinkResponseDto addUserPhotoByUrl(Long drinkId, String url, User uploader) {
        Drink drink = drinkRepository.findById(drinkId)
            .orElseThrow(() -> ApiException.notFound("Энергетик не найден"));
        if (url == null || url.isBlank()) {
            throw ApiException.badRequest("Укажите ссылку на изображение");
        }
        String stored;
        try {
            stored = fetchAndStore("photos/" + drinkId, url.trim());
        } catch (Exception e) {
            throw ApiException.badRequest("Не удалось загрузить изображение по ссылке");
        }
        addPhoto(drink, stored, PhotoSource.USER, uploader);
        return getById(drinkId);
    }

    /** Скачивает изображение по ссылке в хранилище; при сбое — оставляет внешнюю ссылку. */
    private void addRemotePhoto(Drink drink, String url, PhotoSource source, User uploader) {
        String stored;
        try {
            stored = fetchAndStore("photos/" + drink.getId(), url);
        } catch (Exception e) {
            log.warn("Не удалось скачать изображение {} ({}) — сохраняю внешнюю ссылку", url, e.getMessage());
            stored = url;
        }
        addPhoto(drink, stored, source, uploader);
    }

    /** Загружает картинку по URL и кладёт в хранилище (MinIO или локальную папку). Возвращает публичный путь. */
    private String fetchAndStore(String prefix, String url) throws Exception {
        Connection.Response resp = Jsoup.connect(url)
            .ignoreContentType(true)
            .userAgent("Mozilla/5.0 (compatible; AdrenRushBot)")
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
        try (ByteArrayInputStream in = new ByteArrayInputStream(resp.bodyAsBytes())) {
            return storageService.store(key, in, contentType);
        }
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

    private void addPhoto(Drink drink, String url, PhotoSource source, User uploader) {
        int nextPos = photoRepository.countByDrinkId(drink.getId());
        DrinkPhoto photo = new DrinkPhoto();
        photo.setDrink(drink);
        photo.setUrl(url);
        photo.setSource(source);
        photo.setUploadedBy(uploader);
        photo.setPosition(nextPos);
        photoRepository.save(photo);
    }

    private DrinkResponseDto toSummary(Drink drink) {
        double avg = avg(drink.getId());
        int count = count(drink.getId());
        List<DrinkPhoto> photos = photoRepository.findByDrinkIdOrderByPositionAscIdAsc(drink.getId());
        String cover = photos.isEmpty() ? null : photos.get(0).getUrl();
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
