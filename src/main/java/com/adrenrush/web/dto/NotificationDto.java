package com.adrenrush.web.dto;

import com.adrenrush.web.entity.Notification;
import lombok.Data;

import java.time.Instant;

@Data
public class NotificationDto {
    private Long id;
    private String type;
    private String message;
    private boolean read;
    private Instant createdAt;

    public static NotificationDto from(Notification n) {
        NotificationDto dto = new NotificationDto();
        dto.setId(n.getId());
        dto.setType(n.getType());
        dto.setMessage(n.getMessage());
        dto.setRead(n.isRead());
        dto.setCreatedAt(n.getCreatedAt());
        return dto;
    }
}
