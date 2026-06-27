package com.adrenrush.web.repository;

import com.adrenrush.web.entity.ConversationMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

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

    /**
     * id бесед, которые при удалении пользователя надо снести целиком: личные диалоги и группы,
     * где он единственный участник. Возвращает только id (без загрузки управляемых сущностей,
     * иначе они зависнут в persistence-контексте со ссылкой на удаляемого User).
     */
    @Query("""
        SELECT m.conversation.id FROM ConversationMember m
        WHERE m.user.id = :userId
          AND ( m.conversation.type = com.adrenrush.web.enums.ConversationType.DIRECT
                OR (SELECT COUNT(m2) FROM ConversationMember m2 WHERE m2.conversation.id = m.conversation.id) <= 1 )
        """)
    List<Long> findConversationIdsToPurge(@Param("userId") Long userId);

    /** Удалить все участия пользователя (при удалении аккаунта). */
    @Modifying
    @Transactional
    @Query("DELETE FROM ConversationMember m WHERE m.user.id = :userId")
    void deleteByUserId(@Param("userId") Long userId);

    /** Удалить всех участников перечисленных бесед. */
    @Modifying
    @Transactional
    @Query("DELETE FROM ConversationMember m WHERE m.conversation.id IN :ids")
    void deleteByConversationIds(@Param("ids") List<Long> ids);
}
