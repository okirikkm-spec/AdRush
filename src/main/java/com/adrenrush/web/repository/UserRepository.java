package com.adrenrush.web.repository;

import com.adrenrush.web.entity.User;
import com.adrenrush.web.enums.RoleEnum;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
    boolean existsByRole(RoleEnum role);

    List<User> findAllByOrderByIdAsc();

    /**
     * Аккаунты, пересекающиеся с переданными IP или отпечатками устройства (кроме самого пользователя).
     * Коллекции не должны быть пустыми (используйте sentinel-значение).
     */
    @Query("""
        SELECT u FROM User u
        WHERE u.id <> :excludeId
          AND ( (u.registrationIp IS NOT NULL AND u.registrationIp IN :ips)
             OR (u.lastIp IS NOT NULL AND u.lastIp IN :ips)
             OR (u.registrationFingerprint IS NOT NULL AND u.registrationFingerprint IN :fps)
             OR (u.lastFingerprint IS NOT NULL AND u.lastFingerprint IN :fps) )
        ORDER BY u.id ASC
        """)
    List<User> findLinked(@Param("ips") Collection<String> ips,
                          @Param("fps") Collection<String> fps,
                          @Param("excludeId") Long excludeId);
}
