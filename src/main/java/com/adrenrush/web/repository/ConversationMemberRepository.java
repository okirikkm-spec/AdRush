package com.adrenrush.web.repository;

import com.adrenrush.web.entity.ConversationMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ConversationMemberRepository extends JpaRepository<ConversationMember, Long> {

    List<ConversationMember> findByUserId(Long userId);

    List<ConversationMember> findByConversationId(Long conversationId);

    Optional<ConversationMember> findByConversationIdAndUserId(Long conversationId, Long userId);

    boolean existsByConversationIdAndUserId(Long conversationId, Long userId);

    long countByConversationId(Long conversationId);

    /** id личной (DIRECT) беседы ровно между двумя пользователями, если она уже существует. */
    @Query("""
        SELECT m.conversation.id FROM ConversationMember m
        WHERE m.conversation.type = com.adrenrush.web.enums.ConversationType.DIRECT
          AND m.user.id IN (:a, :b)
        GROUP BY m.conversation.id
        HAVING COUNT(DISTINCT m.user.id) = 2
        """)
    List<Long> findDirectConversationIds(@Param("a") Long a, @Param("b") Long b);

    /** Содержит ли беседа служебный аккаунт «Система» (такие беседы — только для чтения). */
    @Query("SELECT COUNT(m) > 0 FROM ConversationMember m WHERE m.conversation.id = :convId AND m.user.system = true")
    boolean hasSystemMember(@Param("convId") Long convId);
}
