package com.adrenrush.web.repository;

import com.adrenrush.web.entity.ReviewReaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReviewReactionRepository extends JpaRepository<ReviewReaction, Long> {

    List<ReviewReaction> findByReviewId(Long reviewId);

    /** Пакетная загрузка реакций для списка отзывов (без N+1). */
    List<ReviewReaction> findByReviewIdIn(Collection<Long> reviewIds);

    Optional<ReviewReaction> findByReviewIdAndUserId(Long reviewId, Long userId);
}
