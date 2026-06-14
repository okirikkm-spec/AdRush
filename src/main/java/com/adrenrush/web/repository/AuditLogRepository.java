package com.adrenrush.web.repository;

import com.adrenrush.web.entity.AuditLog;
import com.adrenrush.web.enums.AuditAction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    /** Поиск с необязательными фильтрами: актор, тип действия, цель и свободный текст. */
    @Query("""
        SELECT a FROM AuditLog a
        WHERE (:actorId IS NULL OR a.actorId = :actorId)
          AND (:action IS NULL OR a.action = :action)
          AND (:targetId IS NULL OR a.targetId = :targetId)
          AND (:q IS NULL OR (
                LOWER(a.targetLabel)  LIKE LOWER(CONCAT('%', :q, '%'))
             OR LOWER(a.actorUsername) LIKE LOWER(CONCAT('%', :q, '%'))
             OR LOWER(a.details)       LIKE LOWER(CONCAT('%', :q, '%'))
          ))
        ORDER BY a.createdAt DESC
        """)
    Page<AuditLog> search(@Param("actorId") Long actorId,
                          @Param("action") AuditAction action,
                          @Param("targetId") Long targetId,
                          @Param("q") String q,
                          Pageable pageable);

    /** Уникальные акторы, встречающиеся в журнале — для выпадающего фильтра «кто». */
    @Query("SELECT DISTINCT a.actorId, a.actorUsername FROM AuditLog a ORDER BY a.actorUsername")
    List<Object[]> distinctActors();
}
