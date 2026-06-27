package com.adrenrush.web.repository;

import com.adrenrush.web.entity.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    @Modifying
    @Transactional
    @Query("DELETE FROM ChatMessage m WHERE m.conversation.id = :conversationId")
    void deleteByConversationId(@Param("conversationId") Long conversationId);

    /** Удалить все сообщения пользователя (при удалении аккаунта). */
    @Modifying
    @Transactional
    @Query("DELETE FROM ChatMessage m WHERE m.sender.id = :userId")
    void deleteBySenderId(@Param("userId") Long userId);

    /** Удалить все сообщения перечисленных бесед. */
    @Modifying
    @Transactional
    @Query("DELETE FROM ChatMessage m WHERE m.conversation.id IN :ids")
    void deleteByConversationIds(@Param("ids") List<Long> ids);

    List<ChatMessage> findByConversationIdOrderByIdDesc(Long conversationId, Pageable pageable);

    List<ChatMessage> findByConversationIdAndIdLessThanOrderByIdDesc(Long conversationId, Long beforeId, Pageable pageable);

    ChatMessage findTop1ByConversationIdOrderByIdDesc(Long conversationId);

    /** Непрочитанные для участника: пришли после lastReadAt и не от него самого. */
    long countByConversationIdAndCreatedAtAfterAndSenderIdNot(Long conversationId, Instant after, Long senderId);
}
