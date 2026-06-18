package com.adrenrush.web.repository;

import com.adrenrush.web.entity.DrinkPhoto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface DrinkPhotoRepository extends JpaRepository<DrinkPhoto, Long> {
    List<DrinkPhoto> findByDrinkIdOrderByPositionAscIdAsc(Long drinkId);
    Integer countByDrinkId(Long drinkId);

    /** Все id фотографий (для разовой оптимизации медиа — без загрузки сущностей целиком). */
    @Query("SELECT p.id FROM DrinkPhoto p ORDER BY p.id")
    List<Long> findAllIds();

    /** id энергетика по id фото (чтобы не трогать ленивую связь вне транзакции). */
    @Query("SELECT p.drink.id FROM DrinkPhoto p WHERE p.id = :id")
    Long findDrinkIdById(@Param("id") Long id);

    /** Открепляет фото от удаляемого пользователя (фото остаётся в галерее). */
    @Modifying
    @Transactional
    @Query("UPDATE DrinkPhoto p SET p.uploadedBy = null WHERE p.uploadedBy.id = :userId")
    void detachUploader(@Param("userId") Long userId);
}
