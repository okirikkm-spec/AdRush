package com.adrenrush.web.service;

import com.adrenrush.web.dto.AuditLogDto;
import com.adrenrush.web.entity.AuditLog;
import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.AuditAction;
import com.adrenrush.web.enums.AuditTargetType;
import com.adrenrush.web.repository.AuditLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Журнал аудита: фиксация действий модераторов и их выборка с фильтрами. */
@Service
@RequiredArgsConstructor
public class AuditService {

    private final AuditLogRepository auditLogRepository;

    /** Записать действие в журнал. Вызывается из сервисов после успешной операции. */
    @Transactional
    public void record(User actor, AuditAction action, AuditTargetType targetType,
                       Long targetId, String targetLabel, String details) {
        AuditLog log = new AuditLog();
        if (actor != null) {
            log.setActorId(actor.getId());
            log.setActorUsername(actor.getUsername());
        } else {
            log.setActorUsername("system");
        }
        log.setAction(action);
        log.setTargetType(targetType);
        log.setTargetId(targetId);
        log.setTargetLabel(targetLabel);
        log.setDetails(details);
        auditLogRepository.save(log);
    }

    /** Удобный помощник для действий над пользователем. */
    @Transactional
    public void recordUser(User actor, AuditAction action, User target, String details) {
        record(actor, action, AuditTargetType.USER, target.getId(), target.getUsername(), details);
    }

    /** Выборка журнала с фильтрами: кто (actorId), что (action), с кем (targetId), свободный поиск (q). */
    @Transactional(readOnly = true)
    public Map<String, Object> search(Long actorId, AuditAction action, Long targetId, String q, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(Math.max(1, size), 200);
        Page<AuditLog> result = auditLogRepository.search(
            actorId, action, targetId,
            (q == null || q.isBlank()) ? null : q.trim(),
            PageRequest.of(safePage, safeSize));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", result.getContent().stream().map(AuditLogDto::from).toList());
        out.put("total", result.getTotalElements());
        out.put("page", safePage);
        out.put("size", safeSize);
        out.put("totalPages", result.getTotalPages());
        return out;
    }

    /** Список акторов журнала для фильтра «кто делал». */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> actors() {
        List<Map<String, Object>> list = new ArrayList<>();
        for (Object[] row : auditLogRepository.distinctActors()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", row[0]);          // может быть null (системное действие)
            m.put("username", row[1]);
            list.add(m);
        }
        return list;
    }
}
