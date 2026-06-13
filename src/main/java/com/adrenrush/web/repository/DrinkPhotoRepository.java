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

    /** Открепляет фото от удаляемого пользователя (фото остаётся в галерее). */
    @Modifying
    @Transactional
    @Query("UPDATE DrinkPhoto p SET p.uploadedBy = null WHERE p.uploadedBy.id = :userId")
    void detachUploader(@Param("userId") Long userId);
}
