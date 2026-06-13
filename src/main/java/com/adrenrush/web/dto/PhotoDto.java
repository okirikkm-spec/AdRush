package com.adrenrush.web.dto;

import com.adrenrush.web.entity.DrinkPhoto;
import lombok.Data;

@Data
public class PhotoDto {
    private Long id;
    private String url;
    private String source;
    private Long uploadedById;

    public static PhotoDto from(DrinkPhoto photo) {
        PhotoDto dto = new PhotoDto();
        dto.setId(photo.getId());
        dto.setUrl(photo.getUrl());
        dto.setSource(photo.getSource().name());
        dto.setUploadedById(photo.getUploadedBy() != null ? photo.getUploadedBy().getId() : null);
        return dto;
    }
}
