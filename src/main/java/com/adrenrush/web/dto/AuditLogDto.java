package com.adrenrush.web.dto;

import com.adrenrush.web.entity.AuditLog;
import lombok.Data;

import java.time.Instant;

@Data
public class AuditLogDto {
    private Long id;
    private Long actorId;
    private String actorUsername;
    private String action;
    private String targetType;
    private Long targetId;
    private String targetLabel;
    private String details;
    private Instant createdAt;

    public static AuditLogDto from(AuditLog a) {
        AuditLogDto d = new AuditLogDto();
        d.setId(a.getId());
        d.setActorId(a.getActorId());
        d.setActorUsername(a.getActorUsername());
        d.setAction(a.getAction().name());
        d.setTargetType(a.getTargetType() != null ? a.getTargetType().name() : null);
        d.setTargetId(a.getTargetId());
        d.setTargetLabel(a.getTargetLabel());
        d.setDetails(a.getDetails());
        d.setCreatedAt(a.getCreatedAt());
        return d;
    }
}
