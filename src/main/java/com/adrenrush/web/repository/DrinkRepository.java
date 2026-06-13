package com.adrenrush.web.repository;

import com.adrenrush.web.entity.Drink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DrinkRepository extends JpaRepository<Drink, Long> {
    Optional<Drink> findBySlug(String slug);
    boolean existsBySourceUrl(String sourceUrl);
}
