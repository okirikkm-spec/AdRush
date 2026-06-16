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
    private String brand;
    private String slug;
    private String description;
    private String coverUrl;
    /* Кадрирование обложки (настраивается админом). */
    private String coverFitCard;
    private String coverPosCard;
    private String coverFitModal;
    private String coverPosModal;
    private double averageRating;
    private int reviewCount;
    /** Распределение оценок: балл (1–10) → количество таких оценок. */
    private Map<Integer, Integer> ratingDistribution;
    private List<PhotoDto> photos;

    private static void applyFraming(DrinkResponseDto dto, Drink drink) {
        dto.setCoverFitCard(drink.getCoverFitCard());
        dto.setCoverPosCard(drink.getCoverPosCard());
        dto.setCoverFitModal(drink.getCoverFitModal());
        dto.setCoverPosModal(drink.getCoverPosModal());
    }

    /** Краткая карточка для главной (без полной галереи). */
    public static DrinkResponseDto summary(Drink drink, double avg, int count,
                                           Map<Integer, Integer> distribution, String coverUrl) {
        DrinkResponseDto dto = new DrinkResponseDto();
        dto.setId(drink.getId());
        dto.setName(drink.getName());
        dto.setBrand(drink.getBrand());
        dto.setSlug(drink.getSlug());
        dto.setDescription(drink.getDescription());
        dto.setCoverUrl(coverUrl);
        applyFraming(dto, drink);
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
        dto.setBrand(drink.getBrand());
        dto.setSlug(drink.getSlug());
        dto.setDescription(drink.getDescription());
        dto.setAverageRating(avg);
        dto.setReviewCount(count);
        dto.setRatingDistribution(distribution);
        dto.setPhotos(photos.stream().map(PhotoDto::from).toList());
        dto.setCoverUrl(photos.isEmpty() ? null : photos.get(0).getUrl());
        applyFraming(dto, drink);
        return dto;
    }
}
