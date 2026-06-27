package com.adrenrush.web.repository;

import com.adrenrush.web.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface ConversationRepository extends JpaRepository<Conversation, Long> {

    /** Обнулить создателя у бесед, созданных пользователем (перед удалением аккаунта — FK). */
    @Modifying
    @Transactional
    @Query("UPDATE Conversation c SET c.createdBy = null WHERE c.createdBy.id = :userId")
    void clearCreatedBy(@Param("userId") Long userId);

    /** Удалить перечисленные беседы (после удаления их сообщений и участников). */
    @Modifying
    @Transactional
    @Query("DELETE FROM Conversation c WHERE c.id IN :ids")
    void deleteByIds(@Param("ids") List<Long> ids);
}
