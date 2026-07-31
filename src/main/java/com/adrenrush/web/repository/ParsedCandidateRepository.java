package com.adrenrush.web.repository;

import com.adrenrush.web.entity.ParsedCandidate;
import com.adrenrush.web.enums.CandidateStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ParsedCandidateRepository extends JpaRepository<ParsedCandidate, Long> {

    Optional<ParsedCandidate> findBySourceUrl(String sourceUrl);

    /** Список для окна приёмки: сначала непохожие на существующие карточки, затем по названию. */
    List<ParsedCandidate> findByStatusOrderBySimilarToAscNameAsc(CandidateStatus status);

    long countByStatus(CandidateStatus status);
}
