package com.adrenrush.web.service;

import com.adrenrush.web.entity.ParsedCandidate;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.AuditAction;
import com.adrenrush.web.enums.AuditTargetType;
import com.adrenrush.web.enums.CandidateStatus;
import com.adrenrush.web.repository.ParsedCandidateRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Приёмка находок парсеров. Парсеры каталог НЕ пополняют: всё найденное сначала попадает сюда, а в
 * каталог уходит только то, что администратор отметил в окне «Парсинг каталогов».
 *
 * Так решается проблема, которую нельзя решить автоматикой: у одного напитка на разных сайтах
 * названия расходятся до неузнаваемости («Monster Ultra Zero Ultra "White Monster"», «Ultra Zero»,
 * «Ultra White» — один и тот же напиток), и алгоритмически такие пары либо не ловятся, либо ловятся
 * вместе с ложными («Original» и «Original Zero Sugar» — уже разные напитки). Похожие позиции здесь
 * только помечаются подсказкой {@code similarTo}, а решение остаётся за человеком.
 *
 * Отклонённые позиции запоминаются со статусом {@link CandidateStatus#IGNORED} и при следующих
 * проходах остаются без галочки — повторно предлагать их не нужно.
 */
@Service
@RequiredArgsConstructor
public class ParserStagingService {

    private static final Logger log = LoggerFactory.getLogger(ParserStagingService.class);

    private final List<CatalogParser> parsers;
    private final ParsedCandidateRepository candidateRepository;
    private final DrinkService drinkService;
    private final FlavorKeys flavorKeys;
    private final AuditService auditService;

    /** Итог обхода источников: что появилось в приёмке и сколько отсеялось как уже известное. */
    public record ScanResult(int found, int added, int updated, int alreadyInCatalog, int ignored) {}

    /** Позиция приёмки для админки: та же карточка-кандидат плюс подсказка о похожем напитке. */
    public record CandidateView(Long id, String name, String brand, String description,
                                String imageUrl, String sourceUrl, String source,
                                String similarTo, String status, Integer volumeMl) {}

    /** Что администратор решил по одной позиции: принять (возможно, с правками) или отклонить. */
    public record ApplyItem(Long id, String name, String description) {}

    /** Итог применения: сколько карточек создано, сколько позиций отправлено в игнор, сколько сбоев. */
    public record ApplyResult(int created, int ignored, int failed) {}

    /** Метки всех источников, которые можно опрашивать (выключенные в конфиге не показываем). */
    public List<String> availableSources() {
        return parsers.stream().filter(CatalogParser::isEnabled).map(CatalogParser::source).toList();
    }

    /**
     * Плановый обход: наполняет приёмку, но каталог не меняет — утром администратор увидит новинки
     * в окне парсинга и решит, что принять.
     */
    @Scheduled(cron = "${parser.scan.cron:0 0 4 * * *}")
    public void scheduledScan() {
        List<String> sources = availableSources();
        if (sources.isEmpty()) return;
        log.info("Плановый обход источников: {}", sources);
        ScanResult r = scan(sources);
        log.info("Плановый обход завершён: найдено {}, новых в приёмке {}, уже в каталоге {}",
            r.found(), r.added(), r.alreadyInCatalog());
    }

    /**
     * Опрашивает выбранные источники и складывает найденное в приёмку.
     *
     * Позиции, которые уже есть в каталоге (по ссылке-источнику или по отпечатку вкуса), в приёмку
     * не попадают — предлагать нечего. Ранее отклонённые сохраняют статус IGNORED, у остальных
     * обновляются название/описание/картинка: магазин мог их поправить.
     */
    @Transactional
    public ScanResult scan(List<String> sources) {
        List<DrinkService.ExistingDrink> drinks = drinkService.listExisting();
        Map<String, DrinkService.ExistingDrink> byFlavor = indexByFlavor(drinks);
        Map<String, DrinkService.ExistingDrink> bySourceUrl = indexBySourceUrl(drinks);
        int found = 0, added = 0, updated = 0, alreadyInCatalog = 0, ignoredSeen = 0;

        for (CatalogParser parser : parsers) {
            if (!parser.isEnabled() || !sources.contains(parser.source())) continue;

            for (ParsedItem item : parser.collect()) {
                if (item.sourceUrl() == null || item.sourceUrl().isBlank()
                    || item.name() == null || item.name().isBlank()) continue;
                found++;

                ParsedCandidate existing = candidateRepository.findBySourceUrl(item.sourceUrl()).orElse(null);

                // сначала точное совпадение по ссылке-источнику: карточку могли переименовать при
                // принятии, и по названию она бы уже не узналась — вернулась бы в приёмку дублем
                if (bySourceUrl.containsKey(item.sourceUrl())) {
                    alreadyInCatalog++;
                    if (existing != null) candidateRepository.delete(existing);
                    continue;
                }
                // а это лишь подсказка: тот же вкус, возможно, уже есть под другим названием
                DrinkService.ExistingDrink twin = byFlavor.get(flavorKeys.matchKey(item.brand(), item.name()));

                if (existing == null) {
                    ParsedCandidate candidate = new ParsedCandidate();
                    candidate.setSourceUrl(item.sourceUrl());
                    fill(candidate, item, twin);
                    candidateRepository.save(candidate);
                    added++;
                } else {
                    if (existing.getStatus() == CandidateStatus.IGNORED) ignoredSeen++;
                    // название/описание могли поправить руками при принятии — их не перетираем,
                    // пока позиция ждёт решения; обновляем только источниковые данные
                    existing.setImageUrl(item.imageUrl());
                    existing.setVolumeMl(item.volumeMl());
                    existing.setSimilarTo(twin != null ? twin.name() : null);
                    existing.setSource(item.source());
                    existing.setLastSeenAt(Instant.now());
                    candidateRepository.save(existing);
                    updated++;
                }
            }
        }
        return new ScanResult(found, added, updated, alreadyInCatalog, ignoredSeen);
    }

    /** Позиции приёмки: {@code PENDING} — ждут решения, {@code IGNORED} — вкладка «Игнор». */
    @Transactional(readOnly = true)
    public List<CandidateView> list(CandidateStatus status) {
        return candidateRepository.findByStatusOrderBySimilarToAscNameAsc(status).stream()
            .map(c -> new CandidateView(c.getId(), c.getName(), c.getBrand(), c.getDescription(),
                c.getImageUrl(), c.getSourceUrl(), c.getSource(), c.getSimilarTo(), c.getStatus().name(),
                c.getVolumeMl()))
            .toList();
    }

    /**
     * Применяет решение администратора: отмеченные позиции становятся карточками каталога (с
     * правками названия/описания и скачиванием обложки), остальные из переданного списка уходят в
     * игнор. Принятая позиция из приёмки удаляется — она теперь в каталоге.
     *
     * Не {@code @Transactional}: создание карточки тянет обложку по сети, и держать транзакцию всё
     * это время нельзя — каждая позиция сохраняется отдельно (как в остальных местах парсинга).
     */
    public ApplyResult apply(User actor, List<ApplyItem> accept, List<Long> ignore) {
        int created = 0, failed = 0;
        for (ApplyItem item : accept == null ? List.<ApplyItem>of() : accept) {
            ParsedCandidate candidate = candidateRepository.findById(item.id()).orElse(null);
            if (candidate == null) continue;

            String name = item.name() != null && !item.name().isBlank() ? item.name().trim() : candidate.getName();
            String description = descriptionFor(item, candidate);
            try {
                drinkService.upsertFromParser(name, description, candidate.getBrand(),
                    candidate.getImageUrl(), candidate.getSourceUrl(), candidate.getVolumeMl(), true, false);
                candidateRepository.delete(candidate);
                created++;
                log.info("Приёмка: принят энергетик «{}» ({})", name, candidate.getSourceUrl());
            } catch (Exception e) {
                failed++;
                log.warn("Приёмка: не удалось создать карточку «{}» ({}): {}",
                    name, candidate.getSourceUrl(), e.getMessage());
            }
        }

        int ignored = 0;
        for (Long id : ignore == null ? List.<Long>of() : ignore) {
            ParsedCandidate candidate = candidateRepository.findById(id).orElse(null);
            if (candidate == null || candidate.getStatus() == CandidateStatus.IGNORED) continue;
            candidate.setStatus(CandidateStatus.IGNORED);
            candidateRepository.save(candidate);
            ignored++;
        }

        if (created > 0 || ignored > 0) {
            auditService.record(actor, AuditAction.DRINK_CREATE, AuditTargetType.DRINK, null, "Приёмка",
                "Из приёмки принято " + created + ", отправлено в игнор " + ignored
                    + (failed > 0 ? ", ошибок " + failed : ""));
        }
        return new ApplyResult(created, ignored, failed);
    }

    /** Возвращает позицию из игнора в список ожидающих решения. */
    @Transactional
    public void unignore(Long id) {
        candidateRepository.findById(id).ifPresent(c -> {
            c.setStatus(CandidateStatus.PENDING);
            candidateRepository.save(c);
        });
    }

    /** Убирает позицию из приёмки совсем (например, товар исчез из магазина). */
    @Transactional
    public void forget(Long id) {
        candidateRepository.deleteById(id);
    }

    /** Сколько позиций ждёт решения — для счётчика на кнопке в админке. */
    @Transactional(readOnly = true)
    public Map<String, Long> counts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        counts.put("pending", candidateRepository.countByStatus(CandidateStatus.PENDING));
        counts.put("ignored", candidateRepository.countByStatus(CandidateStatus.IGNORED));
        return counts;
    }

    /**
     * Какое описание получит новая карточка.
     *
     * Магазины подставляют один и тот же английский текст про бренд сразу всем вкусам («Zero sugar,
     * flavor unleashed…» стоял у 18 карточек) — на русском сайте он ничего не объясняет, и в каталог
     * такой текст не пускаем: лучше без описания, чем с чужим. Но проверка касается только текста
     * источника: если администратор в окне приёмки написал своё, оно сохраняется как есть.
     */
    private String descriptionFor(ApplyItem item, ParsedCandidate candidate) {
        String parsed = blankToNull(candidate.getDescription());
        String edited = blankToNull(item.description());
        if (edited == null || edited.equals(parsed)) return DrinkService.looksRussian(parsed) ? parsed : null;
        return edited;
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private void fill(ParsedCandidate candidate, ParsedItem item, DrinkService.ExistingDrink twin) {
        candidate.setName(item.name());
        candidate.setBrand(item.brand());
        candidate.setDescription(item.description());
        candidate.setImageUrl(item.imageUrl());
        candidate.setVolumeMl(item.volumeMl());
        candidate.setSource(item.source());
        candidate.setSimilarTo(twin != null ? twin.name() : null);
        candidate.setStatus(CandidateStatus.PENDING);
        candidate.setLastSeenAt(Instant.now());
    }

    /** Отпечатки вкуса всех карточек каталога — по ним ищется «похожая» существующая карточка. */
    private Map<String, DrinkService.ExistingDrink> indexByFlavor(List<DrinkService.ExistingDrink> drinks) {
        Map<String, DrinkService.ExistingDrink> index = new HashMap<>();
        for (DrinkService.ExistingDrink d : drinks) {
            if (d.name() == null || d.name().isBlank()) continue;
            index.putIfAbsent(flavorKeys.matchKey(d.brand(), d.name()), d);
        }
        return index;
    }

    /** Ссылки-источники карточек каталога: точный признак «эта позиция уже принята». */
    private Map<String, DrinkService.ExistingDrink> indexBySourceUrl(List<DrinkService.ExistingDrink> drinks) {
        Map<String, DrinkService.ExistingDrink> index = new HashMap<>();
        for (DrinkService.ExistingDrink d : drinks) {
            if (d.sourceUrl() != null && !d.sourceUrl().isBlank()) index.putIfAbsent(d.sourceUrl(), d);
        }
        return index;
    }

}
