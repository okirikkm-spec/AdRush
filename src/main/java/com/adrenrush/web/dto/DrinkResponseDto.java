package com.adrenrush.web.dto;

import com.adrenrush.web.entity.Drink;
import com.adrenrush.web.entity.DrinkPhoto;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class DrinkResponseDto {
    private Long id;
    private String name;
    private String slug;
    private String description;
    private String coverUrl;
    private double averageRating;
    private int reviewCount;
    /** Распределение оценок: балл (1–10) → количество таких оценок. */
    private Map<Integer, Integer> ratingDistribution;
    private List<PhotoDto> photos;

    /** Краткая карточка для главной (без полной галереи). */
    public static DrinkResponseDto summary(Drink drink, double avg, int count,
                                           Map<Integer, Integer> distribution, String coverUrl) {
        DrinkResponseDto dto = new DrinkResponseDto();
        dto.setId(drink.getId());
        dto.setName(drink.getName());
        dto.setSlug(drink.getSlug());
        dto.setDescription(drink.getDescription());
        dto.setCoverUrl(coverUrl);
        dto.setAverageRating(avg);
        dto.setReviewCount(count);
        dto.setRatingDistribution(distribution);
        return dto;
    }

    /** Полная карточка со всеми фото. */
    public static DrinkResponseDto full(Drink drink, double avg, int count,
                                        Map<Integer, Integer> distribution, List<DrinkPhoto> photos) {
        DrinkResponseDto dto = new DrinkResponseDto();
        dto.setId(drink.getId());
        dto.setName(drink.getName());
        dto.setSlug(drink.getSlug());
        dto.setDescription(drink.getDescription());
        dto.setAverageRating(avg);
        dto.setReviewCount(count);
        dto.setRatingDistribution(distribution);
        dto.setPhotos(photos.stream().map(PhotoDto::from).toList());
        dto.setCoverUrl(photos.isEmpty() ? null : photos.get(0).getUrl());
        return dto;
    }
}
