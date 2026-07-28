package com.adrenrush.web.repository;

import com.adrenrush.web.entity.EmailVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface EmailVerificationRepository extends JpaRepository<EmailVerification, Long> {

    Optional<EmailVerification> findByUserId(Long userId);

    void deleteByUserId(Long userId);

    /**
     * Есть ли живая заявка на этот адрес у другого пользователя.
     * Не даёт двум людям одновременно подтверждать одну почту (гонка до unique-констрейнта).
     */
    boolean existsByEmailAndExpiresAtAfterAndUserIdNot(String email, Instant moment, Long userId);
}
