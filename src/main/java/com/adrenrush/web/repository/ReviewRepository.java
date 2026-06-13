package com.adrenrush.web.repository;

import com.adrenrush.web.entity.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {

    Optional<Review> findByDrinkIdAndUserId(Long drinkId, Long userId);

    List<Review> findByDrinkIdOrderByUpdatedAtDesc(Long drinkId);

    List<Review> findByUserIdOrderByUpdatedAtDesc(Long userId);

    int countByUserId(Long userId);

    void deleteByUserId(Long userId);

    void deleteByDrinkId(Long drinkId);

    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.drink.id = :drinkId")
    Double getAverageByDrinkId(@Param("drinkId") Long drinkId);

    @Query("SELECT COUNT(r) FROM Review r WHERE r.drink.id = :drinkId")
    Integer getCountByDrinkId(@Param("drinkId") Long drinkId);

    /** Распределение оценок по баллам: пары (балл, количество). */
    @Query("SELECT r.rating, COUNT(r) FROM Review r WHERE r.drink.id = :drinkId GROUP BY r.rating")
    List<Object[]> getRatingDistribution(@Param("drinkId") Long drinkId);
}
