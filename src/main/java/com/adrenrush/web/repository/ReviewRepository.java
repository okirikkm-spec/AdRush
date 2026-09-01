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

    /** Последний отзыв пользователя — «был активен» в карточке мини-профиля. */
    Optional<Review> findFirstByUserIdOrderByUpdatedAtDesc(Long userId);

    /** Самая высокая оценка пользователя (при равных — поставленная позже). */
    Optional<Review> findFirstByUserIdOrderByRatingDescUpdatedAtDesc(Long userId);

    int countByUserId(Long userId);

    void deleteByUserId(Long userId);

    void deleteByDrinkId(Long drinkId);

    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.drink.id = :drinkId")
    Double getAverageByDrinkId(@Param("drinkId") Long drinkId);

    /**
     * Средняя оценка по всему сайту (null — отзывов нет вообще). Точка отсчёта для байесовского
     * сглаживания: к ней притягивается рейтинг напитков, у которых оценок ещё мало.
     */
    @Query("SELECT AVG(r.rating) FROM Review r")
    Double getGlobalAverage();

    /** Средняя оценка, которую ставит сам пользователь (null — отзывов нет). */
    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.user.id = :userId")
    Double getAverageByUserId(@Param("userId") Long userId);

    /** Оценки пользователя парами (id энергетика, балл) — без подъёма самих отзывов. */
    @Query("SELECT r.drink.id, r.rating FROM Review r WHERE r.user.id = :userId")
    List<Object[]> getRatingsByUserId(@Param("userId") Long userId);

    @Query("SELECT COUNT(r) FROM Review r WHERE r.drink.id = :drinkId")
    Integer getCountByDrinkId(@Param("drinkId") Long drinkId);

    /** Распределение оценок по баллам: пары (балл, количество). */
    @Query("SELECT r.rating, COUNT(r) FROM Review r WHERE r.drink.id = :drinkId GROUP BY r.rating")
    List<Object[]> getRatingDistribution(@Param("drinkId") Long drinkId);
}
